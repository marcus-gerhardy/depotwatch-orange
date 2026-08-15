import { describe, expect, it } from "vitest";
import {
  compareFormatVersions,
  findMatchingPreset,
  groupByProvider,
  matchPresets,
  normalizeHeader,
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

  it("names a provider and a format version, so the picker can group them", () => {
    for (const p of SYSTEM_IMPORT_PRESETS) {
      expect(p.provider?.length).toBeGreaterThan(0);
      expect(p.formatVersion?.length).toBeGreaterThan(0);
      expect(p.headerSignature?.length).toBeGreaterThan(0);
    }
  });
});

function preset(over: Partial<ImportPresetOption> = {}): ImportPresetOption {
  return {
    id: "example",
    name: "Example",
    source: "system",
    delimiter: ",",
    decimalSeparator: ".",
    encoding: "utf-8",
    mapping: { type: "type", date: "time", amountBtc: "vol" },
    ...over,
  } as ImportPresetOption;
}

describe("normalizeHeader", () => {
  it("ignores case, surrounding and repeated whitespace and a BOM", () => {
    expect(normalizeHeader("﻿  Amount   BTC ")).toBe("amount btc");
    expect(normalizeHeader("AMOUNT BTC")).toBe(normalizeHeader("amount btc"));
  });
});

describe("matchPresets", () => {
  const signed = preset({
    id: "acme-v1",
    name: "Acme v1",
    provider: "Acme",
    formatVersion: "1",
    headerSignature: ["Time", "Type", "Volume"],
    mapping: { type: "Type", date: "Time", amountBtc: "Volume" },
  });

  it("matches a signature regardless of case, spacing and column order", () => {
    const hits = matchPresets([signed], ["volume", "  TYPE", "time"]);
    expect(hits.map((h) => h.preset.id)).toEqual(["acme-v1"]);
    expect(hits[0].via).toBe("signature");
  });

  it("does not mind extra columns the export gained", () => {
    expect(matchPresets([signed], ["Time", "Type", "Volume", "Ledger ID"])).toHaveLength(
      1,
    );
  });

  it("rejects a file missing one of the signature columns", () => {
    expect(matchPresets([signed], ["Time", "Type"])).toEqual([]);
  });

  it("falls back to the mapped columns for a preset without a signature", () => {
    const hits = matchPresets([preset()], ["type", "time", "vol", "extra"]);
    expect(hits).toHaveLength(1);
    expect(hits[0].via).toBe("mapping");
  });

  it("offers every candidate, newest format version first", () => {
    const v2 = preset({
      id: "acme-v2",
      name: "Acme v2",
      provider: "Acme",
      formatVersion: "2",
      headerSignature: ["Time", "Type", "Volume"],
    });
    const v10 = preset({
      id: "acme-v10",
      name: "Acme v10",
      provider: "Acme",
      formatVersion: "10",
      headerSignature: ["Time", "Type", "Volume"],
    });
    const hits = matchPresets([signed, v2, v10], ["Time", "Type", "Volume"]);
    expect(hits.map((h) => h.preset.id)).toEqual(["acme-v10", "acme-v2", "acme-v1"]);
  });

  it("prefers a signature match over one made from the mapping alone", () => {
    const hits = matchPresets([preset(), signed], ["type", "time", "vol", "Volume", "Type"]);
    expect(hits[0].preset.id).toBe("acme-v1");
  });

  it("preselects the best candidate", () => {
    expect(findMatchingPreset([signed], ["Time", "Type", "Volume"])?.id).toBe("acme-v1");
    expect(findMatchingPreset([signed], ["nothing"])).toBeUndefined();
  });
});

describe("compareFormatVersions", () => {
  it("compares numerically where it can, newest first", () => {
    expect(compareFormatVersions("10", "2")).toBeLessThan(0);
    expect(compareFormatVersions("2024.1", "2024.2")).toBeGreaterThan(0);
    expect(compareFormatVersions("1", "1")).toBe(0);
  });

  it("still orders text deterministically", () => {
    expect(compareFormatVersions("beta", "alpha")).toBeLessThan(0);
  });
});

describe("groupByProvider", () => {
  it("groups by provider and puts the unnamed ones last", () => {
    const groups = groupByProvider([
      { name: "Own export", formatVersion: undefined },
      { name: "B v1", provider: "Bravo", formatVersion: "1" },
      { name: "A v2", provider: "Alpha", formatVersion: "2" },
      { name: "A v3", provider: "Alpha", formatVersion: "3" },
    ]);
    expect(groups.map((g) => g.provider)).toEqual(["Alpha", "Bravo", ""]);
    expect(groups[0].presets.map((p) => p.name)).toEqual(["A v3", "A v2"]);
  });
});
