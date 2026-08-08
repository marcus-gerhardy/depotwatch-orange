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

export function formatSats(v: Decimal | string, locale: string): string {
  return formatInt(satsOf(v), locale);
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
