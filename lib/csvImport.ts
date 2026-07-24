// CSV import: parsing, delimiter/decimal detection, column mapping, row
// validation. Pure client-side logic — file contents never leave the browser
// (spec §2). Mapping templates live in localStorage, not in the portfolio file,
// because they are device preferences, not portfolio data.

import { dec } from "./decimal";
import type { Transaction, TransactionType } from "./types";

export type CsvDelimiter = "," | ";";
export type DecimalSeparator = "." | ",";
export type CsvEncoding = "utf-8" | "iso-8859-1" | "iso-8859-15";

// ---------------------------------------------------------------------------
// Encoding detection
// ---------------------------------------------------------------------------

/**
 * Byte heuristic: valid UTF-8 (or UTF-8 BOM) wins; otherwise Latin-1 vs
 * Latin-9, where 0xA4 (€ in ISO-8859-15, rare ¤ in ISO-8859-1) decides —
 * in financial CSVs a Euro sign is far more likely than a currency sign.
 */
export function detectEncoding(buffer: ArrayBuffer): CsvEncoding {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return bytes.includes(0xa4) ? "iso-8859-15" : "iso-8859-1";
  }
}

export function decodeCsvBuffer(buffer: ArrayBuffer, encoding: CsvEncoding): string {
  return new TextDecoder(encoding).decode(buffer);
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180: quoted fields, escaped quotes, CR/LF)
// ---------------------------------------------------------------------------

export function parseCsv(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip BOM so the first header cell matches template lookups.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop rows that are entirely empty (trailing newlines, blank lines).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Count delimiter occurrences outside quoted sections. */
function countUnquoted(line: string, ch: string): number {
  let n = 0;
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ch && !inQuotes) n++;
  }
  return n;
}

export function detectDelimiter(text: string): CsvDelimiter {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").slice(0, 10);
  let commas = 0;
  let semicolons = 0;
  for (const l of lines) {
    commas += countUnquoted(l, ",");
    semicolons += countUnquoted(l, ";");
  }
  return semicolons > commas ? ";" : ",";
}

const COMMA_DECIMAL = /^-?\d{1,3}(\.\d{3})+,\d+$|^-?\d+,\d+$/;
const DOT_DECIMAL = /^-?\d{1,3}(,\d{3})+\.\d+$|^-?\d+\.\d+$/;

export function detectDecimalSeparator(rows: string[][]): DecimalSeparator {
  let comma = 0;
  let dot = 0;
  for (const row of rows.slice(0, 50)) {
    for (const cell of row) {
      const v = cell.trim();
      if (COMMA_DECIMAL.test(v)) comma++;
      else if (DOT_DECIMAL.test(v)) dot++;
    }
  }
  return comma > dot ? "," : ".";
}

// ---------------------------------------------------------------------------
// Value normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a localized number string to a plain decimal string. Currency
 * markers (€, "EUR") and thousands separators are stripped first, so
 * "1.234,56 €" with comma separator → "1234.56". Returns null if not a
 * valid number.
 */
export function normalizeNumber(
  raw: string,
  decimalSep: DecimalSeparator,
): string | null {
  let s = raw
    .replace(/€/g, "")
    .replace(/\beur\b/gi, "")
    .trim()
    .replace(/\s| /g, "");
  if (s === "") return null;
  if (decimalSep === ",") s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}

const TYPE_SYNONYMS: Record<string, TransactionType> = {
  buy: "buy",
  kauf: "buy",
  purchase: "buy",
  sell: "sell",
  verkauf: "sell",
  sale: "sell",
  transfer_in: "transfer_in",
  deposit: "transfer_in",
  einzahlung: "transfer_in",
  in: "transfer_in",
  transfer_out: "transfer_out",
  withdrawal: "transfer_out",
  auszahlung: "transfer_out",
  out: "transfer_out",
  spend: "spend",
  ausgabe: "spend",
  payment: "spend",
  zahlung: "spend",
};

/** Map a CSV type value ("Kauf", "buy", "withdrawal" …) to a TransactionType. */
export function normalizeType(raw: string): TransactionType | null {
  return TYPE_SYNONYMS[raw.trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? null;
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

export const DATE_FORMATS = [
  "iso",
  "de",
  "mdy",
  "dmy",
  "ymd",
  "unix-s",
  "unix-ms",
] as const;

export type CsvDateFormat = (typeof DATE_FORMATS)[number];

const OPTIONAL_TIME = "(?:[ T](\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?$";
const GERMAN_DATE = new RegExp(`^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})${OPTIONAL_TIME}`);
const SLASH_DATE = new RegExp(`^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})${OPTIONAL_TIME}`);
const YMD_SLASH_DATE = new RegExp(`^(\\d{4})\\/(\\d{1,2})\\/(\\d{1,2})${OPTIONAL_TIME}`);

/** Local date from parts, rejecting rolled-over dates like 32.01.2024. */
function fromParts(
  y: string,
  mo: string,
  d: string,
  h?: string,
  mi?: string,
  se?: string,
): string | null {
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h ?? 0),
    Number(mi ?? 0),
    Number(se ?? 0),
  );
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return date.toISOString();
}

function parseIsoDate(s: string): string | null {
  if (!/^\d{4}-\d{1,2}-\d{1,2}([ T]|$)/.test(s)) return null;
  const date = new Date(s.includes("T") || s.length <= 10 ? s : s.replace(" ", "T"));
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/** Parse a date string in one specific format → ISO, or null. */
export function parseDateWithFormat(
  raw: string,
  format: CsvDateFormat,
): string | null {
  const s = raw.trim();
  if (s === "") return null;
  switch (format) {
    case "iso":
      return parseIsoDate(s);
    case "de": {
      const m = GERMAN_DATE.exec(s);
      return m ? fromParts(m[3], m[2], m[1], m[4], m[5], m[6]) : null;
    }
    case "mdy": {
      const m = SLASH_DATE.exec(s);
      return m ? fromParts(m[3], m[1], m[2], m[4], m[5], m[6]) : null;
    }
    case "dmy": {
      const m = SLASH_DATE.exec(s);
      return m ? fromParts(m[3], m[2], m[1], m[4], m[5], m[6]) : null;
    }
    case "ymd": {
      const m = YMD_SLASH_DATE.exec(s);
      return m ? fromParts(m[1], m[2], m[3], m[4], m[5], m[6]) : null;
    }
    case "unix-s":
      return /^\d{9,11}$/.test(s)
        ? new Date(Number(s) * 1000).toISOString()
        : null;
    case "unix-ms":
      return /^\d{12,14}$/.test(s) ? new Date(Number(s)).toISOString() : null;
  }
}

/**
 * Flexible parse for manual edits/validation: ISO-8601 or German
 * "DD.MM.YYYY[ HH:mm[:ss]]" (unambiguous formats only).
 */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return null;
  return parseIsoDate(s) ?? parseDateWithFormat(s, "de");
}

/**
 * Detect the date format of a column from sample values. All samples must
 * agree on one format; returns null when ambiguous (e.g. slash dates where
 * day/month cannot be told apart) so the user can choose manually.
 */
export function detectDateFormat(samples: string[]): CsvDateFormat | null {
  const vals = samples
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .slice(0, 20);
  if (vals.length === 0) return null;
  const all = (re: RegExp) => vals.every((v) => re.test(v));
  if (all(/^\d{4}-\d{1,2}-\d{1,2}([ T].*)?$/)) return "iso";
  if (all(/^\d{1,2}\.\d{1,2}\.\d{4}([ T].*)?$/)) return "de";
  if (all(/^\d{4}\/\d{1,2}\/\d{1,2}([ T].*)?$/)) return "ymd";
  if (all(/^\d{1,2}\/\d{1,2}\/\d{4}([ T].*)?$/)) {
    const firstGt12 = vals.some((v) => Number(v.split("/")[0]) > 12);
    const secondGt12 = vals.some((v) => Number(v.split("/")[1]) > 12);
    if (firstGt12 && !secondGt12) return "dmy";
    if (secondGt12 && !firstGt12) return "mdy";
    return null;
  }
  if (all(/^\d{9,11}$/)) return "unix-s";
  if (all(/^\d{12,14}$/)) return "unix-ms";
  return null;
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

export const MAPPING_FIELDS = [
  "type",
  "date",
  "amountBtc",
  "pricePerBtcEur",
  "totalFiatEur",
  "feeBtc",
  "feeFiatEur",
  "note",
] as const;

export type MappingField = (typeof MAPPING_FIELDS)[number];

export const REQUIRED_FIELDS: MappingField[] = ["type", "date", "amountBtc"];

/** Target field → CSV column header (survives column reordering). */
export type ColumnMapping = Partial<Record<MappingField, string>>;

const HEADER_GUESSES: Record<MappingField, RegExp> = {
  type: /^(type|typ|art|side|richtung)$/i,
  date: /^(date|datum|time|timestamp|zeit(punkt)?|created)/i,
  amountBtc: /(amount|menge|anzahl|btc|size|volume)/i,
  pricePerBtcEur: /(price|preis|kurs|rate)/i,
  totalFiatEur: /(total|summe|gesamt|betrag|kosten|cost)/i,
  feeBtc: /^fee.?btc$|geb(ü|u)hr.?btc/i,
  feeFiatEur: /(fee.?(eur|fiat)|geb(ü|u)hr.?(eur|fiat)|^fee$|^geb(ü|u)hr$)/i,
  note: /(note|notiz|comment|kommentar|memo|beschreibung|description)/i,
};

/** Suggest a mapping from header names (best-effort, user can override). */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<string>();
  for (const field of MAPPING_FIELDS) {
    const hit = headers.find(
      (h) => !taken.has(h) && HEADER_GUESSES[field].test(h.trim()),
    );
    if (hit !== undefined) {
      mapping[field] = hit;
      taken.add(hit);
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Row conversion + validation
// ---------------------------------------------------------------------------

/** Editable, normalized values of one CSV row (all plain strings). */
export interface ImportRowValues {
  type: string;
  date: string;
  amountBtc: string;
  pricePerBtcEur: string;
  totalFiatEur: string;
  feeBtc: string;
  feeFiatEur: string;
  note: string;
}

export interface ImportRow {
  id: string;
  /** 1-based line number in the CSV (after the header row). */
  line: number;
  values: ImportRowValues;
  excluded: boolean;
}

export interface BuildOptions {
  /**
   * Every row gets this type instead of a mapped column (for exports
   * without a type column, e.g. buy-only exchange reports).
   */
  fixedType?: TransactionType;
  /** Per-column date format (detected once, not guessed per row). */
  dateFormat?: CsvDateFormat;
}

/** Apply mapping + normalization to raw CSV rows → editable import rows. */
export function buildImportRows(
  rows: string[][],
  headers: string[],
  mapping: ColumnMapping,
  decimalSep: DecimalSeparator,
  { fixedType, dateFormat }: BuildOptions = {},
): ImportRow[] {
  const idx: Partial<Record<MappingField, number>> = {};
  for (const field of MAPPING_FIELDS) {
    const header = mapping[field];
    if (header === undefined) continue;
    const i = headers.indexOf(header);
    if (i >= 0) idx[field] = i;
  }
  const cell = (row: string[], field: MappingField): string => {
    const i = idx[field];
    return i === undefined ? "" : (row[i] ?? "").trim();
  };
  const num = (row: string[], field: MappingField): string => {
    const raw = cell(row, field);
    if (raw === "") return "";
    // Keep the raw value if unparseable so the user sees what failed.
    return normalizeNumber(raw, decimalSep) ?? raw;
  };
  const parseDate = (raw: string): string | null =>
    dateFormat !== undefined
      ? parseDateWithFormat(raw, dateFormat)
      : normalizeDate(raw);
  return rows.map((row, i) => ({
    id: crypto.randomUUID(),
    line: i + 1,
    excluded: false,
    values: {
      type: fixedType ?? normalizeType(cell(row, "type")) ?? cell(row, "type"),
      date: parseDate(cell(row, "date")) ?? cell(row, "date"),
      amountBtc: num(row, "amountBtc"),
      pricePerBtcEur: num(row, "pricePerBtcEur"),
      totalFiatEur: num(row, "totalFiatEur"),
      feeBtc: num(row, "feeBtc"),
      feeFiatEur: num(row, "feeFiatEur"),
      note: cell(row, "note"),
    },
  }));
}

export type RowErrorCode =
  | "invalidType"
  | "invalidDate"
  | "invalidAmount"
  | "missingPrice"
  | "invalidPrice"
  | "invalidTotal"
  | "invalidFee";

const NUMBER = /^-?\d+(\.\d+)?$/;

function positiveNumber(s: string): boolean {
  return NUMBER.test(s) && Number(s) > 0;
}

function nonNegativeOptional(s: string): boolean {
  return s === "" || (NUMBER.test(s) && Number(s) >= 0);
}

export function validateRow(v: ImportRowValues): RowErrorCode[] {
  const errors: RowErrorCode[] = [];
  const type = normalizeType(v.type);
  if (type === null) errors.push("invalidType");
  if (normalizeDate(v.date) === null) errors.push("invalidDate");
  if (!positiveNumber(v.amountBtc)) errors.push("invalidAmount");
  const needsPrice = type === "buy" || type === "sell" || type === "spend";
  if (needsPrice) {
    const hasPrice = positiveNumber(v.pricePerBtcEur);
    const hasTotal = positiveNumber(v.totalFiatEur);
    // Price OR actually paid total suffices; the other is derived on import.
    if (!hasPrice && !hasTotal) errors.push("missingPrice");
    if (v.pricePerBtcEur !== "" && !hasPrice) errors.push("invalidPrice");
    if (v.totalFiatEur !== "" && !hasTotal) errors.push("invalidTotal");
  }
  // Fees are optional; only non-empty invalid/negative values are errors.
  if (!nonNegativeOptional(v.feeBtc) || !nonNegativeOptional(v.feeFiatEur)) {
    errors.push("invalidFee");
  }
  return errors;
}

/** Convert validated row values to a Transaction. Call only if validateRow is empty. */
export function rowToTransaction(v: ImportRowValues): Transaction {
  const type = normalizeType(v.type)!;
  const isTransfer = type === "transfer_in" || type === "transfer_out";
  let price = !isTransfer && positiveNumber(v.pricePerBtcEur) ? v.pricePerBtcEur : null;
  let total = !isTransfer && positiveNumber(v.totalFiatEur) ? v.totalFiatEur : null;
  if (!isTransfer) {
    const amount = dec(v.amountBtc);
    if (price === null && total !== null) {
      price = dec(total).div(amount).toDecimalPlaces(2).toString();
    } else if (total === null && price !== null) {
      total = dec(price).mul(amount).toDecimalPlaces(2).toString();
    }
  }
  return {
    id: crypto.randomUUID(),
    type,
    date: normalizeDate(v.date)!,
    amountBtc: v.amountBtc,
    pricePerBtcEur: price,
    totalFiatEur: total,
    feeBtc: v.feeBtc === "" ? undefined : v.feeBtc,
    feeFiatEur: v.feeFiatEur === "" ? undefined : v.feeFiatEur,
    note: v.note,
  };
}

// ---------------------------------------------------------------------------
// Mapping templates (localStorage — device preference, not portfolio data)
// ---------------------------------------------------------------------------

export interface MappingTemplate {
  id: string;
  name: string;
  mapping: ColumnMapping;
  delimiter: CsvDelimiter;
  decimalSeparator: DecimalSeparator;
  /** Set when the template uses a fixed type for all rows instead of a column. */
  fixedType?: TransactionType;
  /** Date format of the mapped date column, if the user resolved one. */
  dateFormat?: CsvDateFormat;
}

const TEMPLATES_KEY = "dwo.csvMappingTemplates";

export function loadTemplates(): MappingTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as MappingTemplate[]) : [];
  } catch {
    return [];
  }
}

export function saveTemplate(tpl: MappingTemplate): MappingTemplate[] {
  const next = [...loadTemplates().filter((t) => t.name !== tpl.name), tpl];
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
  return next;
}

export function deleteTemplate(id: string): MappingTemplate[] {
  const next = loadTemplates().filter((t) => t.id !== id);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
  return next;
}

/** Template whose mapped headers all exist in this file (→ auto-suggest). */
export function findMatchingTemplate(
  templates: MappingTemplate[],
  headers: string[],
): MappingTemplate | undefined {
  return templates.find((tpl) => {
    const mapped = Object.values(tpl.mapping).filter((h): h is string => !!h);
    return mapped.length > 0 && mapped.every((h) => headers.includes(h));
  });
}
