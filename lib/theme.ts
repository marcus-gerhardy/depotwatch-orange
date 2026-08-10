// The interface colour themes (CLAUDE.md §5).
//
// A theme is nothing but a set of values for the tokens below. Components never
// name a colour — they style themselves with the tokens — so a new theme is one
// entry here plus the generated CSS block, and no component changes at all.
//
// The values are repeated as CSS custom properties in `app/themes.css`, which is
// generated from this table by `scripts/build-theme-css.py`: chart libraries
// (Recharts) need literal colours rather than variables, and reading them off
// the DOM would mean touching `document` during a prerender. A test asserts that
// the table and the stylesheet never drift apart, and a second one that every
// theme clears WCAG AA for body text.

export type ThemeId =
  | "ocean"
  | "night"
  | "terminal"
  | "gold"
  | "paper"
  | "sunrise"
  | "nord"
  | "mono"
  | "mempool";

export interface ThemeTokens {
  /** Page background, the surface behind everything else. */
  background: string;
  /** Cards and panels. */
  surface: string;
  /** Raised elements inside a card: inputs, table headers, chips. */
  surface2: string;
  border: string;
  /** Body text. */
  foreground: string;
  /** Secondary text: labels, hints, table captions. */
  muted: string;
  accent: string;
  accentDim: string;
  /** Text on top of the accent (a filled button), which is not always black. */
  accentContrast: string;
  gain: string;
  /**
   * The gain colour when the colour-vision-friendly option is on: a blue that
   * stays apart from the loss red for every common form of colour blindness.
   */
  gainSafe: string;
  loss: string;
  warning: string;
  /** Categorical series for charts, in order of use. */
  chart: [string, string, string, string, string];
}

export interface ThemeMeta {
  /** Whether the theme is light, which decides the system-preference pairing. */
  scheme: "light" | "dark";
  /** Body font override; the app default when absent. */
  fontBody?: string;
  /** Heading font override; the app default when absent. */
  fontHeading?: string;
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  // Deep navy with warm cream text; the default.
  ocean: {
    background: "#050b14",
    surface: "#07111f",
    surface2: "#0d2138",
    border: "#17304a",
    foreground: "#fff9ef",
    muted: "#93a7bd",
    accent: "#f7931a",
    accentDim: "#d97512",
    accentContrast: "#0b0b0d",
    gain: "#2fb37f",
    gainSafe: "#4ea6ff",
    loss: "#ef5350",
    warning: "#f3a13d",
    chart: ["#f7931a", "#4ea6ff", "#2fb37f", "#c084fc", "#ef5350"],
  },
  // Orange on near-black: the Bitcoin theme of the spec.
  night: {
    background: "#0b0b0d",
    surface: "#151518",
    surface2: "#1d1d21",
    border: "#2a2a30",
    foreground: "#ececec",
    muted: "#98989f",
    accent: "#f7931a",
    accentDim: "#b96f14",
    accentContrast: "#0b0b0d",
    gain: "#26a269",
    gainSafe: "#4d9dff",
    // Lightened from #e01b24, which fell just short of AA on the near-black
    // background (4.07:1); everything that gives this theme its character is
    // untouched.
    loss: "#f4585f",
    warning: "#e5a50a",
    chart: ["#f7931a", "#4d9dff", "#26a269", "#a97bff", "#f4585f"],
  },
  // Green on black, monospaced, with a very quiet scanline texture.
  terminal: {
    background: "#000000",
    surface: "#05170c",
    surface2: "#0a2a15",
    border: "#12592b",
    foreground: "#c8ffd6",
    muted: "#63c07f",
    accent: "#35e06b",
    accentDim: "#1f9e48",
    accentContrast: "#00170a",
    gain: "#35e06b",
    gainSafe: "#5cc8ff",
    loss: "#ff6b5e",
    warning: "#ffd866",
    chart: ["#35e06b", "#5cc8ff", "#ffd866", "#c792ea", "#ff6b5e"],
  },
  // Gold and bronze on a very dark brown-black.
  gold: {
    background: "#12100a",
    surface: "#1b1810",
    surface2: "#262117",
    border: "#3d3421",
    foreground: "#f8eed8",
    muted: "#c0ab84",
    accent: "#e3b455",
    accentDim: "#b08432",
    accentContrast: "#12100a",
    gain: "#5cc48c",
    gainSafe: "#6bb6ff",
    loss: "#f0645c",
    warning: "#e8b53f",
    chart: ["#e3b455", "#6bb6ff", "#5cc48c", "#cfa2e8", "#f0645c"],
  },
  // Light, high contrast, serif headings: a printed ledger.
  paper: {
    background: "#faf7f0",
    surface: "#ffffff",
    surface2: "#f0ebdf",
    border: "#cfc7b5",
    foreground: "#191713",
    muted: "#57524a",
    accent: "#a4560a",
    accentDim: "#7d4108",
    accentContrast: "#ffffff",
    gain: "#0d6135",
    gainSafe: "#1d4ed8",
    loss: "#a4161a",
    warning: "#7a5200",
    chart: ["#a4560a", "#1d4ed8", "#0d6135", "#6b21a8", "#a4161a"],
  },
  // Light, warm amber and peach.
  sunrise: {
    background: "#fff8f1",
    surface: "#fffdfb",
    surface2: "#ffecd8",
    border: "#e9cfb2",
    foreground: "#2a1a0e",
    muted: "#6a4a30",
    accent: "#b8460c",
    accentDim: "#8f3609",
    accentContrast: "#fff8f1",
    gain: "#0f6048",
    gainSafe: "#1b4ed1",
    loss: "#a81d13",
    warning: "#8a5100",
    chart: ["#b8460c", "#1b4ed1", "#0f6048", "#7a2f9e", "#a81d13"],
  },
  // Muted blue-greys, easy on the eyes.
  nord: {
    background: "#2e3440",
    surface: "#353c4a",
    surface2: "#3f4859",
    border: "#525c6d",
    foreground: "#eceff4",
    muted: "#c2cbd9",
    accent: "#a3cdcc",
    accentDim: "#88bcbb",
    accentContrast: "#232833",
    gain: "#b4cd9e",
    gainSafe: "#9fcdf5",
    loss: "#f0a1a8",
    warning: "#ebcb8b",
    chart: ["#a3cdcc", "#9fcdf5", "#b4cd9e", "#c4a0bd", "#f0a1a8"],
  },
  // Greyscale; colour is reserved for gain and loss.
  mono: {
    background: "#0d0d0d",
    surface: "#161616",
    surface2: "#202020",
    border: "#363636",
    foreground: "#ededed",
    muted: "#a0a0a0",
    accent: "#d6d6d6",
    accentDim: "#a8a8a8",
    accentContrast: "#0d0d0d",
    gain: "#3ec98a",
    gainSafe: "#5fb0ff",
    loss: "#ff6a63",
    warning: "#c9c9c9",
    chart: ["#ededed", "#c4c4c4", "#9e9e9e", "#d8d8d8", "#868686"],
  },
  // After the fee gradient of mempool.space: purple, red, yellow.
  mempool: {
    background: "#1d1f31",
    surface: "#24273c",
    surface2: "#2e3250",
    border: "#454a70",
    foreground: "#e8e9f4",
    muted: "#aab0d0",
    accent: "#ffb300",
    accentDim: "#c98d00",
    accentContrast: "#1d1f31",
    gain: "#37c793",
    gainSafe: "#6aa9ff",
    loss: "#ff7ba1",
    warning: "#ffb300",
    chart: ["#b07cff", "#ff7ba1", "#ffb300", "#37c793", "#6aa9ff"],
  },
};

export const THEME_META: Record<ThemeId, ThemeMeta> = {
  ocean: { scheme: "dark" },
  night: { scheme: "dark" },
  terminal: {
    scheme: "dark",
    fontBody: "var(--font-geist-mono), ui-monospace, monospace",
    fontHeading: "var(--font-geist-mono), ui-monospace, monospace",
  },
  gold: { scheme: "dark" },
  paper: {
    scheme: "light",
    fontHeading: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  },
  sunrise: { scheme: "light" },
  nord: { scheme: "dark" },
  mono: { scheme: "dark" },
  mempool: { scheme: "dark" },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const DEFAULT_THEME: ThemeId = "ocean";
/** Used when the theme follows the system and no choice has been made yet. */
export const DEFAULT_LIGHT_THEME: ThemeId = "paper";
export const DEFAULT_DARK_THEME: ThemeId = "ocean";

/** Print always uses this one, whatever is on screen (§5). */
export const PRINT_THEME: ThemeId = "paper";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && value in THEMES;
}

/** How the theme is chosen: a fixed one, or whatever the system asks for. */
export type ThemeMode = "fixed" | "system";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "fixed" || value === "system";
}

/** CSS variable name per token, i.e. how the stylesheet spells them. */
export const THEME_CSS_VARS: Record<
  Exclude<keyof ThemeTokens, "chart">,
  string
> = {
  background: "--background",
  surface: "--surface",
  surface2: "--surface-2",
  border: "--border",
  foreground: "--foreground",
  muted: "--muted",
  accent: "--accent",
  accentDim: "--accent-dim",
  accentContrast: "--accent-contrast",
  gain: "--gain",
  gainSafe: "--gain-safe",
  loss: "--loss",
  warning: "--warning",
};

/**
 * The colours a theme actually renders with, i.e. after the colour-vision
 * option has had its say. Everything that needs literal colours (charts) reads
 * this rather than the raw table.
 */
export function themeColors(theme: ThemeId, colorBlindSafe: boolean): ThemeTokens {
  const base = THEMES[theme];
  return colorBlindSafe ? { ...base, gain: base.gainSafe } : base;
}
