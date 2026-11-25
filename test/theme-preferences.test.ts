import { describe, expect, it } from "vitest";
import {
  applyThemeTokens,
  CLIENT_SESSION_STORAGE_KEY,
  readThemePreferences,
  saveThemePreferences,
} from "../src/lib/theme-preferences";

function createStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => key === CLIENT_SESSION_STORAGE_KEY ? value : null,
    setItem: (key: string, next: string) => {
      if (key === CLIENT_SESSION_STORAGE_KEY) value = next;
    },
    read: () => value,
  };
}

describe("shared theme preferences", () => {
  it("reads the stored theme and defaults when no client session exists", () => {
    const storage = createStorage(JSON.stringify({
      id: "session-1",
      preferences: { preset: "ocean", mode: "light", customAccent: "#123456" },
    }));

    expect(readThemePreferences(storage)).toEqual({
      preset: "ocean",
      mode: "light",
      customAccent: "#123456",
      customBackground: "",
    });
    expect(readThemePreferences(createStorage(null))).toEqual({
      preset: "midnight",
      mode: "dark",
      customAccent: "",
      customBackground: "",
    });
  });

  it("updates theme settings without dropping session identity or file history", () => {
    const existing = {
      id: "session-1",
      identity: { userId: "user-1" },
      preferences: {
        preset: "midnight",
        mode: "dark",
        customAccent: "",
        customBackground: "",
        fileHistory: [{ key: "recent-note" }],
      },
    };
    const storage = createStorage(JSON.stringify(existing));

    expect(saveThemePreferences(storage, { preset: "paper", mode: "light" })).toEqual({
      preset: "paper",
      mode: "light",
      customAccent: "",
      customBackground: "",
    });

    const saved = JSON.parse(storage.read() ?? "null");
    expect(saved.id).toBe("session-1");
    expect(saved.identity).toEqual(existing.identity);
    expect(saved.preferences.fileHistory).toEqual(existing.preferences.fileHistory);
    expect(saved.preferences.preset).toBe("paper");
    expect(saved.preferences.mode).toBe("light");
  });

  it("creates a valid anonymous client session when themes are chosen before the workspace", () => {
    const storage = createStorage();

    saveThemePreferences(storage, { preset: "forest" });

    const saved = JSON.parse(storage.read() ?? "null");
    expect(saved.id).toEqual(expect.any(String));
    expect(saved.preferences).toMatchObject({
      preset: "forest",
      mode: "dark",
      fileHistory: [],
    });
  });

  it("applies the same theme tokens used by the workspace", () => {
    const values = new Map<string, string>();
    const root = {
      dataset: {} as DOMStringMap,
      style: { setProperty: (name: string, value: string) => values.set(name, value) },
    } as unknown as HTMLElement;

    applyThemeTokens(root, {
      preset: "paper",
      mode: "light",
      customAccent: "#123456",
      customBackground: "",
    });

    expect(root.dataset.mode).toBe("light");
    expect(root.dataset.themePreset).toBe("paper");
    expect(values.get("--accent")).toBe("#123456");
    expect(values.get("--page")).toBe("#fbf7ef");
    expect(values.get("--text")).toBe("#2b251e");
  });

  it("rejects malformed saved data instead of overwriting it", () => {
    const storage = createStorage("{not json");

    expect(() => saveThemePreferences(storage, { preset: "ocean" })).toThrow("not valid JSON");
    expect(storage.read()).toBe("{not json");
  });
});
