// How the app looks: which theme, and the accessibility options that change it
// (CLAUDE.md §5). One shape, used by the store, the settings and the components.

"use client";

import { useMemo } from "react";
import { useAppStore } from "./store";
import {
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  DEFAULT_THEME,
  THEME_META,
  isThemeId,
  isThemeMode,
  themeColors,
  type ThemeId,
  type ThemeMode,
  type ThemeTokens,
} from "./theme";
import type { PortfolioFile } from "./types";

export interface Appearance {
  /** "fixed" renders `theme`; "system" picks `light`/`dark` per the OS. */
  mode: ThemeMode;
  theme: ThemeId;
  light: ThemeId;
  dark: ThemeId;
  /** Gain switches from green to blue (red/green colour blindness). */
  colorBlindSafe: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "fixed",
  theme: DEFAULT_THEME,
  light: DEFAULT_LIGHT_THEME,
  dark: DEFAULT_DARK_THEME,
  colorBlindSafe: false,
};

/** The theme actually rendered, given what the system asks for. */
export function resolveTheme(appearance: Appearance, systemPrefersDark: boolean): ThemeId {
  if (appearance.mode !== "system") return appearance.theme;
  return systemPrefersDark ? appearance.dark : appearance.light;
}

/** The colours of that theme, after the colour-vision option (`themeColors`). */
export function resolveColors(
  appearance: Appearance,
  systemPrefersDark: boolean,
): ThemeTokens {
  return themeColors(resolveTheme(appearance, systemPrefersDark), appearance.colorBlindSafe);
}

/** Whether a theme is a light one, for pairing it with a system preference. */
export function isLightTheme(theme: ThemeId): boolean {
  return THEME_META[theme].scheme === "light";
}

/**
 * The appearance a portfolio file carries. It lives in `uiSettings` next to the
 * dashboard layout and the column choice; `settings.theme` is where the theme
 * used to live and is still read, so an older file keeps its look.
 */
export function appearanceOf(portfolio: PortfolioFile, fallback: Appearance): Appearance {
  const ui = portfolio.uiSettings;
  return {
    mode: isThemeMode(ui?.themeMode) ? ui.themeMode : fallback.mode,
    theme: isThemeId(ui?.theme)
      ? ui.theme
      : isThemeId(portfolio.settings.theme)
        ? portfolio.settings.theme
        : fallback.theme,
    light: isThemeId(ui?.themeLight) ? ui.themeLight : fallback.light,
    dark: isThemeId(ui?.themeDark) ? ui.themeDark : fallback.dark,
    colorBlindSafe: ui?.colorBlindSafe ?? fallback.colorBlindSafe,
  };
}

/** Read a stored appearance (device preference), ignoring anything unusable. */
export function parseAppearance(raw: unknown, fallback: Appearance): Appearance {
  if (typeof raw !== "object" || raw === null) return fallback;
  const v = raw as Record<string, unknown>;
  return {
    mode: isThemeMode(v.mode) ? v.mode : fallback.mode,
    theme: isThemeId(v.theme) ? v.theme : fallback.theme,
    light: isThemeId(v.light) ? v.light : fallback.light,
    dark: isThemeId(v.dark) ? v.dark : fallback.dark,
    colorBlindSafe: typeof v.colorBlindSafe === "boolean" ? v.colorBlindSafe : fallback.colorBlindSafe,
  };
}

// --- hooks -----------------------------------------------------------------

/**
 * The colours to render with right now. Everything that needs literal colours
 * (Recharts, the confetti) reads this: it already accounts for the system
 * preference and for the colour-vision option, so no component has to.
 */
export function useThemeColors(): ThemeTokens {
  const appearance = useAppStore((s) => s.appearance);
  const systemPrefersDark = useAppStore((s) => s.systemPrefersDark);
  return useMemo(
    () => resolveColors(appearance, systemPrefersDark),
    [appearance, systemPrefersDark],
  );
}

/** The theme id actually rendered (for the `data-theme` attribute, previews). */
export function useResolvedTheme(): ThemeId {
  const appearance = useAppStore((s) => s.appearance);
  const systemPrefersDark = useAppStore((s) => s.systemPrefersDark);
  return resolveTheme(appearance, systemPrefersDark);
}
