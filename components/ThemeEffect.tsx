"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { DEFAULT_THEME } from "@/lib/theme";
import { useLaserEyes } from "@/lib/easterEggs";

/**
 * Puts the chosen colour theme on <html> (`data-theme`), which is all the
 * stylesheet needs to swap every token (CLAUDE.md §5).
 *
 * Rendered once in the root layout, so it covers the app *and* the pages that
 * exist without an open portfolio (start screen, legal pages) — the theme is a
 * device preference mirrored from the open file, exactly like the language.
 * The remembered value is read in an effect, never during the prerender: the
 * static HTML always carries the default theme.
 */
export default function ThemeEffect() {
  const theme = useAppStore((s) => s.uiTheme);
  const initUiTheme = useAppStore((s) => s.initUiTheme);
  // Cosmetic laser-eyes mode rides along on the same element (§5.1): it only
  // brightens the accent, so it is an attribute, not a second theme.
  const laserEyes = useLaserEyes();

  useEffect(() => initUiTheme(), [initUiTheme]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme ?? DEFAULT_THEME;
  }, [theme]);
  useEffect(() => {
    if (laserEyes) document.documentElement.dataset.laserEyes = "on";
    else delete document.documentElement.dataset.laserEyes;
  }, [laserEyes]);

  return null;
}
