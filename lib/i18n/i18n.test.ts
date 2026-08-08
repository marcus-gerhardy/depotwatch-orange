import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import de from "./de";
import en from "./en";
import { DATA_ISSUES } from "../dataQuality";
import { THEME_IDS } from "../theme";

/** Flatten a nested dictionary into "a.b.c" → value pairs. */
function flatten(obj: object, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else if (v && typeof v === "object") {
      for (const [nk, nv] of flatten(v, key)) out.set(nk, nv);
    }
  }
  return out;
}

const deFlat = flatten(de);
const enFlat = flatten(en);

describe("i18n dictionaries", () => {
  it("cover exactly the same keys in both languages", () => {
    expect([...enFlat.keys()].sort()).toEqual([...deFlat.keys()].sort());
  });

  it("has no empty translation", () => {
    const empty = [...deFlat, ...enFlat].filter(([, v]) => v.trim() === "");
    expect(empty).toEqual([]);
  });

  it("keeps the same {placeholders} in both languages", () => {
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    const mismatched = [...deFlat]
      .filter(([key, value]) => {
        const other = enFlat.get(key);
        return other !== undefined && params(value).join() !== params(other).join();
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it("does not leave German text in the English dictionary", () => {
    // Umlauts/ß plus a few words that only ever appear in the German copy.
    const german = /[äöüßÄÖÜ]|\b(und|nicht|Datei|keine|werden|wird)\b/;
    const leftovers = [...enFlat]
      .filter(([, v]) => german.test(v))
      .map(([key]) => key);
    expect(leftovers).toEqual([]);
  });
});

describe("wording", () => {
  it("contains no em dashes in any translation", () => {
    // Long dashes read as machine-generated prose; sentences, commas, colons
    // or parentheses do the job. Empty-value placeholders in tables ("—") are
    // rendered in components, not translated, so they are unaffected.
    const offenders = [...deFlat, ...enFlat]
      .filter(([, v]) => v.includes("—") || v.includes("–"))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });
});

/** Every non-test source file of the app. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/** `t("some.key")` — the literal keys the code asks the dictionary for. */
function usedKeys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of ["components", "lib", "app"].flatMap((d) => sourceFiles(d))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"([^"]+)"/g)) {
      if (!found.has(m[1])) found.set(m[1], file);
    }
  }
  return found;
}

/**
 * A missing key is invisible in TypeScript — the translator falls back to the
 * key itself, so the UI simply shows "tx.originalSection" and only a human
 * looking at that screen notices. This is what catches it instead: every key
 * the code asks for has to exist in both languages.
 */
describe("every key the app uses exists", () => {
  it("resolves all literal t() keys in both languages", () => {
    const missing: string[] = [];
    for (const [key, file] of usedKeys()) {
      if (deFlat.has(key) && enFlat.has(key)) continue;
      missing.push(`${key} (${file}${deFlat.has(key) ? ", missing in en" : ""}${enFlat.has(key) ? ", missing in de" : ""})`);
    }
    expect(missing).toEqual([]);
  });

  // The families built as `t(\`prefix.${value}\`)` cannot be read off the
  // source, so they are checked against the value lists they are built from.
  it.each([
    ["tx.types", ["buy", "sell", "transfer_in", "transfer_out", "spend", "transfer"]],
    ["wallets.types", ["exchange", "hardware", "software", "paper"]],
    ["dashboard.widgets.issues", DATA_ISSUES],
    ["settings.themes", THEME_IDS],
  ] as [string, string[]][])("covers every %s", (prefix, values) => {
    const missing = values.filter(
      (v) => !deFlat.has(`${prefix}.${v}`) || !enFlat.has(`${prefix}.${v}`),
    );
    expect(missing).toEqual([]);
  });
});
