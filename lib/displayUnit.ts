"use client";

// How amounts are displayed: in BTC, or in sats when the display currency is
// set to "BTC" (CLAUDE.md §6.3).
//
// This is a display concern only. The ledger keeps storing BTC decimal strings,
// every calculation keeps working on them, and sorting and filtering never see
// this module — a unit change must not be able to change a number.

import { useMemo } from "react";
import { useI18n, intlLocale } from "./i18n";
import { useAppStore } from "./store";
import { Decimal, dec, formatBtc, formatInt } from "./decimal";
import type { Currency } from "./types";

export const SATS_PER_BTC = 100_000_000;

/** Whole sats of a BTC amount; a satoshi is the smallest unit there is. */
export function satsOf(v: Decimal | string): number {
  return dec(v).mul(SATS_PER_BTC).toDecimalPlaces(0).toNumber();
}

export function formatSats(
  v: Decimal | string,
  locale: string,
  signed = false,
): string {
  return formatInt(satsOf(v), locale, signed);
}

/**
 * "Moscow time": the sats one unit of fiat buys, read as a clock — 2 000 sats
 * per euro is "20:00". A price display, not a conversion: it only ever
 * restates the spot price, so nothing stored or calculated depends on it.
 *
 * Returns null when the price is unusable or the figure no longer reads as a
 * time (a fiat unit buying 10 000 sats or more, i.e. a price below 10 000) —
 * "100:00" is not a clock, and inventing one would be worse than showing the
 * plain sats figure.
 */
export function moscowTime(pricePerBtc: number | null): {
  sats: number;
  clock: string;
} | null {
  if (pricePerBtc === null || !Number.isFinite(pricePerBtc) || pricePerBtc <= 0)
    return null;
  const sats = Math.round(SATS_PER_BTC / pricePerBtc);
  if (sats < 1 || sats >= 10_000) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { sats, clock: `${pad(Math.floor(sats / 100))}:${pad(sats % 100)}` };
}

/** "BTC" or "sats" — the unit a column header or a label has to name. */
export function amountUnit(currency: Currency): "BTC" | "sats" {
  return currency === "BTC" ? "sats" : "BTC";
}

/** A BTC amount with its unit, in whichever unit is being displayed. */
export function formatAmount(
  v: Decimal | string,
  locale: string,
  currency: Currency,
): string {
  return currency === "BTC"
    ? `${formatSats(v, locale)} sats`
    : `${formatBtc(v, locale)} BTC`;
}

/**
 * The amount formatter for components outside the dashboard (the transaction
 * table, the tax view). Widgets take the same thing from `useDashboardData()`,
 * which computes it once for the whole grid.
 */
export function useAmountFormat(): {
  currency: Currency;
  unit: "BTC" | "sats";
  /** Number only — for a column whose header already names the unit. */
  format: (v: Decimal | string) => string;
  /** Number and unit. */
  formatWithUnit: (v: Decimal | string) => string;
} {
  const { locale } = useI18n();
  const currency = useAppStore((s) => s.portfolio?.settings.currencyDisplay) ?? "EUR";
  return useMemo(() => {
    const loc = intlLocale(locale);
    return {
      currency,
      unit: amountUnit(currency),
      format: (v) => (currency === "BTC" ? formatSats(v, loc) : formatBtc(v, loc)),
      formatWithUnit: (v) => formatAmount(v, loc, currency),
    };
  }, [currency, locale]);
}
