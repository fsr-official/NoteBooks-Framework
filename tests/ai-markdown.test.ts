import { describe, it, expect } from 'vitest';
import { validateBlocks, ALLOWED_BLOCKS, sanitizeBlocks } from '../src/lib/ai-markdown';

describe('AI Markdown parser', () => {
  it('accepts allowed blocks', () => {
    const md = 'Intro\n```ai-quiz\nQ: 1+1?\nA:2\n```\n';
    const res = validateBlocks(md);
    expect(res.ok).toBe(true);
    expect(res.blocks.length).toBe(1);
    expect(ALLOWED_BLOCKS.has(res.blocks[0].type)).toBe(true);
  });

  it('rejects disallowed blocks', () => {
    const md = 'Intro\n```ai-exploit\n<script>alert(1)</script>\n```\n';
    const res = validateBlocks(md);
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('sanitizes blocks: removes scripts and escapes HTML', () => {
    const md = 'Start\n```ai-quiz\n<div>hello</div>\n<script>alert(1)</script>\n```\nEnd';
    const s = sanitizeBlocks(md);
    expect(s.changed).toBe(true);
    expect(s.details.some(d => d.includes('script'))).toBe(true);
    expect(s.sanitized.includes('&lt;div&gt;hello&lt;/div&gt;')).toBe(true);
    expect(s.sanitized.includes('script')).toBe(false);
  });

  it('validates quiz schema JSON', () => {
    const good = '```ai-quiz\n{"questions": [{"q":"1+1?","a":"2"}]}\n```';
    const bad = '```ai-quiz\n{"questions": [{"q":1,"a":2}]}\n```';
    expect(validateBlocks(good).ok).toBe(true);
    const r = validateBlocks(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('quiz'))).toBe(true);
  });

  it('validates flashcard schema JSON', () => {
    const good = '```ai-flashcard\n{"cards": [{"front":"Q","back":"A"}]}\n```';
    const bad = '```ai-flashcard\n{"cards": [{"front":1,"back":2}]}\n```';
    expect(validateBlocks(good).ok).toBe(true);
    const r = validateBlocks(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('flashcard') || e.includes('cards'))).toBe(true);
  });
});
