import { describe, expect, it } from "vitest";
import {
  findMatchingPreset,
  SYSTEM_IMPORT_PRESETS,
  type ImportPresetOption,
} from "./importPresets";

describe("SYSTEM_IMPORT_PRESETS", () => {
  // None ship right now; the assertions hold whatever gets dropped into
  // /config/import-presets/ later, so a broken file fails here.
  it("has unique, non-empty ids and names, and maps at least one column", () => {
    const ids = SYSTEM_IMPORT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of SYSTEM_IMPORT_PRESETS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(Object.keys(p.mapping).length).toBeGreaterThan(0);
    }
  });
});

describe("findMatchingPreset", () => {
  const preset: ImportPresetOption = {
    id: "example",
    name: "Example",
    source: "system",
    delimiter: ",",
    decimalSeparator: ".",
    encoding: "utf-8",
    mapping: { type: "type", date: "time", amountBtc: "vol" },
  };

  it("matches when all mapped headers exist", () => {
    expect(findMatchingPreset([preset], ["type", "time", "vol", "extra"])).toBe(
      preset,
    );
  });

  it("does not match when headers are missing", () => {
    expect(findMatchingPreset([preset], ["Type", "Date"])).toBeUndefined();
  });
});
