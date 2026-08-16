// Minimal AI-assisted Markdown parser and allowlist validator
// This is a skeleton to be expanded in Phase 5. It detects fenced interactive blocks
// of the form ```ai-<type>
// content
// ```
// and validates the block type against an allowlist.

export const ALLOWED_BLOCKS = new Set(['quiz', 'flashcard', 'accordion', 'desmos']);

export function parseInteractiveBlocks(markdown: string) {
  const blocks: Array<{ type: string; content: string; start: number; end: number }> = [];
  const fenceRe = /```ai-([a-zA-Z0-9_-]+)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(markdown)) !== null) {
    blocks.push({ type: m[1], content: m[2], start: m.index, end: fenceRe.lastIndex });
  }
  return blocks;
}

export function validateBlocks(markdown: string) {
  const blocks = parseInteractiveBlocks(markdown);
  const errors: string[] = [];
  for (const b of blocks) {
    if (!ALLOWED_BLOCKS.has(b.type)) {
      errors.push(`Disallowed interactive block type: ${b.type}`);
    }
    // Additional validation can be added here (size, nested content, JSON schema checks)
    if (b.content.length > 10000) errors.push(`Interactive block ${b.type} too large`);
    // Type-specific lightweight schema checks
    try {
      const trimmed = String(b.content || '').trim();
      const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
      if (looksLikeJson) {
        const parsed = JSON.parse(b.content);
        const schema = SCHEMAS[b.type];
        if (schema) {
          const schemaErrors = validateSchema(schema, parsed);
          if (schemaErrors.length) {
            errors.push(`${b.type} schema validation failed: ${schemaErrors.slice(0,3).join('; ')}`);
          }
        } else {
          // fallback: keep lightweight checks for known types
          if (b.type === 'quiz') {
            if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) errors.push('quiz block must contain a non-empty questions array');
          }
          if (b.type === 'flashcard') {
            if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) errors.push('flashcard block must contain a non-empty cards array');
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`interactive block ${b.type} contains invalid JSON: ${message}`);
    }
  }
  return { ok: errors.length === 0, errors, blocks };
}

// Sanitize interactive block content by escaping HTML and removing script tags.
export function sanitizeBlocks(markdown: string) {
  const fenceRe = /```ai-([a-zA-Z0-9_-]+)\n([\s\S]*?)```/g;
  let changed = false;
  const details: string[] = [];
  const sanitized = markdown.replace(fenceRe, (full, type, content) => {
    const errs: string[] = [];
    if (!ALLOWED_BLOCKS.has(type)) {
      errs.push(`removed-disallowed-type:${type}`);
      // drop the block entirely
      changed = true;
      details.push(`Removed disallowed block type ${type}`);
      return `<!-- removed interactive block of disallowed type ${type} -->`;
    }
    if (content.length > 10000) {
      // truncate
      content = content.slice(0, 10000);
      errs.push('truncated');
      changed = true;
      details.push(`Truncated block ${type} to 10000 chars`);
    }
    // remove any <script>...</script> occurrences
    const before = content;
    content = content.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    if (content !== before) {
      errs.push('script-removed');
      changed = true;
      details.push(`Removed <script> from block ${type}`);
    }
    // escape angle brackets to avoid HTML injection when rendered
    const escaped = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (errs.length === 0 && escaped === content) return full; // unchanged
    return `<!-- sanitized ai-${type} block -->\n\`\`\`ai-${type}\n${escaped}\n\`\`\``;
  });
  return { sanitized, changed, details };
}

// Load JSON schema fixtures for block types when available
import fs from 'fs';
import path from 'path';

const SCHEMAS: Record<string, any> = {};
try {
  const schemaDir = path.join(__dirname, 'schemas');
  if (fs.existsSync(schemaDir)) {
    for (const f of fs.readdirSync(schemaDir)) {
      if (f.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(schemaDir, f), 'utf8');
          const name = f.replace(/\.json$/, '');
          SCHEMAS[name] = JSON.parse(content);
        } catch (e) {
          // ignore
        }
      }
    }
  }
} catch (e) {
  // ignore
}

function validateSchema(schema: any, value: any, pathPrefix = ''): string[] {
  const errors: string[] = [];
  if (!schema) return errors;
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push(`${pathPrefix || 'root'} must be object`);
      return errors;
    }
    if (Array.isArray(schema.required)) {
      for (const req of schema.required) {
        if (!(req in value)) errors.push(`${pathPrefix || 'root'}.${req} is required`);
      }
    }
    if (schema.properties) {
      for (const [k, propSchema] of Object.entries(schema.properties)) {
        if (k in value) {
          errors.push(...validateSchema(propSchema, (value as any)[k], `${pathPrefix ? pathPrefix + '.' : ''}${k}`));
        }
      }
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${pathPrefix || 'root'} must be array`);
      return errors;
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        errors.push(...validateSchema(schema.items, value[i], `${pathPrefix}[${i}]`));
      }
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') errors.push(`${pathPrefix || 'value'} must be string`);
  }
  return errors;
}

export default { parseInteractiveBlocks, validateBlocks, ALLOWED_BLOCKS };
