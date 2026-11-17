"use client";

import { useLayoutEffect } from "react";
import { COLOR_TOKENS, isThemePreset } from "@/lib/theme-tokens";

const SESSION_STORAGE_KEY = "notebooks:v2:client-session";

type StoredPreferences = {
  customAccent?: unknown;
  customBackground?: unknown;
  mode?: unknown;
  preset?: unknown;
};

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

export function ThemeBootstrap() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    try {
      root.dataset.readerOutline = localStorage.getItem("notebooks:reader:outline") === "closed" ? "closed" : "open";
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object" || !("preferences" in parsed)) return;
      const preferences = parsed.preferences as StoredPreferences;
      const preset = isThemePreset(preferences.preset) ? preferences.preset : "midnight";
      const mode = preferences.mode === "light" ? "light" : "dark";
      const tokens = COLOR_TOKENS[preset][mode];

      root.dataset.mode = mode;
      root.style.setProperty("--page", isHexColor(preferences.customBackground) ? preferences.customBackground : tokens.background);
      root.style.setProperty("--surface", tokens.surface);
      root.style.setProperty("--accent", isHexColor(preferences.customAccent) ? preferences.customAccent : tokens.accent);
      root.style.setProperty("--palette-main", tokens.main);
      root.style.setProperty("--partner", tokens.partner);
      root.style.setProperty("--highlight", tokens.highlight);
      root.style.setProperty("--text", tokens.text);
      root.style.setProperty("--muted", tokens.muted);
    } catch (error) {
      console.error("Could not initialize the saved theme", error);
    }
  }, []);

  return null;
}
