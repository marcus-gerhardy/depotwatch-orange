import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_CSS_VARS,
  THEME_IDS,
  THEME_META,
  isThemeId,
  isThemeMode,
  themeColors,
  type ThemeId,
  type ThemeTokens,
} from "./theme";

const css = readFileSync(join(process.cwd(), "app/themes.css"), "utf8");

/** The custom properties of one theme block in the generated stylesheet. */
function cssTokens(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf("{") + 1, block.indexOf("}"));
  const tokens: Record<string, string> = {};
  for (const line of body.split(";")) {
    const [name, value] = line.split(":");
    if (name?.trim().startsWith("--")) tokens[name.trim()] = value.trim();
  }
  return tokens;
}

const selectorFor = (id: ThemeId) =>
  id === DEFAULT_THEME ? `:root,\n[data-theme="${id}"]` : `[data-theme="${id}"]`;

// --- WCAG contrast ---------------------------------------------------------

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Hue angle in degrees, 0–360. */
function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Shortest angle between two hues, 0–180. */
function hueDistance(a: string, b: string): number {
  const diff = Math.abs(hue(a) - hue(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Text colours and the surfaces they are actually rendered on. */
const TEXT_ON: [keyof ThemeTokens, (keyof ThemeTokens)[]][] = [
  ["foreground", ["background", "surface", "surface2"]],
  ["muted", ["background", "surface", "surface2"]],
  ["accent", ["background", "surface", "surface2"]],
  ["gain", ["background", "surface", "surface2"]],
  ["gainSafe", ["background", "surface", "surface2"]],
  ["loss", ["background", "surface", "surface2"]],
  ["warning", ["background", "surface", "surface2"]],
];

describe("colour themes", () => {
  it("has every theme in the stylesheet, with the same colours", () => {
    // Charts cannot use CSS variables (see lib/theme.ts), so the values are
    // written twice — this is what keeps the copies honest.
    for (const id of THEME_IDS) {
      const tokens = cssTokens(selectorFor(id));
      for (const [key, cssVar] of Object.entries(THEME_CSS_VARS)) {
        expect(tokens[cssVar], `${id} ${cssVar}`).toBe(
          THEMES[id][key as keyof typeof THEME_CSS_VARS],
        );
      }
      THEMES[id].chart.forEach((colour, i) => {
        expect(tokens[`--chart-${i + 1}`], `${id} chart ${i + 1}`).toBe(colour);
      });
    }
  });

  it("defines every token in every theme", () => {
    const keys = [...Object.keys(THEME_CSS_VARS), "chart"].sort();
    for (const id of THEME_IDS) {
      expect(Object.keys(THEMES[id]).sort(), id).toEqual(keys);
      expect(THEMES[id].chart, id).toHaveLength(5);
      expect(THEME_META[id], id).toBeDefined();
    }
  });

  it("accepts only known ids and modes", () => {
    expect(isThemeId("mempool")).toBe(true);
    expect(isThemeId("sepia")).toBe(false);
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("auto")).toBe(false);
  });

  it("has both light and dark themes to pair with a system preference", () => {
    const schemes = THEME_IDS.map((id) => THEME_META[id].scheme);
    expect(schemes).toContain("light");
    expect(schemes).toContain("dark");
  });
});

describe("every theme is readable", () => {
  it.each(THEME_IDS)("%s clears WCAG AA for text on every surface", (id) => {
    const tokens = THEMES[id];
    const failures: string[] = [];
    for (const [text, surfaces] of TEXT_ON) {
      for (const surface of surfaces) {
        const ratio = contrast(tokens[text] as string, tokens[surface] as string);
        if (ratio < 4.5) {
          failures.push(`${text} on ${surface}: ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures, id).toEqual([]);
  });

  it.each(THEME_IDS)("%s keeps a filled accent button legible", (id) => {
    // The primary button is text on the accent, so that pair needs AA too.
    const { accent, accentContrast, accentDim } = THEMES[id];
    expect(contrast(accentContrast, accent), `${id} on accent`).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(accentContrast, accentDim),
      `${id} on accent-dim (hover)`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(THEME_IDS)("%s keeps gain and loss apart in hue", (id) => {
    // Colour is never the only cue (see PnlValue), but two states of the same
    // hue would still be a poor signal. Brightness is the wrong measure here —
    // a dark green and a dark red have the same contrast ratio and could not
    // look more different — so this compares the hue angle.
    const { gain, gainSafe, loss } = THEMES[id];
    expect(hueDistance(gain, loss), `${id} gain/loss`).toBeGreaterThan(60);
    expect(hueDistance(gainSafe, loss), `${id} safe gain/loss`).toBeGreaterThan(60);
  });

  it.each(THEME_IDS)("%s has a chart series that is visible on the tiles", (id) => {
    // Chart strokes are graphics, not text: AA asks for 3:1 there.
    for (const [i, colour] of THEMES[id].chart.entries()) {
      expect(
        contrast(colour, THEMES[id].surface),
        `${id} chart ${i + 1}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("colour-vision-friendly mode", () => {
  it("swaps the gain colour and leaves everything else alone", () => {
    for (const id of THEME_IDS) {
      const plain = themeColors(id, false);
      const safe = themeColors(id, true);
      expect(plain).toEqual(THEMES[id]);
      expect(safe.gain).toBe(THEMES[id].gainSafe);
      expect({ ...safe, gain: plain.gain }).toEqual(plain);
    }
  });

  it("is one rule in the stylesheet, so it works for every theme", () => {
    expect(css).toContain('[data-colorblind="safe"]');
    expect(css).toContain("--gain: var(--gain-safe)");
  });

  it("moves gain away from the loss hue, not just its brightness", () => {
    // Red/green is the pair that colour blindness collapses; blue does not.
    for (const id of THEME_IDS) {
      const hue = (hex: string) => {
        const n = parseInt(hex.slice(1), 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      };
      const safe = hue(THEMES[id].gainSafe);
      expect(safe.b, `${id} gain-safe is blue-dominant`).toBeGreaterThan(safe.r);
      expect(safe.b, `${id} gain-safe is blue-dominant`).toBeGreaterThan(safe.g);
    }
  });
});

describe("print", () => {
  it("forces the light paper theme, whatever is on screen", () => {
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toContain("html[data-theme]");
    expect(print).toContain(`--background: ${THEMES.paper.background}`);
    expect(print).toContain("color-scheme: light");
  });
});
