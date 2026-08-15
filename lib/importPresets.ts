// CSV import presets: system presets (read-only, shipped in code, one JSON
// file per provider under /config/import-presets/) and user presets
// (editable, persisted in the portfolio file's `importPresets` field — see
// CLAUDE.md §3.4). Both share the same configuration shape so the wizard can
// apply either one the same way.
//
// The *file* format those JSON files are written in — and what "export preset
// as JSON" produces — lives in lib/importPresetFile.ts, described by
// config/import-presets/schema.json. This module is the runtime side: the
// shape the wizard applies, and how a preset is recognised for a file.

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
} from "./csvImport";
import type { TransactionType } from "./types";
import { fromPresetFile, type PresetFile } from "./importPresetFile";

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

/**
 * What a preset says about itself rather than about the CSV.
 *
 * All optional: presets written before the file format existed carry none of
 * it, and a preset the user typed together in the wizard need not name a
 * provider. Nothing here changes how a file is parsed — `headerSignature` only
 * decides whether a preset is *offered* for a file, `provider`/`formatVersion`
 * only how the picker groups and sorts it.
 */
export interface PresetMetadata {
  /** Exchange, broker or wallet the export comes from; groups the picker. */
  provider?: string;
  /** The provider's export format, so several versions can live side by side. */
  formatVersion?: string;
  description?: string;
  /** Header row of a real export, for recognising a file (see matchPresets). */
  headerSignature?: string[];
  /** ISO-8601, documentation only. */
  createdAt?: string;
  /** Version of the file format this preset came in as. */
  schemaVersion?: number;
}

/** Persisted in the portfolio file (`PortfolioFile.importPresets`). */
export interface UserImportPreset extends ImportPresetConfig, PresetMetadata {
  id: string;
  name: string;
}

export interface SystemImportPreset extends ImportPresetConfig, PresetMetadata {
  id: string;
  name: string;
}

/** Unified shape for the wizard's preset picker (step 1). */
export type ImportPresetOption =
  | (SystemImportPreset & { source: "system" })
  | (UserImportPreset & { source: "user" });

/**
 * The JSON of a shipped preset, in the app.
 *
 * A `resolveJsonModule` import rather than a fetch: this is a static export
 * that has to work offline, so shipped configuration belongs in the bundle.
 * The cast is the same trade the rest of the app makes with static config —
 * JSON has no literal-union types — and it is checked twice over: by
 * `npm run presets:validate` in the build and by the test that runs every file
 * under /config/import-presets/ through `validatePresetFile`.
 */
export function toSystemPreset(json: unknown): SystemImportPreset {
  return fromPresetFile(json as PresetFile);
}

/**
 * The presets that ship with the app.
 *
 * None do at the moment — the app names no vendor it has not been contributed
 * a working export for, so the picker offers "manual/no preset" plus whatever
 * the user saves into their own file. To add one: export a working
 * configuration as JSON from the preset management (§3.4), drop the file into
 * /config/import-presets/, and add two lines here — the import and the entry.
 * `config/import-presets/example.json` is the annotated template for that; it
 * is a template rather than a provider, so it is deliberately not registered.
 */
export const SYSTEM_IMPORT_PRESETS: SystemImportPreset[] = [];

// ---------------------------------------------------------------------------
// Recognising a file
// ---------------------------------------------------------------------------

/**
 * Headers compare loosely: an export's header row is written by whoever wrote
 * the exporter, and "Amount BTC", "amount btc" and " Amount  BTC " are the same
 * column. Case, surrounding and repeated whitespace and a leading BOM are
 * therefore all ignored — the order of the columns is not compared at all.
 */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^﻿/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface PresetMatch {
  preset: ImportPresetOption;
  /** How many of the preset's signature columns the file has. */
  matched: number;
  /** How the match was made: by the shipped header signature, or by mapping. */
  via: "signature" | "mapping";
}

/**
 * Numeric-aware comparison of two format versions, newest first.
 *
 * "10" is newer than "2" and "2024.2" newer than "2024.1", which a string
 * comparison gets wrong both times. Anything that is not a number compares as
 * text, so "beta" and "v2-legacy" still sort deterministically.
 */
export function compareFormatVersions(a: string, b: string): number {
  const pa = a.split(/[^0-9a-z]+/i);
  const pb = b.split(/[^0-9a-z]+/i);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    const nx = Number(x);
    const ny = Number(y);
    if (x !== "" && y !== "" && !Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return ny - nx;
    } else if (x !== y) {
      return y.localeCompare(x);
    }
  }
  return 0;
}

/**
 * Every preset that fits this file's header row, best first.
 *
 * A preset matches when *all* of its signature columns are in the file —
 * extra columns are never a reason to reject one, because an export gains a
 * column far more often than it loses one, and a preset that still finds
 * everything it maps still works. Presets without a signature (everything
 * written before the format existed, and anything the user saved in the
 * wizard) fall back to their mapped columns, which is the rule this had
 * before.
 *
 * Ranking: a signature match beats a mapping match, more matched columns beat
 * fewer, then the newer format version, then the name — so several versions of
 * one provider's format come out newest first and the choice is stable.
 */
export function matchPresets(
  presets: ImportPresetOption[],
  headers: string[],
): PresetMatch[] {
  const have = new Set(headers.map(normalizeHeader));
  const matches: PresetMatch[] = [];

  for (const preset of presets) {
    const signature = (preset.headerSignature ?? []).filter((h) => h.trim() !== "");
    if (signature.length > 0) {
      if (signature.every((h) => have.has(normalizeHeader(h)))) {
        matches.push({ preset, matched: signature.length, via: "signature" });
      }
      continue;
    }
    const mapped = Object.values(preset.mapping).filter((h): h is string => !!h);
    if (mapped.length > 0 && mapped.every((h) => have.has(normalizeHeader(h)))) {
      matches.push({ preset, matched: mapped.length, via: "mapping" });
    }
  }

  return matches.sort(
    (a, b) =>
      (a.via === b.via ? 0 : a.via === "signature" ? -1 : 1) ||
      b.matched - a.matched ||
      compareFormatVersions(
        a.preset.formatVersion ?? "",
        b.preset.formatVersion ?? "",
      ) ||
      a.preset.name.localeCompare(b.preset.name),
  );
}

/** The single best candidate, or none — what the wizard preselects. */
export function findMatchingPreset(
  presets: ImportPresetOption[],
  headers: string[],
): ImportPresetOption | undefined {
  return matchPresets(presets, headers)[0]?.preset;
}

/**
 * Presets grouped by provider for the picker, providers alphabetical, and
 * inside a provider the newest format version first. Presets without a
 * provider come last, under an empty key — they are the ones somebody saved
 * in the wizard without saying where the export came from.
 */
export function groupByProvider<T extends { provider?: string; name: string; formatVersion?: string }>(
  presets: T[],
): { provider: string; presets: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const preset of presets) {
    const key = preset.provider?.trim() ?? "";
    const list = groups.get(key);
    if (list) list.push(preset);
    else groups.set(key, [preset]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([provider, list]) => ({
      provider,
      presets: list.sort(
        (x, y) =>
          compareFormatVersions(x.formatVersion ?? "", y.formatVersion ?? "") ||
          x.name.localeCompare(y.name),
      ),
    }));
}
