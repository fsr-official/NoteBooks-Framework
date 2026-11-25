"use client";

import { useLayoutEffect } from "react";
import {
  applyThemeTokens,
  readThemePreferences,
} from "@/lib/theme-preferences";

export function ThemeBootstrap() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    try {
      root.dataset.readerOutline = localStorage.getItem("notebooks:reader:outline") === "closed" ? "closed" : "open";
      applyThemeTokens(root, readThemePreferences(localStorage));
    } catch (error) {
      console.error("Could not initialize the saved theme", error);
    }
  }, []);

  return null;
}
