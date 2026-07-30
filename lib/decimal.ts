import Decimal from "decimal.js";

// BTC has 8 decimal places; give plenty of headroom for intermediate math.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export const ZERO = new Decimal(0);

export function dec(v: string | number | Decimal | null | undefined): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  try {
    return new Decimal(v);
  } catch {
    return new Decimal(0);
  }
}

/**
 * A BTC amount, always with all 8 decimals (zero-padded) and grouped for the
 * locale — "1.234,56789000" in de-DE, "1,234.56789000" in en-US. Every BTC
 * value shown anywhere in the UI goes through here.
 */
export function formatBtc(v: Decimal | string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  }).format(Number(dec(v).toFixed(8)));
}

/** Fiat amount with its currency symbol, for standalone figures. */
export function formatFiat(
  v: Decimal | string | number,
  currency: string,
  locale: string,
): string {
  const n = typeof v === "number" ? v : dec(v).toNumber();
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Fiat amount without a currency symbol — for table columns whose header
 * already names the currency ("Kurs (EUR/BTC)").
 */
export function formatFiatPlain(
  v: Decimal | string | number,
  locale: string,
): string {
  const n = typeof v === "number" ? v : dec(v).toNumber();
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Plain locale-grouped integer, e.g. a sat count. */
export function formatInt(v: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v);
}

const NUMERIC = /^-?(\d+\.?\d*|\.\d+)$/;

/** Decimal separator of a locale ("," for de-DE, "." for en-US). */
export function decimalSeparatorOf(locale: string): string {
  return (
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((p) => p.type === "decimal")?.value ?? "."
  );
}

/**
 * Parse what a user typed into a canonical decimal string, or null if it is not
 * a number (yet). Locale-agnostic on purpose: the **last** "." or "," is taken
 * as the decimal separator and any earlier one as grouping, so "0,5", "0.5",
 * "1.234,56" and "1,234.56" all work regardless of the active language.
 */
export function parseNumberInput(text: string): string | null {
  const s = text.replace(/[\s '’]/g, "");
  if (s === "") return null;
  const sign = s.startsWith("-") ? "-" : "";
  const body = sign ? s.slice(1) : s;
  const lastSep = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
  const intPart = (lastSep === -1 ? body : body.slice(0, lastSep)).replace(/[.,]/g, "");
  const fracPart = lastSep === -1 ? "" : body.slice(lastSep + 1);
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (intPart === "" && fracPart === "") return null;
  const canonical = `${sign}${intPart || "0"}${fracPart ? `.${fracPart}` : ""}`;
  return NUMERIC.test(canonical) ? canonical : null;
}

/** BTC for an input field: 8 decimals with the locale's decimal separator. */
export function formatBtcInput(v: Decimal | string, locale: string): string {
  return btcString(v).replace(".", decimalSeparatorOf(locale));
}

/** Fiat for an input field: ≥2 decimals with the locale's decimal separator. */
export function formatFiatInput(v: Decimal | string, locale: string): string {
  return fiatString(v).replace(".", decimalSeparatorOf(locale));
}

/**
 * BTC as a machine-readable string with all 8 decimals ("0.5" → "0.50000000").
 * Used for stored amounts and for the values shown inside input fields, which
 * must stay parseable (plain dot as decimal separator, no grouping).
 */
export function btcString(v: Decimal | string): string {
  return dec(v).toFixed(8);
}

/** Fiat with at least 2 decimals, keeping any extra precision it already has. */
export function fiatString(v: Decimal | string): string {
  const d = dec(v);
  return d.toFixed(Math.max(2, d.decimalPlaces()));
}

export function formatPercent(v: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(v);
}
