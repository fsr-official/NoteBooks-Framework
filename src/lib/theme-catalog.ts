export const THEME_ALLOWED_KEYS = new Set([
  'accent', 'accentHover', 'accentSubtle', 'surface', 'surfaceMuted', 'text', 'textMuted',
  'code', 'font', 'bg', 'panel', 'border', 'borderSubtle', 'radius', 'density', 'shadow',
  'texture', 'heading', 'hover', 'selected', 'btnBg', 'btnHover'
]);

export type ThemeMode = 'dark' | 'light';
export type ThemeTokens = Record<string, string>;

export interface ThemePreset {
  slug: string;
  name: string;
  description: string;
  tokens: ThemeTokens;
  variants: Record<ThemeMode, ThemeTokens>;
  source: 'built-in' | 'database';
}

function preset(
  slug: string,
  name: string,
  description: string,
  dark: ThemeTokens,
  light: ThemeTokens
): ThemePreset {
  return { slug, name, description, tokens: dark, variants: { dark, light }, source: 'built-in' };
}

export const BUILTIN_THEME_PRESETS: ThemePreset[] = [
  preset('futuristic', 'Futuristic', 'The default reading-room family with emerald accents.',
    { accent: '#34d399', surface: '#050c14', text: '#dbe7e5', code: '#010307', font: 'Inter', bg: '#02050a', panel: '#07111b', border: '#112a3b', radius: '14px', density: '1', shadow: '0 18px 55px rgba(0,0,0,.38)', texture: 'grid', heading: 'Inter' },
    { accent: '#047857', surface: '#f4faf8', text: '#102a24', code: '#e7f3ef', font: 'Inter', bg: '#f8fcfb', panel: '#ffffff', border: '#b8d8cc', radius: '14px', density: '1', shadow: '0 14px 38px rgba(16,42,36,.12)', texture: 'none', heading: 'Inter' }),
  preset('contrast', 'Dark contrast', 'Maximum separation for focused reading and low-light environments.',
    { accent: '#f8fafc', surface: '#050505', text: '#ffffff', code: '#000000', font: 'system-ui', bg: '#000000', panel: '#0a0a0a', border: '#5b5b5b', radius: '2px', density: '.92', shadow: '0 0 0 transparent', texture: 'none', heading: 'system-ui' },
    { accent: '#000000', surface: '#ffffff', text: '#000000', code: '#f5f5f5', font: 'system-ui', bg: '#ffffff', panel: '#ffffff', border: '#000000', radius: '2px', density: '.92', shadow: '0 0 0 transparent', texture: 'none', heading: 'system-ui' }),
  preset('neon', 'Neon', 'A vivid violet and pink family for focused sessions.',
    { accent: '#f472b6', surface: '#17112d', text: '#fdf4ff', code: '#0b0618', font: 'JetBrains Mono', bg: '#0b0618', panel: '#21143b', border: '#8b5cf6', radius: '22px', density: '1.12', shadow: '0 0 28px rgba(244,114,182,.24)', texture: 'scanlines', heading: 'JetBrains Mono' },
    { accent: '#a21caf', surface: '#fff7ff', text: '#29132f', code: '#f8eafa', font: 'JetBrains Mono', bg: '#fffaff', panel: '#ffffff', border: '#d8a8e6', radius: '22px', density: '1.12', shadow: '0 12px 30px rgba(162,28,175,.14)', texture: 'none', heading: 'JetBrains Mono' }),
  preset('professional', 'Professional', 'A restrained blue-gray family for long study and review sessions.',
    { accent: '#60a5fa', surface: '#172033', text: '#e5edf8', code: '#0d1524', font: 'Inter', bg: '#111827', panel: '#1f2937', border: '#334155', radius: '8px', density: '.98', shadow: '0 10px 28px rgba(0,0,0,.2)', texture: 'none', heading: 'Inter' },
    { accent: '#1d4ed8', surface: '#f1f5fb', text: '#162033', code: '#eaf0f8', font: 'Inter', bg: '#f7faff', panel: '#ffffff', border: '#b9c9df', radius: '8px', density: '.98', shadow: '0 10px 28px rgba(31,41,55,.12)', texture: 'none', heading: 'Inter' }),
  preset('classic', 'Classic', 'A quiet paper-like family for bright reading environments.',
    { accent: '#0969da', surface: '#ffffff', text: '#1f2328', code: '#f6f8fa', font: 'system-ui', bg: '#f6f8fa', panel: '#ffffff', border: '#d0d7de', radius: '6px', density: '.94', shadow: '0 1px 2px rgba(31,35,40,.08)', texture: 'none', heading: 'system-ui' },
    { accent: '#0969da', surface: '#ffffff', text: '#1f2328', code: '#f6f8fa', font: 'system-ui', bg: '#f6f8fa', panel: '#ffffff', border: '#d0d7de', radius: '6px', density: '.94', shadow: '0 1px 2px rgba(31,35,40,.08)', texture: 'none', heading: 'system-ui' })
];

export function sanitizeThemeTokens(input: unknown): ThemeTokens {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output: ThemeTokens = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!THEME_ALLOWED_KEYS.has(key) || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.length <= 160 && !/[<>;{}]/.test(trimmed)) output[key] = trimmed;
  }
  return output;
}

export function themePresetBySlug(slug: string): ThemePreset | null {
  return BUILTIN_THEME_PRESETS.find((preset) => preset.slug === slug) || null;
}

export function themeTokensForMode(preset: ThemePreset, mode: ThemeMode): ThemeTokens {
  return preset.variants[mode] || preset.variants.dark;
}
