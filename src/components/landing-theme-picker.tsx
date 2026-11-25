"use client";

import { useState, useSyncExternalStore } from "react";
import {
  applyThemeTokens,
  CLIENT_SESSION_STORAGE_KEY,
  normalizeThemePreferences,
  readThemePreferences,
  saveThemePreferences,
  THEME_CHANGE_EVENT,
  THEME_PRESETS,
  type ThemePreferences,
} from "@/lib/theme-preferences";
import { isThemePreset } from "@/lib/theme-tokens";
import styles from "./landing-three.module.css";

const DEFAULT_THEME: ThemePreferences = normalizeThemePreferences(null);
const DEFAULT_SNAPSHOT = JSON.stringify({ theme: DEFAULT_THEME, error: "" });

function getThemeSnapshot(): string {
  try {
    return JSON.stringify({ theme: readThemePreferences(window.localStorage), error: "" });
  } catch {
    return JSON.stringify({ theme: DEFAULT_THEME, error: "Saved theme settings could not be read." });
  }
}

function getServerThemeSnapshot(): string {
  return DEFAULT_SNAPSHOT;
}

function subscribeToTheme(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== CLIENT_SESSION_STORAGE_KEY) return;
    try {
      applyThemeTokens(document.documentElement, readThemePreferences(window.localStorage));
    } catch (cause) {
      console.error("Could not apply updated theme preferences", cause);
    }
    onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function formatPreset(preset: string): string {
  return preset.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

export function LandingThemePicker() {
  const snapshot = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const { theme, error: readError } = JSON.parse(snapshot) as {
    theme: ThemePreferences;
    error: string;
  };
  const [isOpen, setIsOpen] = useState(false);
  const [saveError, setSaveError] = useState("");

  const updateTheme = (update: Partial<ThemePreferences>) => {
    try {
      const next = saveThemePreferences(window.localStorage, update);
      applyThemeTokens(document.documentElement, next);
      setSaveError("");
    } catch (cause) {
      console.error("Could not save theme preferences", cause);
      setSaveError("Theme changes could not be saved.");
    }
  };

  return (
    <div className={styles.appearanceMenu}>
      <button
        aria-label="Appearance settings"
        aria-controls="landing-appearance-panel"
        aria-expanded={isOpen}
        className={styles.appearanceTrigger}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsOpen(false);
        }}
      >
        <span aria-hidden="true">◐</span>
        <span>Theme</span>
      </button>
      {isOpen && <div className={styles.appearancePanel} id="landing-appearance-panel">
        <label className={styles.appearanceLabel}>
          <span>Color palette</span>
          <select
            aria-label="Color palette"
            value={theme.preset}
            onChange={(event) => {
              const preset = event.currentTarget.value;
              if (isThemePreset(preset)) updateTheme({ preset, customAccent: "", customBackground: "" });
            }}
          >
            {THEME_PRESETS.map((preset) => (
              <option key={preset} value={preset}>{formatPreset(preset)}</option>
            ))}
          </select>
        </label>
        <button
          aria-label={`Switch to ${theme.mode === "dark" ? "light" : "dark"} mode`}
          className={styles.appearanceMode}
          type="button"
          onClick={() => updateTheme({ mode: theme.mode === "dark" ? "light" : "dark" })}
        >
          Use {theme.mode === "dark" ? "light" : "dark"} mode
        </button>
        {(saveError || readError) && (
          <p className={styles.appearanceError} role="alert">{saveError || readError}</p>
        )}
      </div>}
    </div>
  );
}
