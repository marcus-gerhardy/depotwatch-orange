"use client";

// Everything a widget needs that is derived from the open portfolio.
//
// Widgets are registry entries without props (see registry.tsx) so a new one
// can be added by a single entry. They read their data from this context
// instead, which also means the expensive parts (flattenLedger, computeFifo,
// the spot price request) happen once for the whole dashboard rather than once
// per widget.

import { createContext, useContext, useMemo } from "react";
import { useI18n, intlLocale, type TranslateFn } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { flattenLedger, type Currency, type ExplorerSettings, type LedgerEntry } from "@/lib/types";
import { computeFifo, type FifoResult } from "@/lib/fifo";
import {
  accountBalances,
  balanceBreakdown,
  totalBalance,
  type AccountBalance,
  type BalanceBreakdown,
} from "@/lib/portfolio";
import { useSpotPrices } from "@/lib/marketData";
import { Decimal, formatFiat } from "@/lib/decimal";
import type { DataIssue } from "@/lib/dataQuality";

/** Where a widget can send the user in the transaction table. */
export interface TxJumpFilter {
  walletId?: string;
  accountId?: string;
  issue?: DataIssue;
}

export interface DashboardData {
  t: TranslateFn;
  /** BCP-47 tag for Intl formatting ("de-DE"/"en-US"). */
  loc: string;
  currency: Currency;
  explorerSettings: ExplorerSettings;

  entries: LedgerEntry[];
  fifo: FifoResult;
  balances: AccountBalance[];
  breakdown: BalanceBreakdown;
  /** Portfolio holding from the ledger, never from the FIFO engine (§10). */
  balanceBtc: Decimal;

  /** Live BTC price in EUR / in the display currency; null while unavailable. */
  priceEur: number | null;
  displayPrice: number | null;
  priceLoading: boolean;
  priceError: boolean;
  /** EUR → display-currency factor via the BTC cross rate; null if unknown. */
  eurToDisplay: number | null;
  /** Format a EUR figure (as the ledger stores it) in the display currency. */
  fmtDisplay: (eur: number | null) => string;

  /** Open the transaction table with a filter applied. */
  openTransactions: (filter: TxJumpFilter) => void;
}

const DashboardDataContext = createContext<DashboardData | null>(null);

export function useDashboardData(): DashboardData {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) throw new Error("useDashboardData outside DashboardDataProvider");
  return ctx;
}

export function DashboardDataProvider({
  openTransactions,
  children,
}: {
  openTransactions: (filter: TxJumpFilter) => void;
  children: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const currency = portfolio.settings.currencyDisplay;

  const prices = useSpotPrices();
  const priceEur = prices.data?.eur ?? null;
  const priceUsd = prices.data?.usd ?? null;

  const entries = useMemo(() => flattenLedger(portfolio.wallets), [portfolio]);
  const fifo = useMemo(
    () => computeFifo(entries, portfolio.settings.holdingPeriodDays),
    [entries, portfolio.settings.holdingPeriodDays],
  );
  const balances = useMemo(() => accountBalances(entries), [entries]);
  const breakdown = useMemo(() => balanceBreakdown(entries), [entries]);
  const balanceBtc = useMemo(() => totalBalance(entries), [entries]);

  const value = useMemo<DashboardData>(() => {
    // Ledger costs are EUR; USD display goes through the BTC cross rate.
    const eurToDisplay =
      currency === "EUR" ? 1 : priceEur && priceUsd ? priceUsd / priceEur : null;
    const displayPrice = currency === "EUR" ? priceEur : priceUsd;
    return {
      t,
      loc,
      currency,
      explorerSettings: portfolio.explorerSettings,
      entries,
      fifo,
      balances,
      breakdown,
      balanceBtc,
      priceEur,
      displayPrice,
      priceLoading: prices.loading,
      priceError: prices.error,
      eurToDisplay,
      fmtDisplay: (eur) =>
        eur === null || eurToDisplay === null
          ? "—"
          : formatFiat(eur * eurToDisplay, currency, loc),
      openTransactions,
    };
  }, [
    t,
    loc,
    currency,
    portfolio.explorerSettings,
    entries,
    fifo,
    balances,
    breakdown,
    balanceBtc,
    priceEur,
    priceUsd,
    prices.loading,
    prices.error,
    openTransactions,
  ]);

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}
