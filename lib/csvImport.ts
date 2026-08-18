// CSV import: parsing, delimiter/decimal detection, column mapping, row
// validation. Pure client-side logic — file contents never leave the browser
// (spec §2). Reusable import presets (system + user) live in
// lib/importPresets.ts and PortfolioFile.importPresets (see CLAUDE.md §3.4).

import { btcString, dec, fiatString } from "./decimal";
import {
  isValidBitcoinAddress,
  isValidTxid,
  normalizeBitcoinAddress,
  normalizeTxid,
} from "./bitcoin";
import type { EurValuationSource, Transaction, TransactionType } from "./types";
import { isOutflow, isPriced } from "./types";

export type CsvDelimiter = "," | ";";
export type DecimalSeparator = "." | ",";
export type CsvEncoding = "utf-8" | "iso-8859-1" | "iso-8859-15";
export type AmountUnit = "btc" | "sats";

/**
 * Is the mapped BTC fee already taken out of the mapped BTC amount? "deducted"
 * means the amount is what was really received/sent, "notDeducted" that the fee
 * is still part of it (e.g. a withdrawal row showing what left the account).
 *
 * Asked once per direction, because one file commonly uses both: an exchange's
 * spot buy rows report the amount with the trading fee already taken off, while
 * its withdrawal rows report the total that left the account, fee included. One
 * answer for the whole file would make the other direction wrong by exactly the
 * fee sum — which is what a balance that refuses to reach zero looks like.
 */
export const BTC_FEE_MODES = ["deducted", "notDeducted"] as const;

export type BtcFeeMode = (typeof BTC_FEE_MODES)[number];

/**
 * Is the mapped EUR fee already part of the mapped EUR amount? "gross" means
 * the amount is the money that actually moved, fee included; "net" that the fee
 * comes on top of it (the common export shape: trade value and fee in separate
 * columns).
 */
export const FIAT_FEE_MODES = ["gross", "net"] as const;

export type FiatFeeMode = (typeof FIAT_FEE_MODES)[number];

export const SATS_PER_BTC = 100_000_000;

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
  gift_in: "gift_in",
  gift: "gift_in",
  geschenk: "gift_in",
  schenkung: "gift_in",
  gift_out: "gift_out",
  verschenkt: "gift_out",
  income: "income",
  einkommen: "income",
  einkuenfte: "income",
  reward: "income",
  earn: "income",
  mining: "income",
  verguetung: "income",
};

/**
 * Currency/asset code of the original settlement, stored upper case and without
 * surrounding noise ("usdt " → "USDT"). A pair like "BTC/USDT" keeps only the
 * quote side, which is what was actually paid.
 */
export function normalizeCurrencyCode(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (s === "") return "";
  const parts = s.split(/[\/\-_]/).filter((p) => p !== "");
  return (parts.length > 1 ? parts[parts.length - 1] : s).slice(0, 12);
}

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
 * Parse an import row's date: the column's detected/chosen format first, with
 * the flexible parse as a fallback so a value the user types into the preview
 * (ISO or German) is accepted too.
 */
export function parseImportDate(
  raw: string,
  dateFormat?: CsvDateFormat,
): string | null {
  const viaFormat =
    dateFormat !== undefined ? parseDateWithFormat(raw, dateFormat) : null;
  return viaFormat ?? normalizeDate(raw);
}

/**
 * An ISO value with an explicit zone ("…T23:30:00Z", "…+02:00") names an
 * instant, not a wall-clock date: day and time then both have to be read in
 * local terms, or recombining them would shift the timestamp.
 */
const ZONED_ISO = /[T ]\d{1,2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/i;

function localParts(iso: string): { y: string; mo: string; d: string } {
  const dt = new Date(iso);
  return {
    y: String(dt.getFullYear()),
    mo: String(dt.getMonth() + 1),
    d: String(dt.getDate()),
  };
}

/** Calendar day of a date cell, in the terms of the file's own format. */
function dayOf(
  raw: string,
  dateFormat?: CsvDateFormat,
): { y: string; mo: string; d: string } | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const german = GERMAN_DATE.exec(s);
  const slash = SLASH_DATE.exec(s);
  const ymd = YMD_SLASH_DATE.exec(s);
  if (ZONED_ISO.test(s)) {
    const parsed = parseIsoDate(s);
    if (parsed !== null) return localParts(parsed);
  }
  switch (dateFormat) {
    case "iso":
      if (iso) return { y: iso[1], mo: iso[2], d: iso[3] };
      break;
    case "de":
      if (german) return { y: german[3], mo: german[2], d: german[1] };
      break;
    case "mdy":
      if (slash) return { y: slash[3], mo: slash[1], d: slash[2] };
      break;
    case "dmy":
      if (slash) return { y: slash[3], mo: slash[2], d: slash[1] };
      break;
    case "ymd":
      if (ymd) return { y: ymd[1], mo: ymd[2], d: ymd[3] };
      break;
    case "unix-s":
    case "unix-ms": {
      const parsed = parseDateWithFormat(s, dateFormat);
      if (parsed !== null) return localParts(parsed);
      break;
    }
    default:
      break;
  }
  // No format given, or a value that no longer matches the column's format
  // (the preview stores dates as "YYYY-MM-DD"): ISO or German, the same two
  // forms normalizeDate accepts.
  if (iso) return { y: iso[1], mo: iso[2], d: iso[3] };
  return german && { y: german[3], mo: german[2], d: german[1] };
}

// ---------------------------------------------------------------------------
// Time parsing
//
// The clock time is its own mapping field: some exports keep it in a separate
// column ("Datum" + "Uhrzeit"), others in the same column as the date — then
// both fields point at that one column and it is parsed once.
// ---------------------------------------------------------------------------

export const TIME_FORMATS = ["hms", "h12", "datetime"] as const;

export type CsvTimeFormat = (typeof TIME_FORMATS)[number];

// Sub-second digits are tolerated and dropped: some exports write
// "23:53:28.645", and the ledger keeps whole seconds.
const FRACTION = "(?:[.,]\\d+)?";
const TIME_24H = new RegExp(`^(\\d{1,2}):(\\d{2})(?::(\\d{2})${FRACTION})?$`);
const TIME_12H = new RegExp(
  `^(\\d{1,2}):(\\d{2})(?::(\\d{2})${FRACTION})?\\s*(am|pm)$`,
  "i",
);
/** Clock time inside a full date-time value ("05.01.2024 14:30", ISO). */
const TIME_IN_VALUE = /[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/;

export interface ClockTime {
  h: number;
  m: number;
  s: number;
}

function clock(
  h: string,
  m: string,
  s: string | undefined,
  ampm?: string,
): ClockTime | null {
  let hours = Number(h);
  if (ampm !== undefined) {
    if (hours < 1 || hours > 12) return null;
    if (ampm.toLowerCase() === "pm") hours = hours === 12 ? 12 : hours + 12;
    else hours = hours === 12 ? 0 : hours;
  }
  const minutes = Number(m);
  const seconds = Number(s ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return { h: hours, m: minutes, s: seconds };
}

/** Parse a time cell in one specific format, or null. */
export function parseTimeWithFormat(
  raw: string,
  format: CsvTimeFormat,
): ClockTime | null {
  const s = raw.trim();
  if (s === "") return null;
  switch (format) {
    case "hms": {
      const m = TIME_24H.exec(s);
      return m ? clock(m[1], m[2], m[3]) : null;
    }
    case "h12": {
      const m = TIME_12H.exec(s);
      return m ? clock(m[1], m[2], m[3], m[4]) : null;
    }
    case "datetime": {
      // Read the clock time off the parsed instant where possible, so a zoned
      // value ("…T14:30:00Z") yields the local time it stands for. The literal
      // match covers formats the flexible parser does not know (07/24/2026),
      // whose day is read literally as well.
      if (/^\d{9,14}$/.test(s)) {
        const iso = parseDateWithFormat(s, s.length <= 11 ? "unix-s" : "unix-ms");
        if (iso === null) return null;
        const dt = new Date(iso);
        return { h: dt.getHours(), m: dt.getMinutes(), s: dt.getSeconds() };
      }
      const m = TIME_IN_VALUE.exec(s);
      if (m === null) return null;
      const iso = normalizeDate(s);
      if (iso !== null) {
        const dt = new Date(iso);
        return { h: dt.getHours(), m: dt.getMinutes(), s: dt.getSeconds() };
      }
      return clock(m[1], m[2], m[3]);
    }
  }
}

/** The column's format first, then any recognizable form (for manual edits). */
export function parseImportTime(
  raw: string,
  timeFormat?: CsvTimeFormat,
): ClockTime | null {
  const s = raw.trim();
  if (s === "") return null;
  const viaFormat =
    timeFormat !== undefined ? parseTimeWithFormat(s, timeFormat) : null;
  if (viaFormat !== null) return viaFormat;
  for (const format of TIME_FORMATS) {
    const hit = parseTimeWithFormat(s, format);
    if (hit !== null) return hit;
  }
  return null;
}

/** A clock time as "HH:MM:SS" — what the preview shows and validates against. */
export function formatClockTime({ h, m, s }: ClockTime): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * The time for a preview row: readable values become "HH:MM:SS" (so a column
 * that holds the whole timestamp shows just its time, and an AM/PM value shows
 * the 24-hour one), anything unreadable stays as it is so the row can be
 * flagged and fixed.
 */
export function normalizeTimeCell(raw: string, timeFormat?: CsvTimeFormat): string {
  const parsed = parseImportTime(raw, timeFormat);
  return parsed === null ? raw.trim() : formatClockTime(parsed);
}

/**
 * The date for a preview row: read with the column's format and written back as
 * "YYYY-MM-DD", so the preview shows a real date instead of whatever shape the
 * file uses (a unix timestamp, "07/24/2026", an ISO value with a zone offset).
 * A value that cannot be read stays verbatim so the row can be fixed.
 *
 * The calendar day is the local one — an ISO value with an offset names an
 * instant, and its clock time is read in local terms too (`normalizeTimeCell`),
 * so date and time together still mean the same moment.
 */
export function normalizeDateCell(raw: string, dateFormat?: CsvDateFormat): string {
  const day = dayOf(raw, dateFormat);
  if (day === null || parseImportDate(raw, dateFormat) === null) return raw.trim();
  const pad = (v: string) => v.padStart(2, "0");
  return `${day.y.padStart(4, "0")}-${pad(day.mo)}-${pad(day.d)}`;
}

/** Detect the format of a time column from sample values (see detectDateFormat). */
export function detectTimeFormat(samples: string[]): CsvTimeFormat | null {
  const vals = samples
    .map((v) => v.trim())
    .filter((v) => v !== "")
    .slice(0, 20);
  if (vals.length === 0) return null;
  return (
    TIME_FORMATS.find((format) =>
      vals.every((v) => parseTimeWithFormat(v, format) !== null),
    ) ?? null
  );
}

export interface DateTimeFormats {
  dateFormat?: CsvDateFormat;
  timeFormat?: CsvTimeFormat;
}

/**
 * The row's timestamp from its date and time cell. Both fields pointing at the
 * same column means the value carries date and time together, so it is parsed
 * once; otherwise the time cell's clock time is applied to the date's calendar
 * day, the way "01.02.2024 10:30" in a single cell has always been read.
 */
export function parseImportDateTime(
  date: string,
  time: string,
  { dateFormat, timeFormat }: DateTimeFormats = {},
): string | null {
  const t = time.trim();
  // Both fields on one raw value (a hand-typed timestamp): parse it once.
  if (t !== "" && t === date.trim()) return parseImportDate(date, dateFormat);
  const day = dayOf(date, dateFormat);
  if (day === null) return null;
  let clock = t === "" ? null : parseImportTime(t, timeFormat);
  if (t !== "" && clock === null) return null;
  // Nothing mapped to the time field: a date value that carries its own clock
  // time keeps it, a plain date means local midnight of that day.
  if (clock === null) clock = parseImportTime(date, "datetime") ?? { h: 0, m: 0, s: 0 };
  return fromParts(
    day.y,
    day.mo,
    day.d,
    String(clock.h),
    String(clock.m),
    String(clock.s),
  );
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
  "time",
  "amountBtc",
  "pricePerBtcEur",
  "totalFiatEur",
  "feeBtc",
  "feeFiatEur",
  "originalCurrency",
  "originalAmount",
  "originalPricePerBtc",
  "txid",
  "address",
  "note",
] as const;

export type MappingField = (typeof MAPPING_FIELDS)[number];

export const REQUIRED_FIELDS: MappingField[] = ["type", "date", "time", "amountBtc"];

/** Target field → CSV column header (survives column reordering). */
export type ColumnMapping = Partial<Record<MappingField, string>>;

/**
 * How a header is matched to a field, strongest signal first: the whole header
 * name (`exact`), every word of a phrase somewhere in the header in any order
 * (`word` — "fee btc" matches "Fee (BTC)" and "BTC network fee"), or a plain
 * substring (`part`, for glued headers like "amountbtc"). A hit on `avoid`
 * rules the header out for that field, which is what keeps "Amount Fiat" out of
 * the BTC amount and "Fee unit" out of the fee.
 */
interface HeaderRules {
  exact?: string[];
  word?: string[];
  part?: string[];
  avoid?: string[];
}

const HEADER_RULES: Record<MappingField, HeaderRules> = {
  type: {
    exact: ["type", "typ", "art", "side", "richtung", "direction"],
    word: ["type", "typ", "art", "side", "richtung", "direction"],
    part: ["type", "typ"],
    avoid: [
      "asset",
      "address",
      "adresse",
      "currency",
      "wahrung",
      "unit",
      "fee",
      "wallet",
    ],
  },
  date: {
    exact: [
      "date",
      "datum",
      "time",
      "timestamp",
      "zeit",
      "zeitpunkt",
      "created",
      "created at",
      "datetime",
      "date time",
      "buchungstag",
      "valuta",
    ],
    word: [
      "date",
      "datum",
      "time",
      "timestamp",
      "zeit",
      "zeitpunkt",
      "created",
      "executed",
      "buchungstag",
    ],
    part: ["date", "datum", "zeit", "time"],
  },
  time: {
    exact: ["time", "zeit", "uhrzeit", "uhr", "clock time"],
    word: ["time", "zeit", "uhrzeit", "uhr"],
    part: ["uhrzeit"],
    avoid: ["zone", "force", "stamp"],
  },
  amountBtc: {
    exact: [
      "amount",
      "menge",
      "anzahl",
      "size",
      "volume",
      "vol",
      "quantity",
      "qty",
      "btc",
    ],
    word: [
      "amount",
      "menge",
      "anzahl",
      "size",
      "volume",
      "vol",
      "quantity",
      "qty",
      "btc",
      "bitcoin",
      "sats",
    ],
    part: ["amount", "menge", "btc", "vol"],
    // Anything naming fiat, a price or a fee is not the BTC amount.
    avoid: [
      "fee",
      "gebuhr",
      "fiat",
      "eur",
      "usd",
      "euro",
      "price",
      "preis",
      "kurs",
      "rate",
      "total",
      "unit",
      "currency",
      "wahrung",
    ],
  },
  pricePerBtcEur: {
    exact: [
      "price",
      "preis",
      "kurs",
      "rate",
      "unit price",
      "market price",
      "spot price",
    ],
    word: ["price", "preis", "kurs", "rate"],
    part: ["price", "preis", "kurs"],
    avoid: ["fee", "gebuhr", "currency", "wahrung", "ticker", "symbol"],
  },
  totalFiatEur: {
    exact: [
      "total",
      "summe",
      "gesamt",
      "betrag",
      "kosten",
      "cost",
      "amount fiat",
      "fiat amount",
      "gegenwert",
      "countervalue",
      "proceeds",
    ],
    word: [
      "total",
      "summe",
      "gesamt",
      "betrag",
      "kosten",
      "cost",
      "gegenwert",
      "countervalue",
      "proceeds",
      "amount fiat",
      "amount eur",
      "value eur",
      "value fiat",
    ],
    part: ["total", "summe", "gesamt", "betrag", "kosten", "cost"],
    // "Countervalue Ticker" names a currency, "Countervalue at ..." the value.
    avoid: ["fee", "gebuhr", "currency", "wahrung", "unit", "ticker", "symbol"],
  },
  feeBtc: {
    exact: [
      "fee btc",
      "fees btc",
      "gebuhr btc",
      "gebuhren btc",
      "network fee",
      "miner fee",
    ],
    word: [
      "fee btc",
      "fees btc",
      "gebuhr btc",
      "gebuhren btc",
      "fee bitcoin",
      "fee sats",
      "fee satoshis",
    ],
    part: ["feebtc", "feesbtc", "gebuhrbtc", "feesats"],
    avoid: ["eur", "usd", "euro", "fiat", "currency", "wahrung", "unit"],
  },
  feeFiatEur: {
    exact: ["fee", "fees", "gebuhr", "gebuhren", "commission", "provision"],
    word: [
      "fee eur",
      "fees eur",
      "gebuhr eur",
      "gebuhren eur",
      "fee fiat",
      "fee usd",
      "fee euro",
      "commission",
      "provision",
      "fee",
      "fees",
      "gebuhr",
      "gebuhren",
    ],
    part: ["fee", "gebuhr"],
    avoid: ["btc", "bitcoin", "sats", "currency", "wahrung", "unit"],
  },
  originalCurrency: {
    exact: [
      "currency",
      "wahrung",
      "quote currency",
      "quote asset",
      "settlement currency",
    ],
    word: ["quote currency", "quote asset", "settlement currency", "currency code"],
    part: ["quotecurrency", "quoteasset"],
    avoid: ["fee", "gebuhr", "base", "amount", "menge"],
  },
  originalAmount: {
    exact: ["quote amount", "amount quote", "total quote", "cost quote"],
    word: ["quote amount", "amount quote", "total quote"],
    avoid: ["fee", "gebuhr", "eur", "fiat", "btc", "base"],
  },
  originalPricePerBtc: {
    exact: ["quote price", "price quote", "quote rate"],
    word: ["quote price", "price quote", "quote rate"],
    avoid: ["fee", "gebuhr", "eur", "fiat", "amount", "menge"],
  },
  txid: {
    exact: [
      "txid",
      "tx id",
      "tx hash",
      "txhash",
      "transaction id",
      "transaction hash",
      "transaktions id",
      "transaktionsid",
      "hash",
    ],
    word: [
      "txid",
      "tx id",
      "tx hash",
      "transaction id",
      "transaction hash",
      "transaktions id",
      "transaktion id",
      "hash",
    ],
    part: ["txid", "txhash", "transactionid", "transactionhash", "transaktionsid"],
  },
  address: {
    exact: [
      "address",
      "adresse",
      "empfanger",
      "recipient",
      "destination",
      "to address",
      "from address",
      "wallet address",
      "zieladresse",
    ],
    word: [
      "address",
      "adresse",
      "empfanger",
      "empfangeradresse",
      "recipient",
      "destination",
    ],
    part: ["address", "adresse"],
    avoid: ["type", "typ", "label", "tag"],
  },
  note: {
    exact: [
      "note",
      "notiz",
      "comment",
      "kommentar",
      "memo",
      "beschreibung",
      "description",
      "label",
      "tag",
      "reference",
      "verwendungszweck",
      "bemerkung",
    ],
    word: [
      "note",
      "notiz",
      "comment",
      "kommentar",
      "memo",
      "beschreibung",
      "description",
      "verwendungszweck",
      "bemerkung",
    ],
    part: ["note", "notiz", "memo", "kommentar"],
  },
};

interface NormalizedHeader {
  /** Lower case, umlauts folded, separators turned into single spaces. */
  text: string;
  words: string[];
  /** Same without spaces, so "amount btc" also matches the part "amountbtc". */
  squashed: string;
}

function normalizeHeader(header: string): NormalizedHeader {
  const text = header
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return {
    text,
    words: text.split(" ").filter((w) => w !== ""),
    squashed: text.replace(/ /g, ""),
  };
}

/** 0 = no match; a longer phrase scores higher than a single word. */
function scoreHeader(rules: HeaderRules, h: NormalizedHeader): number {
  if (h.text === "") return 0;
  if (rules.avoid?.some((a) => h.words.includes(a))) return 0;
  if (rules.exact?.includes(h.text)) return 100;
  let best = 0;
  for (const phrase of rules.word ?? []) {
    const tokens = phrase.split(" ");
    if (tokens.every((token) => h.words.includes(token))) {
      best = Math.max(best, 60 + 10 * (tokens.length - 1));
    }
  }
  if (best > 0) return best;
  return rules.part?.some((p) => h.squashed.includes(p.replace(/ /g, ""))) ? 30 : 0;
}

/** Does every value in this column carry a clock time (alone or after a date)? */
function columnHasTime(rows: string[][], headers: string[], header: string): boolean {
  const i = headers.indexOf(header);
  if (i < 0) return false;
  const samples = rows
    .map((r) => (r[i] ?? "").trim())
    .filter((v) => v !== "")
    .slice(0, 20);
  return samples.length > 0 && samples.every((v) => parseImportTime(v) !== null);
}

/**
 * Suggest a mapping from header names (best-effort, the user can override every
 * field in the wizard). Every field/column pair is scored, then the best pairs
 * are taken first — so an exact "type" beats "ordertype" elsewhere in the file
 * and a column only ends up on a field when nothing fits it better. Equal
 * scores go to the earlier field and then the earlier column, i.e. the first
 * column that says "type" wins.
 *
 * With `dataRows` given, the time field is settled against the values: a time
 * column of its own is only kept when it really holds clock times, and a date
 * column that carries the time as well fills the time field too.
 */
export function guessMapping(headers: string[], dataRows?: string[][]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const candidates: {
    field: MappingField;
    fieldRank: number;
    column: number;
    score: number;
  }[] = [];
  MAPPING_FIELDS.forEach((field, fieldRank) => {
    normalized.forEach((h, column) => {
      const score = scoreHeader(HEADER_RULES[field], h);
      if (score > 0) candidates.push({ field, fieldRank, column, score });
    });
  });
  candidates.sort(
    (a, b) => b.score - a.score || a.fieldRank - b.fieldRank || a.column - b.column,
  );

  const mapping: ColumnMapping = {};
  // By header name, not index: the mapping stores names, so two columns sharing
  // a name cannot be told apart later anyway.
  const taken = new Set<string>();
  for (const { field, column } of candidates) {
    const header = headers[column];
    if (mapping[field] !== undefined || taken.has(header)) continue;
    mapping[field] = header;
    taken.add(header);
  }

  // The time field is checked against the data: a header alone can be
  // misleading ("Time in force" is not a clock time), and one column holding
  // date and time fills both fields (CLAUDE.md §3.4).
  const dateHeader = mapping.date;
  if (dataRows !== undefined && dateHeader !== undefined) {
    if (
      mapping.time !== undefined &&
      !columnHasTime(dataRows, headers, mapping.time)
    ) {
      delete mapping.time;
    }
    // The time is required, so it always falls back to the date column: that
    // is right for a column holding the whole timestamp, and for a date-only
    // export it makes the missing time visible instead of blocking the wizard.
    if (mapping.time === undefined) mapping.time = dateHeader;
  }
  return mapping;
}

/**
 * Trimmed, non-empty values of a column with how often each occurs, in
 * first-seen order. Drives both the type-value step and the row filter's
 * value picker.
 */
export function columnValueCounts(
  rows: string[][],
  headers: string[],
  header: string | undefined,
): { value: string; count: number }[] {
  if (header === undefined) return [];
  const i = headers.indexOf(header);
  if (i < 0) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = (row[i] ?? "").trim();
    if (v === "") continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }));
}

/** Unique, trimmed, non-empty values of a mapped column, in first-seen order. */
export function distinctColumnValues(
  rows: string[][],
  headers: string[],
  header: string | undefined,
): string[] {
  return columnValueCounts(rows, headers, header).map((v) => v.value);
}

// ---------------------------------------------------------------------------
// Row filter — which CSV lines take part in the import at all
// ---------------------------------------------------------------------------

/** How a rule compares a cell against its selected values. */
export type RowFilterMatch = "isAnyOf" | "isNoneOf";

export type RowFilterCombinator = "and" | "or";

/** One condition: "column X is (not) one of these values". */
export interface RowFilterRule {
  /** CSV column header (not a mapped field — the filter runs on raw columns). */
  column: string;
  match: RowFilterMatch;
  /** Selected values, trimmed exactly as shown in the wizard. */
  values: string[];
}

export interface RowFilter {
  combinator: RowFilterCombinator;
  rules: RowFilterRule[];
}

export const EMPTY_ROW_FILTER: RowFilter = { combinator: "and", rules: [] };

/**
 * Rules that can actually decide anything for this file: a rule without
 * selected values is still being configured, and one naming a column the file
 * does not have (e.g. a preset made for a different export) must not silently
 * drop every row — both are ignored.
 */
export function activeFilterRules(
  headers: string[],
  filter: RowFilter | undefined,
): RowFilterRule[] {
  if (!filter) return [];
  return filter.rules.filter((r) => r.values.length > 0 && headers.includes(r.column));
}

/** Rules referencing a column this file does not have (surfaced as a warning). */
export function unknownFilterColumns(
  headers: string[],
  filter: RowFilter | undefined,
): string[] {
  if (!filter) return [];
  return [
    ...new Set(
      filter.rules.map((r) => r.column).filter((c) => c !== "" && !headers.includes(c)),
    ),
  ];
}

export function rowMatchesFilter(
  row: string[],
  headers: string[],
  filter: RowFilter | undefined,
): boolean {
  const rules = activeFilterRules(headers, filter);
  if (rules.length === 0) return true;
  const test = (rule: RowFilterRule): boolean => {
    const value = (row[headers.indexOf(rule.column)] ?? "").trim();
    const hit = rule.values.includes(value);
    return rule.match === "isNoneOf" ? !hit : hit;
  };
  return filter!.combinator === "or" ? rules.some(test) : rules.every(test);
}

export function filterRows(
  rows: string[][],
  headers: string[],
  filter: RowFilter | undefined,
): string[][] {
  const rules = activeFilterRules(headers, filter);
  if (rules.length === 0) return rows;
  return rows.filter((row) => rowMatchesFilter(row, headers, filter));
}

// ---------------------------------------------------------------------------
// Row conversion + validation
// ---------------------------------------------------------------------------

/** Editable, normalized values of one CSV row (all plain strings). */
export interface ImportRowValues {
  type: string;
  /**
   * The date exactly as the CSV column has it (e.g. "01.02.2024", "07/24/2026",
   * a unix timestamp) — never rewritten to ISO, so the preview shows the file's
   * own value. It is parsed with the column's date format when the row is
   * validated and imported (see `parseImportDateTime`).
   */
  date: string;
  /**
   * The clock time as "HH:MM:SS" (`normalizeTimeCell`), empty when no time
   * column is mapped. A value that cannot be read is kept verbatim so the row
   * shows what has to be fixed.
   */
  time: string;
  amountBtc: string;
  pricePerBtcEur: string;
  totalFiatEur: string;
  feeBtc: string;
  feeFiatEur: string;
  /**
   * Settled in another currency or asset (CLAUDE.md §3.2) — documentation only,
   * no calculation reads these.
   */
  originalCurrency: string;
  originalAmount: string;
  originalPricePerBtc: string;
  /** On-chain data, kept only for transfer rows (see rowToTransaction). */
  txid: string;
  address: string;
  note: string;
  /**
   * Where this row's EUR value comes from. Rows the preview valued from the
   * historical Binance close carry "binance-klines"; editing the EUR value by
   * hand puts it back to "manual".
   */
  eurValuationSource: EurValuationSource;
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
  /** Format of the mapped date column, used to normalize it for the preview. */
  dateFormat?: CsvDateFormat;
  /** Format of the mapped time column, used to normalize it for the preview. */
  timeFormat?: CsvTimeFormat;
  /** Buys: is the BTC fee already out of the amount (default "notDeducted")? */
  feeBtcModeIn?: BtcFeeMode;
  /** Sells, spends, outgoing transfers: same question (default "notDeducted"). */
  feeBtcModeOut?: BtcFeeMode;
  /** Is the EUR fee already part of the EUR amount (default "net")? */
  feeFiatMode?: FiatFeeMode;
  /** Unit of the mapped amountBtc column (default "btc"). */
  amountUnit?: AmountUnit;
  /** Unit of the mapped feeBtc column (default "btc"). */
  feeUnit?: AmountUnit;
  /** Raw type-column value → internal TransactionType, resolved in the wizard's value-mapping step. */
  typeValueMapping?: Record<string, TransactionType>;
  /**
   * Only rows matching this filter become import rows; the others never show
   * up in the preview. Line numbers still refer to the original file.
   */
  rowFilter?: RowFilter;
}

/**
 * Keep price, total and amount telling the same story: with a total, the price
 * follows from it (a price column may still refer to the figures before the fee
 * modes were applied), otherwise the total follows from the price. Values that
 * are not numbers are passed through untouched so the row can be flagged.
 */
function reconcileEurFigures(
  price: string,
  total: string,
  amountBtc: string,
): { pricePerBtcEur: string; totalFiatEur: string } {
  const amount = dec(amountBtc);
  if (!NUMBER.test(amountBtc) || !amount.gt(0)) {
    return { pricePerBtcEur: price, totalFiatEur: total };
  }
  if (total !== "" && NUMBER.test(total)) {
    return {
      pricePerBtcEur: fiatString(dec(total).div(amount).toDecimalPlaces(2)),
      totalFiatEur: total,
    };
  }
  if (price !== "" && NUMBER.test(price)) {
    return {
      pricePerBtcEur: price,
      totalFiatEur: fiatString(dec(price).mul(amount).toDecimalPlaces(2)),
    };
  }
  return { pricePerBtcEur: price, totalFiatEur: total };
}

/**
 * How the BTC fee mode changed this row's amount: the amount as the file has
 * it, the fee, and whether the fee was added or taken off. Null when the mode
 * left the amount alone — the preview uses this to explain a changed amount
 * instead of leaving it looking like a rounding artifact.
 */
export function btcAmountAdjustment(
  v: ImportRowValues,
  feeBtcModeIn: BtcFeeMode = "notDeducted",
  feeBtcModeOut: BtcFeeMode = "notDeducted",
): { fileAmount: string; fee: string; added: boolean } | null {
  const fee = v.feeBtc;
  if (fee === "" || !NUMBER.test(fee) || !NUMBER.test(v.amountBtc)) return null;
  const type = normalizeType(v.type);
  const amount = dec(v.amountBtc);
  if (type === "buy" && feeBtcModeIn === "deducted") {
    return { fileAmount: btcString(amount.minus(fee)), fee, added: true };
  }
  const isOutgoing = type !== null && isOutflow(type);
  if (isOutgoing && feeBtcModeOut === "notDeducted") {
    return { fileAmount: btcString(amount.plus(fee)), fee, added: false };
  }
  return null;
}

/**
 * What the ledger books for this row once the EUR fee is applied: acquisition
 * cost on a buy (total + fee), proceeds on a sale or spend (total − fee). Null
 * for transfers and for rows without a usable EUR total — this is the figure the
 * preview shows so the chosen fee interpretation stays checkable.
 */
export function effectiveEurTotal(v: ImportRowValues): string | null {
  const type = normalizeType(v.type);
  if (type === null || !isPriced(type)) return null;
  if (v.totalFiatEur === "" || !NUMBER.test(v.totalFiatEur)) return null;
  const total = dec(v.totalFiatEur);
  const fee = NUMBER.test(v.feeFiatEur) ? dec(v.feeFiatEur) : dec("");
  return fiatString(type === "buy" ? total.plus(fee) : total.minus(fee));
}

/** Apply mapping + normalization to raw CSV rows → editable import rows. */
export function buildImportRows(
  rows: string[][],
  headers: string[],
  mapping: ColumnMapping,
  decimalSep: DecimalSeparator,
  {
    fixedType,
    dateFormat,
    timeFormat,
    feeBtcModeIn = "notDeducted",
    feeBtcModeOut = "notDeducted",
    feeFiatMode = "net",
    amountUnit,
    feeUnit,
    typeValueMapping,
    rowFilter,
  }: BuildOptions = {},
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
    const normalized = normalizeNumber(raw, decimalSep);
    // Keep the raw value if unparseable so the user sees what failed.
    if (normalized === null) return raw;
    const unit =
      field === "amountBtc" ? amountUnit : field === "feeBtc" ? feeUnit : undefined;
    // Some exports encode the direction in the sign (a withdrawal written as
    // "-0.5"); the ledger stores magnitudes and takes the direction from the
    // transaction type, so a leading minus is dropped here.
    const value = (
      unit === "sats" ? dec(normalized).div(SATS_PER_BTC) : dec(normalized)
    ).abs();
    // Same shape as everywhere else: BTC with all 8 decimals (anything finer
    // than a satoshi is rounded to the nearest one), fiat with at least 2 — the
    // preview shows these values and the import stores them.
    return field === "amountBtc" || field === "feeBtc"
      ? btcString(value)
      : fiatString(value);
  };
  /**
   * Put the BTC amount on the ledger's fee convention (CLAUDE.md §3.2), where
   * `feeBtc` is always on top of `amountBtc`: a buy credits amount − fee, the
   * outgoing types debit amount + fee. So exactly one side needs correcting per
   * fee mode — a file whose amount still contains the fee gives the outgoing
   * amount away too high, one whose amount is already net gives the bought
   * amount too low. A transfer_in is never touched: its credit is the arriving
   * amount, the network fee belongs to the out-leg.
   */
  const amountForFeeMode = (
    type: TransactionType | null,
    amount: string,
    fee: string,
  ): string => {
    if (fee === "" || !NUMBER.test(fee) || !NUMBER.test(amount)) return amount;
    if (type === "buy" && feeBtcModeIn === "deducted") {
      return btcString(dec(amount).plus(fee));
    }
    const isOutgoing = type !== null && isOutflow(type);
    if (isOutgoing && feeBtcModeOut === "notDeducted") {
      return btcString(dec(amount).minus(fee));
    }
    return amount;
  };

  /**
   * Same for the EUR side: `totalFiatEur` is the value of the coins without the
   * fee, and the FIFO engine adds `feeFiatEur` to a buy's acquisition cost and
   * takes it off a sale's proceeds. A gross column (the money that actually
   * moved) therefore has to give the fee back on a buy and take it in on a
   * sale; a net column is already what the ledger wants.
   */
  const totalForFeeMode = (
    type: TransactionType | null,
    total: string,
    fee: string,
  ): string => {
    if (feeFiatMode !== "gross") return total;
    if (fee === "" || !NUMBER.test(fee) || total === "" || !NUMBER.test(total)) {
      return total;
    }
    if (type === "buy") return fiatString(dec(total).minus(fee));
    if (type === "sell" || type === "spend") return fiatString(dec(total).plus(fee));
    return total;
  };
  const resolveType = (raw: string): TransactionType | null => {
    if (typeValueMapping && raw in typeValueMapping) return typeValueMapping[raw];
    return normalizeType(raw);
  };
  // Filtered-out rows are dropped, but the surviving ones keep the line number
  // they have in the file, so the preview still points at the right CSV line.
  return rows
    .map((row, i) => ({ row, line: i + 1 }))
    .filter(({ row }) => rowMatchesFilter(row, headers, rowFilter))
    .map(({ row, line }) => {
      const type = fixedType ?? resolveType(cell(row, "type"));
      const feeBtc = num(row, "feeBtc");
      const feeFiatEur = num(row, "feeFiatEur");
      const amountBtc = amountForFeeMode(type, num(row, "amountBtc"), feeBtc);
      // Price, total and amount are kept consistent with each other and with
      // the fee modes, so the preview shows the figures the ledger will use.
      const { pricePerBtcEur, totalFiatEur } = reconcileEurFigures(
        num(row, "pricePerBtcEur"),
        totalForFeeMode(type, num(row, "totalFiatEur"), feeFiatEur),
        amountBtc,
      );
      return {
        id: crypto.randomUUID(),
        line,
        excluded: false,
        values: {
          type: type ?? cell(row, "type"),
          // Both are normalized with their column's format, so the preview
          // shows a readable date and time whatever shape the file uses.
          date: normalizeDateCell(cell(row, "date"), dateFormat),
          time: normalizeTimeCell(cell(row, "time"), timeFormat),
          amountBtc,
          pricePerBtcEur,
          totalFiatEur,
          feeBtc,
          feeFiatEur,
          originalCurrency: normalizeCurrencyCode(cell(row, "originalCurrency")),
          originalAmount: num(row, "originalAmount"),
          originalPricePerBtc: num(row, "originalPricePerBtc"),
          txid: normalizeTxid(cell(row, "txid")),
          address: normalizeBitcoinAddress(cell(row, "address")),
          note: cell(row, "note"),
          eurValuationSource: "manual",
        },
      };
    });
}

export type RowErrorCode =
  | "invalidType"
  | "invalidDate"
  | "invalidTime"
  | "invalidAmount"
  | "missingPrice"
  | "invalidPrice"
  | "invalidTotal"
  | "invalidFee"
  | "invalidOriginal"
  | "invalidTxid"
  | "invalidAddress";

const NUMBER = /^-?\d+(\.\d+)?$/;

function positiveNumber(s: string): boolean {
  return NUMBER.test(s) && Number(s) > 0;
}

function nonNegativeOptional(s: string): boolean {
  return s === "" || (NUMBER.test(s) && Number(s) >= 0);
}

export function validateRow(
  v: ImportRowValues,
  { dateFormat, timeFormat }: DateTimeFormats = {},
): RowErrorCode[] {
  const errors: RowErrorCode[] = [];
  const type = normalizeType(v.type);
  if (type === null) errors.push("invalidType");
  if (parseImportDate(v.date, dateFormat) === null) errors.push("invalidDate");
  // The time is mandatory (REQUIRED_FIELDS); one column feeding both fields is
  // already covered by the date check above.
  const time = v.time.trim();
  if (
    time === "" ||
    (time !== v.date.trim() && parseImportTime(time, timeFormat) === null)
  ) {
    errors.push("invalidTime");
  }
  if (!positiveNumber(v.amountBtc)) errors.push("invalidAmount");
  const needsPrice = type !== null && isPriced(type);
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
  // Original-currency data is documentation, but a value that is not a number
  // would be documentation of nothing.
  if (
    !nonNegativeOptional(v.originalAmount) ||
    !nonNegativeOptional(v.originalPricePerBtc)
  ) {
    errors.push("invalidOriginal");
  }
  // On-chain data is optional and only kept for transfers, but a malformed
  // value is always worth flagging — silently dropping it would be worse.
  if (v.txid !== "" && !isValidTxid(v.txid)) errors.push("invalidTxid");
  if (v.address !== "" && !isValidBitcoinAddress(v.address)) {
    errors.push("invalidAddress");
  }
  return errors;
}

/**
 * Can this row's EUR value be derived from the historical BTC/EUR close? True
 * for a priced type that has an amount and a readable date but no EUR figure —
 * the case of an export settled in another currency (CLAUDE.md §3.2).
 */
export function needsEurValuation(
  v: ImportRowValues,
  formats: DateTimeFormats = {},
): boolean {
  const type = normalizeType(v.type);
  if (type === null || !isPriced(type)) return false;
  if (v.pricePerBtcEur.trim() !== "" || v.totalFiatEur.trim() !== "") return false;
  if (!positiveNumber(v.amountBtc)) return false;
  return parseImportDateTime(v.date, v.time, formats) !== null;
}

/** Convert validated row values to a Transaction. Call only if validateRow is empty. */
export function rowToTransaction(
  v: ImportRowValues,
  formats: DateTimeFormats = {},
): Transaction {
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
    date: parseImportDateTime(v.date, v.time, formats)!,
    amountBtc: v.amountBtc,
    pricePerBtcEur: price,
    totalFiatEur: total,
    feeBtc: v.feeBtc === "" ? undefined : v.feeBtc,
    feeFiatEur: v.feeFiatEur === "" ? undefined : v.feeFiatEur,
    // Documentation of the actual settlement (CLAUDE.md §3.2); no calculation
    // reads these, EUR stays the valuation currency.
    ...(v.originalCurrency !== "" ? { originalCurrency: v.originalCurrency } : {}),
    ...(v.originalAmount !== "" ? { originalAmount: v.originalAmount } : {}),
    ...(v.originalPricePerBtc !== ""
      ? { originalPricePerBtc: v.originalPricePerBtc }
      : {}),
    // "manual" is the default, so only a derived value needs recording.
    ...(v.eurValuationSource === "binance-klines"
      ? { eurValuationSource: v.eurValuationSource }
      : {}),
    // On-chain data belongs to transfer legs only (CLAUDE.md §3.2) — a buy or
    // sell row that happens to carry a txid column keeps it out of the ledger.
    ...(isTransfer && v.txid !== "" ? { txid: v.txid } : {}),
    ...(isTransfer && v.address !== "" ? { address: v.address } : {}),
    note: v.note,
  };
}
