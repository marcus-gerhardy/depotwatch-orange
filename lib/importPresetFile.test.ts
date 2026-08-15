import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AMOUNT_UNITS,
  CSV_DELIMITERS,
  CSV_ENCODINGS,
  DECIMAL_SEPARATORS,
  fromPresetFile,
  parsePresetJson,
  personalDataReason,
  presetFileName,
  toPresetFile,
  validatePresetFile,
  type PresetFile,
} from "./importPresetFile";
import {
  BTC_FEE_MODES,
  DATE_FORMATS,
  FIAT_FEE_MODES,
  MAPPING_FIELDS,
  TIME_FORMATS,
} from "./csvImport";
import { TRANSACTION_TYPES } from "./types";
import type { ImportPresetConfig } from "./importPresets";

const DIR = join(import.meta.dirname, "..", "config", "import-presets");
const schema = JSON.parse(readFileSync(join(DIR, "schema.json"), "utf8"));

const presetFiles = readdirSync(DIR).filter(
  (f) => f.endsWith(".json") && f !== "schema.json",
);

/**
 * The schema is what the build validates against, `validatePresetFile` is what
 * the app validates against. Two validators are two chances to disagree, and a
 * disagreement means a file the build waves through and the app refuses — in
 * front of a user, on somebody else's contribution. So every enum is compared
 * against the one constant it exists for.
 */
describe("schema.json and the app's validator", () => {
  const props = schema.properties;

  it("uses the same enums as the code", () => {
    expect(props.delimiter.enum).toEqual([...CSV_DELIMITERS]);
    expect(props.decimalSeparator.enum).toEqual([...DECIMAL_SEPARATORS]);
    expect(props.encoding.enum).toEqual([...CSV_ENCODINGS]);
    expect(props.dateFormat.enum).toEqual([...DATE_FORMATS]);
    expect(props.timeFormat.enum).toEqual([...TIME_FORMATS]);
    expect(props.unitMapping.properties.amount.enum).toEqual([...AMOUNT_UNITS]);
    expect(props.unitMapping.properties.fee.enum).toEqual([...AMOUNT_UNITS]);
    expect(props.feeInterpretation.properties.btcIn.enum).toEqual([...BTC_FEE_MODES]);
    expect(props.feeInterpretation.properties.btcOut.enum).toEqual([...BTC_FEE_MODES]);
    expect(props.feeInterpretation.properties.fiat.enum).toEqual([...FIAT_FEE_MODES]);
    expect(schema.$defs.transactionType.enum).toEqual([...TRANSACTION_TYPES]);
  });

  it("knows exactly the mapping fields the importer has", () => {
    expect(Object.keys(props.columnMapping.properties).sort()).toEqual(
      [...MAPPING_FIELDS].sort(),
    );
    expect(props.columnMapping.additionalProperties).toBe(false);
  });
});

describe("shipped preset files", () => {
  it("all validate with the app's own validator", () => {
    for (const file of presetFiles) {
      const parsed = JSON.parse(readFileSync(join(DIR, file), "utf8"));
      const result = validatePresetFile(parsed);
      expect(result.ok, `${file}: ${JSON.stringify("issues" in result ? result.issues : [])}`).toBe(
        true,
      );
    }
  });

  it("pass the build's validation script", () => {
    // The same command `npm run build` runs. Here as well, so a broken preset
    // fails in the test run rather than only in a build somebody may not run.
    expect(() =>
      execFileSync("node", ["scripts/validate-import-presets.mjs"], {
        cwd: join(import.meta.dirname, ".."),
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});

const config: ImportPresetConfig = {
  delimiter: ";",
  decimalSeparator: ",",
  encoding: "iso-8859-15",
  mapping: {
    type: "Typ",
    date: "Datum",
    time: "Datum",
    amountBtc: "Menge",
    feeBtc: "Gebühr",
  },
  dateFormat: "de",
  timeFormat: "datetime",
  amountUnit: "sats",
  feeUnit: "sats",
  feeBtcModeIn: "deducted",
  feeBtcModeOut: "notDeducted",
  feeFiatMode: "gross",
  typeValueMapping: { Kauf: "buy", Auszahlung: "transfer_out" },
  rowFilter: {
    combinator: "and",
    rules: [{ column: "Asset", match: "isAnyOf", values: ["BTC"] }],
  },
};

const meta = {
  id: "acme-v2",
  name: "Acme — Handelshistorie",
  provider: "Acme",
  formatVersion: "2",
  description: "Test",
  headerSignature: ["Typ", "Datum", "Menge", "Gebühr", "Asset"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("toPresetFile / fromPresetFile", () => {
  it("round-trips a configuration unchanged", () => {
    const { file, removed } = toPresetFile(config, meta);
    expect(removed).toEqual([]);
    const back = fromPresetFile(file);
    expect(back).toMatchObject(config);
    expect(back.provider).toBe("Acme");
    expect(back.formatVersion).toBe("2");
    expect(back.headerSignature).toEqual(meta.headerSignature);
  });

  it("writes a file the validator accepts", () => {
    const { file } = toPresetFile(config, meta);
    expect(validatePresetFile(file).ok).toBe(true);
  });

  it("names the download after the preset, never after the imported file", () => {
    const { file } = toPresetFile(config, meta);
    expect(presetFileName(file)).toBe("acme-v2.json");
  });

  it("carries no field the export was not asked for", () => {
    const { file } = toPresetFile(
      { ...config, extra: "leak" } as ImportPresetConfig & { extra: string },
      meta,
    );
    expect(Object.keys(file)).not.toContain("extra");
  });
});

describe("personal data", () => {
  const address = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
  const txid = "a".repeat(64);

  it("recognises what is data rather than configuration", () => {
    expect(personalDataReason(address)).toBe("address");
    expect(personalDataReason(txid)).toBe("txid");
    expect(personalDataReason("0,00123456")).toBe("amount");
    expect(personalDataReason("me@example.com")).toBe("email");
    expect(personalDataReason("DE89370400440532013000")).toBe("iban");
  });

  it("leaves ordinary configuration alone", () => {
    for (const v of ["Typ", "Amount BTC", "trade", "BTC", "2", "Fee (EUR)", "buy"]) {
      expect(personalDataReason(v)).toBeNull();
    }
  });

  it("never lets it into an export, and says what it dropped", () => {
    const { file, removed } = toPresetFile(
      {
        ...config,
        typeValueMapping: { ...config.typeValueMapping, [txid]: "buy" },
        rowFilter: {
          combinator: "and",
          rules: [{ column: "Adresse", match: "isAnyOf", values: ["BTC", address] }],
        },
      },
      { ...meta, headerSignature: [...meta.headerSignature, "0.00123456"] },
    );

    const json = JSON.stringify(file);
    expect(json).not.toContain(address);
    expect(json).not.toContain(txid);
    expect(json).not.toContain("0.00123456");
    expect(removed.map((r) => r.reason).sort()).toEqual(["address", "amount", "txid"]);
  });

  it("refuses an incoming file that carries it instead of cleaning it silently", () => {
    const { file } = toPresetFile(config, meta);
    const dirty = { ...file, headerSignature: [...file.headerSignature, txid] };
    const result = validatePresetFile(dirty);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.code)).toContain("personalData");
    }
  });
});

describe("validatePresetFile", () => {
  const valid = () => toPresetFile(config, meta).file;

  it("names the field and the allowed values", () => {
    const result = validatePresetFile({ ...valid(), delimiter: "|" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        code: "invalidValue",
        path: "delimiter",
        detail: '",", ";"',
      });
    }
  });

  it("rejects an unknown target field in the column mapping", () => {
    const file = valid();
    const result = validatePresetFile({
      ...file,
      columnMapping: { ...file.columnMapping, amountEur: "Betrag" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.path)).toContain("columnMapping.amountEur");
    }
  });

  it("rejects a transaction type the ledger does not have", () => {
    const result = validatePresetFile({ ...valid(), valueMapping: { swap: "convert" } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.path)).toContain("valueMapping.swap");
    }
  });

  it("insists on a header signature, since that is what recognises a file", () => {
    const result = validatePresetFile({ ...valid(), headerSignature: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.code)).toContain("emptyHeaderSignature");
    }
  });

  it("refuses a fixed type competing with a mapped type column", () => {
    const result = validatePresetFile({ ...valid(), fixedType: "buy" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.code)).toContain("typeConflict");
    }
  });

  it("refuses a schema version it does not know, rather than guessing", () => {
    const result = validatePresetFile({ ...valid(), schemaVersion: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].code).toBe("unsupportedSchemaVersion");
    }
  });

  it("reports unreadable JSON as such", () => {
    const result = parsePresetJson("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe("notJson");
  });

  it("takes the JSON of a real export back in", () => {
    const text = JSON.stringify(valid());
    const result = parsePresetJson(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(fromPresetFile(result.file as PresetFile).mapping).toEqual(config.mapping);
  });
});
