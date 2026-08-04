"use client";

// Widgets that only read the ledger: custody split, wallet breakdown, how the
// holding is composed, the holding-period timeline and the data-quality list.

import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { Decimal, ZERO, formatBtc, formatPercent } from "@/lib/decimal";
import { formatDate } from "@/lib/i18n";
import { daysUntilTaxFree, isLotTaxFree } from "@/lib/fifo";
import { countIssues, DATA_ISSUES } from "@/lib/dataQuality";
import type { WalletType } from "@/lib/types";
import { Amount } from "../ui";
import { useDashboardData } from "./context";
import { Meter, StatLabel, StatValue, WidgetEmpty } from "./WidgetFrame";

/** Custody buckets: only "on an exchange" versus "in your own custody". */
const SELF_CUSTODY: WalletType[] = ["hardware", "software", "paper"];

/**
 * Widget 6: how much of the stack sits on exchanges versus in self custody.
 * The exchange share is the warning metric — coins on an exchange are somebody
 * else's promise, so that number is the one the widget leads with when it is
 * anything but zero.
 */
export function CustodyWidget() {
  const { t, loc, balances, balanceBtc, fmtDisplay, priceEur } = useDashboardData();
  const portfolio = useAppStore((s) => s.portfolio)!;

  const byType = useMemo(() => {
    const typeOf = new Map(portfolio.wallets.map((w) => [w.id, w.type]));
    const sums = new Map<WalletType, Decimal>();
    for (const b of balances) {
      const type = typeOf.get(b.walletId) ?? "software";
      sums.set(type, (sums.get(type) ?? ZERO).plus(b.btc));
    }
    return sums;
  }, [balances, portfolio.wallets]);

  const total = balanceBtc;
  if (!total.gt(0)) return <WidgetEmpty message={t("dashboard.widgets.custodyEmpty")} />;

  const exchange = byType.get("exchange") ?? ZERO;
  const self = SELF_CUSTODY.reduce((s, ty) => s.plus(byType.get(ty) ?? ZERO), ZERO);
  const exchangeShare = exchange.div(total).toNumber();

  const rows: { type: WalletType; btc: Decimal }[] = (
    ["exchange", "hardware", "software", "paper"] as WalletType[]
  )
    .map((type) => ({ type, btc: byType.get(type) ?? ZERO }))
    .filter((r) => r.btc.gt(0));

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue className={exchangeShare > 0 ? "text-warning" : "text-gain"}>
          {formatPercent(exchangeShare, loc).replace("+", "")}
        </StatValue>
        <StatLabel>{t("dashboard.widgets.onExchanges")}</StatLabel>
      </div>

      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-warning"
          style={{ width: `${exchangeShare * 100}%` }}
          title={t("dashboard.widgets.onExchanges")}
        />
        <div
          className="h-full bg-gain"
          style={{ width: `${self.div(total).toNumber() * 100}%` }}
          title={t("dashboard.widgets.selfCustody")}
        />
      </div>

      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.type} className="border-b border-border-c/30 last:border-0">
              <td className="py-1">
                <span
                  aria-hidden
                  className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                    r.type === "exchange" ? "bg-warning" : "bg-gain"
                  }`}
                />
                {t(`wallets.types.${r.type}`)}
              </td>
              <td className="py-1 text-right font-mono whitespace-nowrap">
                <Amount>{formatBtc(r.btc, loc)}</Amount>
              </td>
              <td className="py-1 pl-2 text-right text-muted whitespace-nowrap">
                <Amount>
                  {priceEur === null
                    ? "—"
                    : fmtDisplay(r.btc.toNumber() * priceEur)}
                </Amount>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {exchangeShare > 0 && (
        <p className="mt-auto text-[0.65rem] leading-relaxed text-warning">
          ⚠ {t("dashboard.widgets.exchangeWarning")}
        </p>
      )}
    </div>
  );
}

/** Balance per wallet/account, each row a jump into the filtered table. */
export function WalletBreakdownWidget() {
  const { t, loc, balances, displayPrice, currency, openTransactions } =
    useDashboardData();

  if (balances.length === 0) {
    return <WidgetEmpty message={t("dashboard.chartEmpty")} />;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border-c text-left text-muted">
          <th className="py-1.5 pr-2 font-normal">{t("dashboard.wallet")}</th>
          <th className="py-1.5 pr-2 font-normal">{t("dashboard.account")}</th>
          <th className="py-1.5 pr-2 text-right font-normal">BTC</th>
          <th className="py-1.5 text-right font-normal">{currency}</th>
        </tr>
      </thead>
      <tbody>
        {balances.map((b) => (
          <tr
            key={b.accountId}
            className="cursor-pointer border-b border-border-c/40 last:border-0 hover:bg-surface-2/50"
            title={t("dashboard.showTransactions")}
            onClick={() =>
              openTransactions({ walletId: b.walletId, accountId: b.accountId })
            }
          >
            <td className="py-1.5 pr-2">{b.walletName}</td>
            <td className="py-1.5 pr-2 text-muted">{b.accountName}</td>
            <td className="py-1.5 pr-2 text-right font-mono whitespace-nowrap">
              <Amount>{formatBtc(b.btc, loc)}</Amount>
            </td>
            <td className="py-1.5 text-right font-mono whitespace-nowrap">
              <Amount>
                {displayPrice === null
                  ? "—"
                  : new Intl.NumberFormat(loc, {
                      maximumFractionDigits: 0,
                    }).format(b.btc.toNumber() * displayPrice)}
              </Amount>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The "how the holding is made up" table that used to be a collapsible panel. */
export function HoldingCompositionWidget() {
  const { t, loc, breakdown } = useDashboardData();
  const rows = [
    ["dashboard.breakdownBuys", breakdown.buys],
    ["dashboard.breakdownTransferIns", breakdown.transferIns],
    ["dashboard.breakdownSells", breakdown.sells],
    ["dashboard.breakdownTransferOuts", breakdown.transferOuts],
    ["dashboard.breakdownSpends", breakdown.spends],
  ] as const;

  return (
    <div className="space-y-2">
      <p className="text-[0.65rem] leading-relaxed text-muted">
        {t("dashboard.breakdownIntro")}
      </p>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key} className="border-b border-border-c/40">
              <td className="py-1 text-muted">{t(key)}</td>
              <td className="py-1 text-right font-mono whitespace-nowrap">
                <Amount>{formatBtc(value, loc)}</Amount>
              </td>
            </tr>
          ))}
          <tr className="border-b border-border-c/40">
            <td className="py-1 text-muted">{t("dashboard.breakdownFees")}</td>
            <td className="py-1 text-right font-mono whitespace-nowrap text-muted">
              <Amount>{formatBtc(breakdown.feeBtc, loc)}</Amount>
            </td>
          </tr>
          <tr>
            <td className="py-1 font-semibold">{t("dashboard.breakdownTotal")}</td>
            <td className="py-1 text-right font-mono font-semibold whitespace-nowrap">
              <Amount>{formatBtc(breakdown.total, loc)}</Amount>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Widget 3: which lots are past the holding period and when the rest gets
 * there. Lot identity comes from the FIFO engine, which traces it back through
 * internal transfers (CLAUDE.md §3.2) — the arrival date of a transfer never
 * restarts the clock.
 *
 * This is tax-specific UI; see `TAX_FEATURES_ENABLED` in lib/features.ts.
 */
export function HoldingPeriodWidget() {
  const { t, loc, fifo } = useDashboardData();
  const now = new Date();

  const { free, pending, upcoming } = useMemo(() => {
    let free = ZERO;
    let pending = ZERO;
    const upcoming: { date: Date; btc: Decimal; days: number }[] = [];
    for (const lot of fifo.openLots) {
      if (isLotTaxFree(lot, now)) {
        free = free.plus(lot.remainingBtc);
        continue;
      }
      pending = pending.plus(lot.remainingBtc);
      const days = daysUntilTaxFree(lot, now);
      const existing = upcoming.find(
        (u) => u.date.getTime() === lot.taxFreeDate.getTime(),
      );
      if (existing) existing.btc = existing.btc.plus(lot.remainingBtc);
      else upcoming.push({ date: lot.taxFreeDate, btc: lot.remainingBtc, days });
    }
    upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    return { free, pending, upcoming };
    // `now` is intentionally not a dependency: a new Date on every render would
    // recompute forever. Day-level accuracy is enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fifo]);

  const total = free.plus(pending);
  if (!total.gt(0)) {
    return <WidgetEmpty message={t("dashboard.widgets.holdingPeriodEmpty")} />;
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue className="text-gain">{formatBtc(free, loc)}</StatValue>
        <StatLabel>{t("dashboard.widgets.taxFreeNow")}</StatLabel>
      </div>
      <Meter value={free.div(total).toNumber()} color="bg-gain" />
      {upcoming.length === 0 ? (
        <p className="text-xs text-gain">
          ★ {t("dashboard.widgets.allTaxFree")}
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-c text-left text-muted">
              <th className="py-1 pr-2 font-normal">
                {t("dashboard.widgets.taxFreeFrom")}
              </th>
              <th className="py-1 pr-2 text-right font-normal">BTC</th>
              <th className="py-1 text-right font-normal">
                {t("dashboard.widgets.daysLeft")}
              </th>
            </tr>
          </thead>
          <tbody>
            {upcoming.slice(0, 12).map((u) => (
              <tr key={u.date.getTime()} className="border-b border-border-c/40 last:border-0">
                <td className="py-1 pr-2 whitespace-nowrap">{formatDate(u.date, loc)}</td>
                <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">
                  <Amount>{formatBtc(u.btc, loc)}</Amount>
                </td>
                <td className="py-1 text-right font-mono text-muted">{u.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Widget 10: the open ends in the ledger. Every line jumps into the
 * transaction table with the matching filter, so the count is a starting point
 * for fixing rather than a verdict.
 */
export function DataQualityWidget() {
  const { t, entries, openTransactions } = useDashboardData();
  const counts = useMemo(() => countIssues(entries), [entries]);
  const clean = DATA_ISSUES.every((issue) => counts[issue] === 0);

  return (
    <div className="flex h-full flex-col gap-2">
      {clean ? (
        <p className="flex h-full items-center justify-center text-xs text-gain">
          ✓ {t("dashboard.widgets.dataQualityClean")}
        </p>
      ) : (
        <ul className="space-y-1 text-xs">
          {DATA_ISSUES.map((issue) => (
            <li key={issue}>
              <button
                type="button"
                disabled={counts[issue] === 0}
                onClick={() => openTransactions({ issue })}
                className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left transition-colors enabled:hover:bg-surface-2 disabled:opacity-40"
                title={
                  counts[issue] > 0 ? t("dashboard.widgets.showAffected") : undefined
                }
              >
                <span className="min-w-0 truncate text-muted">
                  {t(`dashboard.widgets.issues.${issue}`)}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 font-mono ${
                    counts[issue] > 0 ? "bg-warning/15 text-warning" : "text-muted"
                  }`}
                >
                  {counts[issue]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
