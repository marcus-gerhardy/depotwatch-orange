import { describe, expect, it } from "vitest";
import de from "./de";
import en from "./en";

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
