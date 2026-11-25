import { COLOR_TOKENS, isThemePreset, type ThemePreset } from "@/lib/theme-tokens";

export const CLIENT_SESSION_STORAGE_KEY = "notebooks:v2:client-session";
export const THEME_CHANGE_EVENT = "notebooks:theme-change";

export type ThemeMode = "light" | "dark";

export interface ThemePreferences {
  preset: ThemePreset;
  mode: ThemeMode;
  customAccent: string;
  customBackground: string;
}

const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  preset: "midnight",
  mode: "dark",
  customAccent: "",
  customBackground: "",
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const isHexColor = (value: unknown): value is string => (
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
);

export const THEME_PRESETS = Object.keys(COLOR_TOKENS) as ThemePreset[];

export function normalizeThemePreferences(value: unknown): ThemePreferences {
  const saved = isRecord(value) ? value : {};
  return {
    preset: isThemePreset(saved.preset) ? saved.preset : DEFAULT_THEME_PREFERENCES.preset,
    mode: saved.mode === "light" ? "light" : "dark",
    customAccent: isHexColor(saved.customAccent) ? saved.customAccent : "",
    customBackground: isHexColor(saved.customBackground) ? saved.customBackground : "",
  };
}

function parseClientSession(serialized: string): Record<string, unknown> {
  let candidate: unknown;
  try {
    candidate = JSON.parse(serialized);
  } catch {
    throw new Error("Saved study preferences are not valid JSON.");
  }
  if (!isRecord(candidate) || typeof candidate.id !== "string" || !isRecord(candidate.preferences)) {
    throw new Error("Saved study preferences have an invalid format.");
  }
  return candidate;
}

export function readThemePreferences(storage: Pick<Storage, "getItem">): ThemePreferences {
  const serialized = storage.getItem(CLIENT_SESSION_STORAGE_KEY);
  if (!serialized) return { ...DEFAULT_THEME_PREFERENCES };
  return normalizeThemePreferences(parseClientSession(serialized).preferences);
}

export function saveThemePreferences(
  storage: Pick<Storage, "getItem" | "setItem">,
  update: Partial<ThemePreferences>,
): ThemePreferences {
  if (update.preset !== undefined && !isThemePreset(update.preset)) {
    throw new Error("Choose a supported color theme.");
  }
  if (update.mode !== undefined && update.mode !== "light" && update.mode !== "dark") {
    throw new Error("Choose light or dark mode.");
  }
  if (update.customAccent !== undefined && update.customAccent !== "" && !isHexColor(update.customAccent)) {
    throw new Error("Choose a valid accent color.");
  }
  if (update.customBackground !== undefined && update.customBackground !== "" && !isHexColor(update.customBackground)) {
    throw new Error("Choose a valid background color.");
  }

  const serialized = storage.getItem(CLIENT_SESSION_STORAGE_KEY);
  const session = serialized ? parseClientSession(serialized) : {};
  const savedPreferences = isRecord(session.preferences) ? session.preferences : {};
  const next = { ...normalizeThemePreferences(savedPreferences), ...update };
  const sessionId = typeof session.id === "string" ? session.id : createSessionId();

  storage.setItem(CLIENT_SESSION_STORAGE_KEY, JSON.stringify({
    ...session,
    id: sessionId,
    preferences: {
      ...savedPreferences,
      ...next,
      fileHistory: Array.isArray(savedPreferences.fileHistory) ? savedPreferences.fileHistory : [],
    },
  }));
  return next;
}

export function applyThemeTokens(
  root: Pick<HTMLElement, "dataset" | "style">,
  preferences: ThemePreferences,
): void {
  const tokens = COLOR_TOKENS[preferences.preset][preferences.mode];
  root.dataset.mode = preferences.mode;
  root.dataset.themePreset = preferences.preset;
  root.style.setProperty("--page", preferences.customBackground || tokens.background);
  root.style.setProperty("--surface", tokens.surface);
  root.style.setProperty("--accent", preferences.customAccent || tokens.accent);
  root.style.setProperty("--palette-main", tokens.main);
  root.style.setProperty("--partner", tokens.partner);
  root.style.setProperty("--highlight", tokens.highlight);
  root.style.setProperty("--text", tokens.text);
  root.style.setProperty("--muted", tokens.muted);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function createSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
