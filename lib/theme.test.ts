import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES, THEME_CSS_VARS, THEME_IDS, isThemeId, type ThemeId } from "./theme";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** The custom properties of one theme block in the stylesheet. */
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

const SELECTORS: Record<ThemeId, string> = {
  // The default theme is the one on :root, so the prerendered HTML is already
  // themed before any attribute is set.
  ocean: ':root,\n[data-theme="ocean"]',
  night: '[data-theme="night"]',
};

describe("colour themes", () => {
  it("has every theme in the stylesheet, with the same colours", () => {
    // Charts cannot use CSS variables (see lib/theme.ts), so the values are
    // written twice — this is what keeps the copies honest.
    for (const id of THEME_IDS) {
      const tokens = cssTokens(SELECTORS[id]);
      for (const [key, cssVar] of Object.entries(THEME_CSS_VARS)) {
        expect(tokens[cssVar], `${id} ${cssVar}`).toBe(
          THEMES[id][key as keyof (typeof THEMES)[ThemeId]],
        );
      }
    }
  });

  it("defines every token in every theme", () => {
    const keys = Object.keys(THEME_CSS_VARS).sort();
    for (const id of THEME_IDS) {
      expect(Object.keys(THEMES[id]).sort()).toEqual(keys);
    }
  });

  it("accepts only known ids", () => {
    expect(isThemeId("ocean")).toBe(true);
    expect(isThemeId("sepia")).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });
});
