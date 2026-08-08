"use client";

// The small playful touches (CLAUDE.md §5.1).
//
// Ground rules, and they are the whole point: nothing here may get in the way
// of using the app seriously. Every effect is quiet, none of them moves or
// blocks anything, and one switch in the settings turns all of them off at
// once. The date-based ones appear on their day in the user's own timezone and
// are gone the next morning.

import { useAppStore } from "./store";
import { dec, type Decimal } from "./decimal";

/** Clicks on the ₿ in the header that unlock laser eyes. */
export const LASER_EYES_CLICKS = 21;

/** BTC Laszlo Hanyecz paid for two pizzas on 22 May 2010 — 5 000 per pizza. */
export const BTC_PER_PIZZA = 5000;

/** Whether the playful touches are on. Absent in the file means on. */
export function useEasterEggs(): boolean {
  return useAppStore((s) => s.portfolio?.settings.easterEggs) !== false;
}

/** Cosmetic laser-eyes mode, unlocked in the header (§5.1). */
export function useLaserEyes(): boolean {
  const enabled = useEasterEggs();
  const on = useAppStore((s) => s.portfolio?.uiSettings?.laserEyes) === true;
  return enabled && on;
}

/** A day in the user's own timezone, so the date shown is the date they see. */
function isLocalDay(month: number, day: number, now: Date): boolean {
  return now.getMonth() + 1 === month && now.getDate() === day;
}

/** 22 May: Bitcoin Pizza Day. */
export function isPizzaDay(now: Date = new Date()): boolean {
  return isLocalDay(5, 22, now);
}

/** 3 January: the genesis block, and the headline in its coinbase. */
export function isGenesisDay(now: Date = new Date()): boolean {
  return isLocalDay(1, 3, now);
}

/** 10 January: Hal Finney's "Running bitcoin". */
export function isRunningBitcoinDay(now: Date = new Date()): boolean {
  return isLocalDay(1, 10, now);
}

/** What a holding would have bought at the 2010 pizza rate. */
export function pizzasFor(balanceBtc: Decimal | string): Decimal {
  return dec(balanceBtc).div(BTC_PER_PIZZA);
}

/**
 * Pizzas read as a share, not as a rounded amount: at 5 000 BTC apiece any
 * normal stack is a tiny fraction, and "0,00" would be the whole joke lost.
 */
export function formatPizzas(pizzas: Decimal, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumSignificantDigits: 3,
    maximumFractionDigits: 20,
  }).format(pizzas.toNumber());
}

/**
 * Fee-rate comment: which of the (translated) one-liners fits the current
 * rate. Deliberately about what one would actually do at that rate — cheap
 * blocks are a good moment to consolidate, expensive ones a good moment to
 * wait — so it stays useful rather than loud.
 */
export type FeeMood = "veryLow" | "low" | "normal" | "high" | "veryHigh";

export function feeMood(satPerVb: number): FeeMood {
  if (satPerVb <= 2) return "veryLow";
  if (satPerVb <= 10) return "low";
  if (satPerVb <= 50) return "normal";
  if (satPerVb <= 150) return "high";
  return "veryHigh";
}
