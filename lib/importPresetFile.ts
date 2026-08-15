// The file format of a CSV import preset (CLAUDE.md §3.4): what a shipped
// system preset under /config/import-presets/ looks like, and what "export
// preset as JSON" writes and "import preset from JSON" reads.
//
// Two shapes, on purpose:
//
//   PresetFile          — the interchange format, described by
//                         config/import-presets/schema.json. Grouped fields
//                         (columnMapping/unitMapping/valueMapping/
//                         feeInterpretation), provider and formatVersion, and
//                         a headerSignature so a file can be recognised.
//   ImportPresetConfig  — what the wizard applies, flat, unchanged since
//                         before this existed. Presets already stored in
//                         portfolio files are in that shape and stay valid.
//
// Everything crossing the boundary goes through `toPresetFile` /
// `fromPresetFile`, so the wizard never learns about the file format and the
// file format can gain a field without the wizard changing.
//
// The one rule the exporter exists to keep: a preset is *configuration*. It
// must never carry transactions, amounts, addresses, txids or file names —
// presets are meant to be shared in a pull request, and a shared file that
// quietly contains somebody's on-chain history is the worst kind of leak,
// because nothing about it looks wrong. The export is therefore built from an
// allowlist of fields and the few values that come from the user's own data
// (header names, type values, filter values) are scanned before they are
// written, see `personalDataReason`.

import {
  BTC_FEE_MODES,
  DATE_FORMATS,
  FIAT_FEE_MODES,
  MAPPING_FIELDS,
  TIME_FORMATS,
  type AmountUnit,
  type BtcFeeMode,
  type ColumnMapping,
  type CsvDateFormat,
  type CsvDelimiter,
  type CsvEncoding,
  type CsvTimeFormat,
  type DecimalSeparator,
  type FiatFeeMode,
  type MappingField,
  type RowFilter,
  type RowFilterMatch,
} from "./csvImport";
import { isValidBitcoinAddress, isValidTxid } from "./bitcoin";
import { TRANSACTION_TYPES, type TransactionType } from "./types";
import type { ImportPresetConfig, PresetMetadata } from "./importPresets";

/** Version of the *file format*, not of any provider's export format. */
export const PRESET_SCHEMA_VERSION = 1;

export const CSV_DELIMITERS = [",", ";"] as const;
export const DECIMAL_SEPARATORS = [".", ","] as const;
export const CSV_ENCODINGS = ["utf-8", "iso-8859-1", "iso-8859-15"] as const;
export const AMOUNT_UNITS = ["btc", "sats"] as const;
export const ROW_FILTER_MATCHES = ["isAnyOf", "isNoneOf"] as const;
export const ROW_FILTER_COMBINATORS = ["and", "or"] as const;

export interface PresetFileRowFilter {
  combinator: "and" | "or";
  rules: { column: string; match?: RowFilterMatch; values: string[] }[];
}

/** One JSON file under /config/import-presets/, and what the export writes. */
export interface PresetFile {
  schemaVersion: number;
  id: string;
  name: string;
  provider: string;
  formatVersion: string;
  description?: string;
  delimiter: CsvDelimiter;
  decimalSeparator: DecimalSeparator;
  encoding: CsvEncoding;
  dateFormat?: CsvDateFormat;
  timeFormat?: CsvTimeFormat;
  columnMapping: ColumnMapping;
  unitMapping?: { amount?: AmountUnit; fee?: AmountUnit };
  valueMapping?: Record<string, TransactionType>;
  fixedType?: TransactionType;
  feeInterpretation?: {
    btcIn?: BtcFeeMode;
    btcOut?: BtcFeeMode;
    fiat?: FiatFeeMode;
  };
  rowFilter?: PresetFileRowFilter;
  headerSignature: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Personal data: what may never end up in an exported preset
// ---------------------------------------------------------------------------

/** What the export left out, so the dialog can say what it dropped. */
export interface ScrubFinding {
  /** Where it sat, e.g. "headerSignature" or "rowFilter.values". */
  path: string;
  value: string;
  reason: "address" | "txid" | "amount" | "email" | "iban";
}

const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/;
/** A bare number with decimals or many digits: an amount, never a column name. */
const AMOUNT = /^[+-]?\d[\d\s.,']*$/;

/**
 * Is this string data rather than configuration?
 *
 * Header names, type values and filter values are the three places where the
 * user's own file bleeds into a preset, and they are exactly the places where
 * something personal could hide — a wallet export whose "column" is really an
 * address, a filter narrowed down to one txid. Config values are short words;
 * anything that parses as an address, a txid, an amount, an e-mail or an IBAN
 * is not one, and is dropped rather than shipped.
 */
export function personalDataReason(value: string): ScrubFinding["reason"] | null {
  const v = value.trim();
  if (v === "") return null;
  if (isValidTxid(v)) return "txid";
  if (isValidBitcoinAddress(v)) return "address";
  if (EMAIL.test(v)) return "email";
  if (IBAN.test(v)) return "iban";
  // A pure number that is more than a small integer: "2" can be a format
  // version or a column called "2", "0.00123456" cannot be anything but data.
  if (AMOUNT.test(v) && (/[.,]/.test(v) || v.replace(/\D/g, "").length > 4)) {
    return "amount";
  }
  return null;
}

function scrubList(values: string[], path: string, findings: ScrubFinding[]): string[] {
  return values.filter((v) => {
    const reason = personalDataReason(v);
    if (reason) findings.push({ path, value: v, reason });
    return reason === null;
  });
}

// ---------------------------------------------------------------------------
// Runtime config → file
// ---------------------------------------------------------------------------

export interface ExportMeta {
  id: string;
  name: string;
  provider: string;
  formatVersion: string;
  description?: string;
  /** Header row of the file this preset was built from. */
  headerSignature: string[];
  createdAt?: string;
}

export interface PresetExport {
  file: PresetFile;
  /** What was left out because it was data, not configuration. */
  removed: ScrubFinding[];
}

/**
 * Build the interchange file from a wizard configuration.
 *
 * Field by field from an allowlist — never a spread of the config object, so a
 * field added to the runtime shape later cannot travel out of the app without
 * somebody deciding it may.
 */
export function toPresetFile(
  config: ImportPresetConfig,
  meta: ExportMeta,
): PresetExport {
  const removed: ScrubFinding[] = [];

  const columnMapping: ColumnMapping = {};
  for (const field of MAPPING_FIELDS) {
    const column = config.mapping[field];
    if (column === undefined || column.trim() === "") continue;
    const reason = personalDataReason(column);
    if (reason) {
      removed.push({ path: `columnMapping.${field}`, value: column, reason });
      continue;
    }
    columnMapping[field] = column;
  }

  const valueMapping: Record<string, TransactionType> = {};
  for (const [value, type] of Object.entries(config.typeValueMapping ?? {})) {
    const reason = personalDataReason(value);
    if (reason) {
      removed.push({ path: "valueMapping", value, reason });
      continue;
    }
    valueMapping[value] = type;
  }

  const rules = (config.rowFilter?.rules ?? [])
    .map((rule) => ({
      column: rule.column,
      match: rule.match,
      values: scrubList(rule.values, "rowFilter.values", removed),
    }))
    .filter((rule) => rule.column.trim() !== "" && rule.values.length > 0);

  const headerSignature = [
    ...new Set(scrubList(meta.headerSignature, "headerSignature", removed)),
  ].filter((h) => h.trim() !== "");

  const file: PresetFile = {
    schemaVersion: PRESET_SCHEMA_VERSION,
    id: meta.id,
    name: meta.name,
    provider: meta.provider,
    formatVersion: meta.formatVersion,
    ...(meta.description?.trim() ? { description: meta.description.trim() } : {}),
    delimiter: config.delimiter,
    decimalSeparator: config.decimalSeparator,
    encoding: config.encoding,
    ...(config.dateFormat ? { dateFormat: config.dateFormat } : {}),
    ...(config.timeFormat ? { timeFormat: config.timeFormat } : {}),
    columnMapping,
    unitMapping: {
      amount: config.amountUnit ?? "btc",
      fee: config.feeUnit ?? "btc",
    },
    ...(Object.keys(valueMapping).length > 0 ? { valueMapping } : {}),
    ...(config.fixedType ? { fixedType: config.fixedType } : {}),
    feeInterpretation: {
      btcIn: config.feeBtcModeIn ?? "notDeducted",
      btcOut: config.feeBtcModeOut ?? "notDeducted",
      fiat: config.feeFiatMode ?? "net",
    },
    ...(rules.length > 0
      ? {
          rowFilter: {
            combinator: config.rowFilter?.combinator ?? "and",
            rules,
          },
        }
      : {}),
    headerSignature,
    createdAt: meta.createdAt ?? new Date().toISOString(),
  };

  return { file, removed };
}

/** The JSON text an export writes: stable key order, readable indentation. */
export function presetFileToJson(file: PresetFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * A file name for the download. Provider and format version, never the name of
 * the CSV it was built from — that one belongs to the user.
 */
export function presetFileName(file: PresetFile): string {
  const slug = file.id.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  return `${slug || "import-preset"}.json`;
}

// ---------------------------------------------------------------------------
// File → runtime config
// ---------------------------------------------------------------------------

/** What a preset file turns into once it is in the app. */
export type PresetFromFile = ImportPresetConfig &
  PresetMetadata & { id: string; name: string };

export function fromPresetFile(file: PresetFile): PresetFromFile {
  const rowFilter: RowFilter | undefined =
    file.rowFilter && file.rowFilter.rules.length > 0
      ? {
          combinator: file.rowFilter.combinator,
          rules: file.rowFilter.rules.map((r) => ({
            column: r.column,
            match: r.match ?? "isAnyOf",
            values: r.values,
          })),
        }
      : undefined;

  return {
    id: file.id,
    name: file.name,
    provider: file.provider,
    formatVersion: file.formatVersion,
    ...(file.description ? { description: file.description } : {}),
    headerSignature: file.headerSignature,
    createdAt: file.createdAt,
    schemaVersion: file.schemaVersion,
    delimiter: file.delimiter,
    decimalSeparator: file.decimalSeparator,
    encoding: file.encoding,
    mapping: file.columnMapping,
    ...(file.dateFormat ? { dateFormat: file.dateFormat } : {}),
    ...(file.timeFormat ? { timeFormat: file.timeFormat } : {}),
    amountUnit: file.unitMapping?.amount ?? "btc",
    feeUnit: file.unitMapping?.fee ?? "btc",
    feeBtcModeIn: file.feeInterpretation?.btcIn ?? "notDeducted",
    feeBtcModeOut: file.feeInterpretation?.btcOut ?? "notDeducted",
    feeFiatMode: file.feeInterpretation?.fiat ?? "net",
    ...(file.valueMapping ? { typeValueMapping: file.valueMapping } : {}),
    ...(file.fixedType ? { fixedType: file.fixedType } : {}),
    ...(rowFilter ? { rowFilter } : {}),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type PresetIssueCode =
  | "notJson"
  | "notObject"
  | "missing"
  | "invalidValue"
  | "unsupportedSchemaVersion"
  | "emptyMapping"
  | "emptyHeaderSignature"
  | "typeConflict"
  | "personalData";

export interface PresetIssue {
  code: PresetIssueCode;
  /** Dotted path of the offending field ("columnMapping.amountBtc"). */
  path: string;
  /** Allowed values or the offending value, for the message. */
  detail?: string;
}

export type PresetValidation =
  | { ok: true; file: PresetFile }
  | { ok: false; issues: PresetIssue[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: PresetIssue[],
  required: boolean,
): T | undefined {
  if (value === undefined) {
    if (required) issues.push({ code: "missing", path });
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    // Quoted: a list of allowed values that includes "," reads as nonsense
    // without them ("delimiter must be one of ,, ;").
    issues.push({
      code: "invalidValue",
      path,
      detail: allowed.map((v) => `"${v}"`).join(", "),
    });
    return undefined;
  }
  return value as T;
}

function checkString(
  value: unknown,
  path: string,
  issues: PresetIssue[],
  required: boolean,
): string | undefined {
  if (value === undefined || value === "") {
    if (required) issues.push({ code: "missing", path });
    return undefined;
  }
  if (typeof value !== "string") {
    issues.push({ code: "invalidValue", path });
    return undefined;
  }
  return value;
}

/**
 * Validate a parsed JSON value against the preset schema.
 *
 * Deliberately hand-written rather than a schema library: this runs in the
 * browser on a file somebody was handed, so the messages have to name the
 * field and the allowed values, and the app ships no validator otherwise.
 * `lib/importPresetFile.test.ts` holds this function and
 * config/import-presets/schema.json to the same enums, so the two cannot
 * drift apart.
 */
export function validatePresetFile(value: unknown): PresetValidation {
  const issues: PresetIssue[] = [];

  if (!isObject(value)) return { ok: false, issues: [{ code: "notObject", path: "" }] };

  if (value.schemaVersion !== PRESET_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        {
          code: "unsupportedSchemaVersion",
          path: "schemaVersion",
          detail: String(value.schemaVersion ?? ""),
        },
      ],
    };
  }

  const id = checkString(value.id, "id", issues, true);
  const name = checkString(value.name, "name", issues, true);
  const provider = checkString(value.provider, "provider", issues, true);
  const formatVersion = checkString(value.formatVersion, "formatVersion", issues, true);
  const description = checkString(value.description, "description", issues, false);
  const createdAt = checkString(value.createdAt, "createdAt", issues, true);

  const delimiter = checkEnum(value.delimiter, CSV_DELIMITERS, "delimiter", issues, true);
  const decimalSeparator = checkEnum(
    value.decimalSeparator,
    DECIMAL_SEPARATORS,
    "decimalSeparator",
    issues,
    true,
  );
  const encoding = checkEnum(value.encoding, CSV_ENCODINGS, "encoding", issues, true);
  const dateFormat = checkEnum(value.dateFormat, DATE_FORMATS, "dateFormat", issues, false);
  const timeFormat = checkEnum(value.timeFormat, TIME_FORMATS, "timeFormat", issues, false);

  // columnMapping
  const columnMapping: ColumnMapping = {};
  if (!isObject(value.columnMapping)) {
    issues.push({ code: "missing", path: "columnMapping" });
  } else {
    for (const [field, column] of Object.entries(value.columnMapping)) {
      if (!(MAPPING_FIELDS as readonly string[]).includes(field)) {
        issues.push({
          code: "invalidValue",
          path: `columnMapping.${field}`,
          detail: MAPPING_FIELDS.join(", "),
        });
        continue;
      }
      if (typeof column !== "string" || column.trim() === "") {
        issues.push({ code: "invalidValue", path: `columnMapping.${field}` });
        continue;
      }
      columnMapping[field as MappingField] = column;
    }
    if (Object.keys(columnMapping).length === 0) {
      issues.push({ code: "emptyMapping", path: "columnMapping" });
    }
  }

  // unitMapping
  let unitMapping: PresetFile["unitMapping"];
  if (value.unitMapping !== undefined) {
    if (!isObject(value.unitMapping)) {
      issues.push({ code: "invalidValue", path: "unitMapping" });
    } else {
      unitMapping = {
        amount: checkEnum(
          value.unitMapping.amount,
          AMOUNT_UNITS,
          "unitMapping.amount",
          issues,
          false,
        ),
        fee: checkEnum(value.unitMapping.fee, AMOUNT_UNITS, "unitMapping.fee", issues, false),
      };
    }
  }

  // valueMapping
  let valueMapping: Record<string, TransactionType> | undefined;
  if (value.valueMapping !== undefined) {
    if (!isObject(value.valueMapping)) {
      issues.push({ code: "invalidValue", path: "valueMapping" });
    } else {
      valueMapping = {};
      for (const [key, type] of Object.entries(value.valueMapping)) {
        const checked = checkEnum(
          type,
          TRANSACTION_TYPES,
          `valueMapping.${key}`,
          issues,
          true,
        );
        if (checked) valueMapping[key] = checked;
      }
    }
  }

  const fixedType = checkEnum(
    value.fixedType,
    TRANSACTION_TYPES,
    "fixedType",
    issues,
    false,
  );
  if (fixedType && columnMapping.type) {
    // Both would be a preset that contradicts itself: every row forced to one
    // type while a column claims to decide it.
    issues.push({ code: "typeConflict", path: "fixedType" });
  }

  // feeInterpretation
  let feeInterpretation: PresetFile["feeInterpretation"];
  if (value.feeInterpretation !== undefined) {
    if (!isObject(value.feeInterpretation)) {
      issues.push({ code: "invalidValue", path: "feeInterpretation" });
    } else {
      feeInterpretation = {
        btcIn: checkEnum(
          value.feeInterpretation.btcIn,
          BTC_FEE_MODES,
          "feeInterpretation.btcIn",
          issues,
          false,
        ),
        btcOut: checkEnum(
          value.feeInterpretation.btcOut,
          BTC_FEE_MODES,
          "feeInterpretation.btcOut",
          issues,
          false,
        ),
        fiat: checkEnum(
          value.feeInterpretation.fiat,
          FIAT_FEE_MODES,
          "feeInterpretation.fiat",
          issues,
          false,
        ),
      };
    }
  }

  // rowFilter
  let rowFilter: PresetFileRowFilter | undefined;
  if (value.rowFilter !== undefined) {
    if (!isObject(value.rowFilter) || !Array.isArray(value.rowFilter.rules)) {
      issues.push({ code: "invalidValue", path: "rowFilter" });
    } else {
      const combinator = checkEnum(
        value.rowFilter.combinator,
        ROW_FILTER_COMBINATORS,
        "rowFilter.combinator",
        issues,
        true,
      );
      const rules: PresetFileRowFilter["rules"] = [];
      value.rowFilter.rules.forEach((raw, i) => {
        if (!isObject(raw)) {
          issues.push({ code: "invalidValue", path: `rowFilter.rules[${i}]` });
          return;
        }
        const column = checkString(raw.column, `rowFilter.rules[${i}].column`, issues, true);
        const match = checkEnum(
          raw.match,
          ROW_FILTER_MATCHES,
          `rowFilter.rules[${i}].match`,
          issues,
          false,
        );
        const values = Array.isArray(raw.values)
          ? raw.values.filter((v): v is string => typeof v === "string")
          : null;
        if (values === null) {
          issues.push({ code: "invalidValue", path: `rowFilter.rules[${i}].values` });
          return;
        }
        if (column) rules.push({ column, ...(match ? { match } : {}), values });
      });
      if (combinator) rowFilter = { combinator, rules };
    }
  }

  // headerSignature
  let headerSignature: string[] = [];
  if (!Array.isArray(value.headerSignature)) {
    issues.push({ code: "missing", path: "headerSignature" });
  } else {
    headerSignature = value.headerSignature.filter(
      (h): h is string => typeof h === "string" && h.trim() !== "",
    );
    if (headerSignature.length !== value.headerSignature.length) {
      issues.push({ code: "invalidValue", path: "headerSignature" });
    }
    if (headerSignature.length === 0) {
      issues.push({ code: "emptyHeaderSignature", path: "headerSignature" });
    }
  }

  // Personal data is refused, not silently stripped: an incoming file is
  // somebody else's work, and quietly editing it would hide that it carried
  // something it should not have.
  for (const [path, values] of [
    ["headerSignature", headerSignature],
    ["valueMapping", Object.keys(valueMapping ?? {})],
    ["rowFilter.values", (rowFilter?.rules ?? []).flatMap((r) => r.values)],
  ] as const) {
    for (const v of values) {
      const reason = personalDataReason(v);
      if (reason) issues.push({ code: "personalData", path, detail: v });
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    file: {
      schemaVersion: PRESET_SCHEMA_VERSION,
      id: id!,
      name: name!,
      provider: provider!,
      formatVersion: formatVersion!,
      ...(description ? { description } : {}),
      delimiter: delimiter!,
      decimalSeparator: decimalSeparator!,
      encoding: encoding!,
      ...(dateFormat ? { dateFormat } : {}),
      ...(timeFormat ? { timeFormat } : {}),
      columnMapping,
      ...(unitMapping ? { unitMapping } : {}),
      ...(valueMapping ? { valueMapping } : {}),
      ...(fixedType ? { fixedType } : {}),
      ...(feeInterpretation ? { feeInterpretation } : {}),
      ...(rowFilter ? { rowFilter } : {}),
      headerSignature,
      createdAt: createdAt!,
    },
  };
}

/** Parse + validate in one step, for a file the user just handed over. */
export function parsePresetJson(text: string): PresetValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ code: "notJson", path: "" }] };
  }
  return validatePresetFile(parsed);
}
