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
 * Format a BTC amount with 8 decimals. Trailing zeros are trimmed to
 * `minFraction` places (default 2); pass 8 for fully zero-padded output
 * ("0.05000000").
 */
export function formatBtc(
  v: Decimal | string,
  locale: string,
  minFraction = 2,
): string {
  const d = dec(v);
  const s = d.toFixed(8);
  const n = Number(s);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minFraction,
    maximumFractionDigits: 8,
  }).format(n);
}

export function formatFiat(
  v: Decimal | string | number,
  currency: string,
  locale: string,
): string {
  const n = typeof v === "number" ? v : dec(v).toNumber();
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatPercent(v: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(v);
}
