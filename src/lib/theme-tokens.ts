export type ThemePreset =
  | "midnight" | "paper" | "forest" | "violet"
  | "navy-silver" | "forest-cream" | "charcoal-gold" | "plum-blush" | "teal-sand" | "maroon-ivory"
  | "midnight-aurora" | "sunset" | "ocean" | "meadow" | "royal" | "espresso";

export type ColorTokens = {
  background: string;
  surface: string;
  main: string;
  accent: string;
  partner: string;
  highlight: string;
  text: string;
  muted: string;
};

const MONOTONE_TOKENS: Record<Extract<ThemePreset, "midnight" | "paper" | "forest" | "violet">, Record<"light" | "dark", ColorTokens>> = {
  midnight: {
    dark: { background: "#0b1118", surface: "#121c26", main: "#76e0bd", accent: "#76e0bd", partner: "#9bb9b0", highlight: "#d8fff1", text: "#e7f2ef", muted: "#a7bbb6" },
    light: { background: "#f3f7f5", surface: "#ffffff", main: "#087f5b", accent: "#087f5b", partner: "#466e60", highlight: "#1d5948", text: "#182b26", muted: "#52675f" },
  },
  paper: {
    dark: { background: "#191714", surface: "#24211c", main: "#f2bd78", accent: "#f2bd78", partner: "#ceb997", highlight: "#ffe2b4", text: "#f5eee2", muted: "#c5b9a7" },
    light: { background: "#fbf7ef", surface: "#fffdf8", main: "#a65c16", accent: "#a65c16", partner: "#725b3c", highlight: "#75400e", text: "#2b251e", muted: "#6d6252" },
  },
  forest: {
    dark: { background: "#0c1713", surface: "#13231b", main: "#a8d875", accent: "#a8d875", partner: "#bfdba5", highlight: "#e0ffc0", text: "#eaf3e4", muted: "#b2c2aa" },
    light: { background: "#f2f7ee", surface: "#ffffff", main: "#4b7f2a", accent: "#4b7f2a", partner: "#526a43", highlight: "#315b1b", text: "#1d2b19", muted: "#5e7055" },
  },
  violet: {
    dark: { background: "#12111d", surface: "#1c1a2a", main: "#c5a4ff", accent: "#c5a4ff", partner: "#d6c3f4", highlight: "#efdbff", text: "#f1edfc", muted: "#bbb3cb" },
    light: { background: "#f7f4fc", surface: "#ffffff", main: "#7046b5", accent: "#7046b5", partner: "#65548a", highlight: "#4e2c89", text: "#29233a", muted: "#655d77" },
  },
};

function makePaletteTokens(
  main: string,
  partner: string,
  highlight: string,
  darkBackground: string,
  lightBackground: string,
): Record<"light" | "dark", ColorTokens> {
  return {
    dark: {
      background: darkBackground,
      surface: `color-mix(in srgb, ${darkBackground} 80%, white)`,
      main,
      accent: highlight,
      partner,
      highlight,
      text: "#f5f7fb",
      muted: "#b5becb",
    },
    light: {
      background: lightBackground,
      surface: "#ffffff",
      main,
      accent: main,
      partner,
      highlight,
      text: "#1c2430",
      muted: "#566170",
    },
  };
}

export const COLOR_TOKENS: Record<ThemePreset, Record<"light" | "dark", ColorTokens>> = {
  ...MONOTONE_TOKENS,
  "navy-silver": makePaletteTokens("#1E3A8A", "#CBD5E1", "#93C5FD", "#0c1428", "#f3f6fb"),
  "forest-cream": makePaletteTokens("#166534", "#FEF3C7", "#A3E635", "#0b1c13", "#f4f7ed"),
  "charcoal-gold": makePaletteTokens("#27272A", "#F59E0B", "#FCD34D", "#111113", "#f5f5f5"),
  "plum-blush": makePaletteTokens("#6B21A8", "#FBCFE8", "#E9A8FF", "#1a1025", "#faf4fb"),
  "teal-sand": makePaletteTokens("#0F766E", "#E7D5B5", "#7DD3C7", "#0b1b1a", "#f4f7f5"),
  "maroon-ivory": makePaletteTokens("#7F1D1D", "#FAF5E9", "#FCA5A5", "#211112", "#faf7f0"),
  "midnight-aurora": makePaletteTokens("#4338CA", "#2DD4BF", "#F472B6", "#10102b", "#f4f3fc"),
  sunset: makePaletteTokens("#EA580C", "#E11D48", "#7C3AED", "#24110f", "#fff5f1"),
  ocean: makePaletteTokens("#0C4A6E", "#22D3EE", "#FB7185", "#081c2a", "#eff9fc"),
  meadow: makePaletteTokens("#15803D", "#BEF264", "#38BDF8", "#0c2118", "#f3f9ef"),
  royal: makePaletteTokens("#5B21B6", "#FBBF24", "#E2E8F0", "#19102b", "#f7f4fc"),
  espresso: makePaletteTokens("#78350F", "#FEF3C7", "#EA580C", "#21140e", "#fbf6ed"),
};

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === "string" && Object.hasOwn(COLOR_TOKENS, value);
}
