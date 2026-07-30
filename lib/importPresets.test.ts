import { describe, expect, it } from "vitest";
import {
  findMatchingPreset,
  SYSTEM_IMPORT_PRESETS,
  type ImportPresetOption,
} from "./importPresets";

describe("SYSTEM_IMPORT_PRESETS", () => {
  it("ships at least a few example providers", () => {
    expect(SYSTEM_IMPORT_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it("has unique, non-empty ids and names", () => {
    const ids = SYSTEM_IMPORT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of SYSTEM_IMPORT_PRESETS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(Object.keys(p.mapping).length).toBeGreaterThan(0);
    }
  });

  it("includes the BitBox02 preset with sats units and a type-value mapping", () => {
    const preset = SYSTEM_IMPORT_PRESETS.find((p) => p.id === "bitbox02");
    expect(preset).toBeDefined();
    expect(preset!.amountUnit).toBe("sats");
    expect(preset!.typeValueMapping).toEqual({
      received: "transfer_in",
      sent: "transfer_out",
    });
  });
});

describe("findMatchingPreset", () => {
  const preset: ImportPresetOption = {
    id: "kraken",
    name: "Kraken",
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
