// CSV import presets: system presets (read-only, shipped in code, one JSON
// file per provider under /config/import-presets/) and user presets
// (editable, persisted in the portfolio file's `importPresets` field — see
// CLAUDE.md §3.4). Both share the same configuration shape so the wizard can
// apply either one the same way.

import type {
  AmountUnit,
  ColumnMapping,
  CsvDateFormat,
  CsvDelimiter,
  CsvEncoding,
  CsvTimeFormat,
  DecimalSeparator,
  BtcFeeMode,
  FiatFeeMode,
  RowFilter,
  RowFilterMatch,
} from "./csvImport";
import type { TransactionType } from "./types";

import kraken from "../config/import-presets/kraken.json";
import bitpanda from "../config/import-presets/bitpanda.json";
import bitbox02 from "../config/import-presets/bitbox02.json";
import ledgerLive from "../config/import-presets/ledger-live.json";

export interface ImportPresetConfig {
  delimiter: CsvDelimiter;
  decimalSeparator: DecimalSeparator;
  encoding: CsvEncoding;
  mapping: ColumnMapping;
  /** Every row gets this type instead of a mapped column. */
  fixedType?: TransactionType;
  dateFormat?: CsvDateFormat;
  /** Format of the mapped time column, when the export has one. */
  timeFormat?: CsvTimeFormat;
  /** Buys: is the BTC fee already out of the amount? */
  feeBtcModeIn?: BtcFeeMode;
  /** Sells, spends, outgoing transfers: same question. */
  feeBtcModeOut?: BtcFeeMode;
  /** Is the EUR fee already part of the EUR amount? */
  feeFiatMode?: FiatFeeMode;
  amountUnit?: AmountUnit;
  feeUnit?: AmountUnit;
  typeValueMapping?: Record<string, TransactionType>;
  /** Row filter: only matching CSV lines are imported (see csvImport.RowFilter). */
  rowFilter?: RowFilter;
}

/** Persisted in the portfolio file (`PortfolioFile.importPresets`). */
export interface UserImportPreset extends ImportPresetConfig {
  id: string;
  name: string;
}

export interface SystemImportPreset extends ImportPresetConfig {
  id: string;
  name: string;
}

/** Unified shape for the wizard's preset picker (step 1). */
export type ImportPresetOption =
  | (SystemImportPreset & { source: "system" })
  | (UserImportPreset & { source: "user" });

interface RawPresetJson {
  name: string;
  delimiter: string;
  decimalSeparator: string;
  encoding: string;
  mapping: Record<string, string>;
  dateFormat?: string;
  timeFormat?: string;
  feeBtcModeIn?: string;
  feeBtcModeOut?: string;
  /** Pre-split single setting, still read from older user presets. */
  feeBtcMode?: string;
  feeFiatMode?: string;
  amountUnit?: string;
  feeUnit?: string;
  fixedType?: string;
  typeValueMapping?: Record<string, string>;
  rowFilter?: {
    combinator: string;
    rules: { column: string; match?: string; values: string[] }[];
  };
}

/** JSON rules may omit `match` — the common case is "keep these values". */
function toRowFilter(raw: RawPresetJson["rowFilter"]): RowFilter | undefined {
  if (!raw || raw.rules.length === 0) return undefined;
  return {
    combinator: raw.combinator === "or" ? "or" : "and",
    rules: raw.rules.map((r) => ({
      column: r.column,
      match: (r.match === "isNoneOf" ? "isNoneOf" : "isAnyOf") as RowFilterMatch,
      values: r.values,
    })),
  };
}

/** JSON has no literal-union types, so trusted static config is cast once here. */
function toSystemPreset(id: string, raw: RawPresetJson): SystemImportPreset {
  return {
    id,
    name: raw.name,
    delimiter: raw.delimiter as CsvDelimiter,
    decimalSeparator: raw.decimalSeparator as DecimalSeparator,
    encoding: raw.encoding as CsvEncoding,
    mapping: raw.mapping as ColumnMapping,
    dateFormat: raw.dateFormat as CsvDateFormat | undefined,
    timeFormat: raw.timeFormat as CsvTimeFormat | undefined,
    feeBtcModeIn: (raw.feeBtcModeIn ?? raw.feeBtcMode) as BtcFeeMode | undefined,
    feeBtcModeOut: (raw.feeBtcModeOut ?? raw.feeBtcMode) as BtcFeeMode | undefined,
    feeFiatMode: raw.feeFiatMode as FiatFeeMode | undefined,
    amountUnit: raw.amountUnit as AmountUnit | undefined,
    feeUnit: raw.feeUnit as AmountUnit | undefined,
    fixedType: raw.fixedType as TransactionType | undefined,
    typeValueMapping: raw.typeValueMapping as Record<string, TransactionType> | undefined,
    rowFilter: toRowFilter(raw.rowFilter),
  };
}

// To add another provider: drop a new JSON file into /config/import-presets/
// and add one line here.
export const SYSTEM_IMPORT_PRESETS: SystemImportPreset[] = [
  toSystemPreset("kraken", kraken),
  toSystemPreset("bitpanda", bitpanda),
  toSystemPreset("bitbox02", bitbox02),
  toSystemPreset("ledger-live", ledgerLive),
];

/** Preset whose mapped headers all exist in this file (→ auto-suggest on file load). */
export function findMatchingPreset(
  presets: ImportPresetOption[],
  headers: string[],
): ImportPresetOption | undefined {
  return presets.find((preset) => {
    const mapped = Object.values(preset.mapping).filter((h): h is string => !!h);
    return mapped.length > 0 && mapped.every((h) => headers.includes(h));
  });
}
