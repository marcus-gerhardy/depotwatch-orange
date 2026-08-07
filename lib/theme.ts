// The interface colour themes (CLAUDE.md §5/§6.3).
//
// The themes themselves live in `app/globals.css` as two sets of CSS custom
// properties; every component styles itself with the tokens built on them, so
// switching a theme is one attribute on <html> and nothing else.
//
// The same values are repeated here because chart libraries (Recharts) need
// literal colours rather than CSS variables, and reading them off the DOM would
// mean touching `document` during a prerender. A test asserts that this table
// and the stylesheet never drift apart.

export type ThemeId = "night" | "ocean";

export interface ThemeTokens {
  background: string;
  surface: string;
  surface2: string;
  border: string;
  foreground: string;
  muted: string;
  accent: string;
  accentDim: string;
  gain: string;
  loss: string;
  warning: string;
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  // Deep navy with warm cream text; the default (spec §5).
  ocean: {
    background: "#050b14",
    surface: "#07111f",
    surface2: "#0d2138",
    border: "#17304a",
    foreground: "#fff9ef",
    muted: "#93a7bd",
    accent: "#f7931a",
    accentDim: "#d97512",
    gain: "#2fb37f",
    loss: "#ef5350",
    warning: "#f3a13d",
  },
  // Orange on near-black.
  night: {
    background: "#0b0b0d",
    surface: "#151518",
    surface2: "#1d1d21",
    border: "#2a2a30",
    foreground: "#ececec",
    muted: "#98989f",
    accent: "#f7931a",
    accentDim: "#b96f14",
    gain: "#26a269",
    loss: "#e01b24",
    warning: "#e5a50a",
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const DEFAULT_THEME: ThemeId = "ocean";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && value in THEMES;
}

/** CSS variable name per token, i.e. how `globals.css` spells them. */
export const THEME_CSS_VARS: Record<keyof ThemeTokens, string> = {
  background: "--background",
  surface: "--surface",
  surface2: "--surface-2",
  border: "--border",
  foreground: "--foreground",
  muted: "--muted",
  accent: "--accent",
  accentDim: "--accent-dim",
  gain: "--gain",
  loss: "--loss",
  warning: "--warning",
};
