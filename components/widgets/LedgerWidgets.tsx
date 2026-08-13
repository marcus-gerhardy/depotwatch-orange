"use client";

// Widgets that only read the ledger: custody split, wallet breakdown, how the
// holding is composed, the holding-period timeline and the data-quality list.

import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { Decimal, ZERO, formatInt, formatPercent } from "@/lib/decimal";
import { formatDate } from "@/lib/i18n";
import { useNowDate } from "@/lib/clock";
import { useDailyCloses } from "@/lib/marketData";
import { dailyValueSeries } from "@/lib/portfolio";
import { feeTotals, maxDrawdown, timeInMarket } from "@/lib/dashboardStats";
import { MILESTONES } from "@/lib/milestones";
import { daysUntilTaxFree, isLotTaxFree } from "@/lib/fifo";
import { countIssues, DATA_ISSUES } from "@/lib/dataQuality";
import { useEasterEggs } from "@/lib/easterEggs";
import type { WalletType } from "@/lib/types";
import MilestoneIcon from "../MilestoneIcon";
import { Amount, PnlValue } from "../ui";
import { useDashboardData } from "./context";
import { CheckIcon, KeyIcon, StarIcon, WarnIcon } from "../icons";
import {
  Meter,
  StatLabel,
  StatValue,
  WidgetEmpty,
  WidgetSkeleton,
} from "./WidgetFrame";

/** Custody buckets: only "on an exchange" versus "in your own custody". */
const SELF_CUSTODY: WalletType[] = ["hardware", "software", "paper"];

/**
 * Widget 6: how much of the stack sits on exchanges versus in self custody.
 * The exchange share is the warning metric — coins on an exchange are somebody
 * else's promise, so that number is the one the widget leads with when it is
 * anything but zero.
 */
export function CustodyWidget() {
  const { t, loc, balances, balanceBtc, fmtAmountPlain, fmtDisplay, priceEur } =
    useDashboardData();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const eggs = useEasterEggs();

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
        {/* Nothing on an exchange is the point of the whole metric, so at 0 %
            the warning gives way to the acknowledgement (§5.1). */}
        {eggs && exchangeShare === 0 ? (
          <>
            <StatValue className="text-gain">
              <KeyIcon /> {t("dashboard.widgets.sovereignBadge")}
            </StatValue>
            <StatLabel>{t("dashboard.widgets.sovereignHint")}</StatLabel>
          </>
        ) : (
          <>
            <StatValue className={exchangeShare > 0 ? "text-warning" : "text-gain"}>
              {formatPercent(exchangeShare, loc).replace("+", "")}
            </StatValue>
            <StatLabel>{t("dashboard.widgets.onExchanges")}</StatLabel>
          </>
        )}
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
                <Amount>{fmtAmountPlain(r.btc)}</Amount>
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
          <WarnIcon /> {t("dashboard.widgets.exchangeWarning")}
        </p>
      )}
    </div>
  );
}

/** Balance per wallet/account, each row a jump into the filtered table. */
export function WalletBreakdownWidget() {
  const { t, loc, balances, displayPrice, currency, unit, fmtAmountPlain, openTransactions } =
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
          <th className="py-1.5 pr-2 text-right font-normal">{unit}</th>
          <th className="py-1.5 text-right font-normal">
            {currency === "BTC" ? "sats" : currency}
          </th>
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
              <Amount>{fmtAmountPlain(b.btc)}</Amount>
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
  const { t, breakdown, fmtAmountPlain } = useDashboardData();
  const rows = [
    ["dashboard.breakdownBuys", breakdown.buys],
    ["dashboard.breakdownTransferIns", breakdown.transferIns],
    ["dashboard.breakdownSells", breakdown.sells],
    ["dashboard.breakdownTransferOuts", breakdown.transferOuts],
    ["dashboard.breakdownSpends", breakdown.spends],
  ] as const;
  const total = rows.reduce((sum, [, value]) => sum.plus(value.abs()), ZERO);

  return (
    <div className="space-y-2">
      <p className="text-[0.65rem] leading-relaxed text-muted">
        {t("dashboard.breakdownIntro")}
      </p>
      {/* One bar, five parts, in the theme's chart series — the only place the
          app needs categorical colours, and it takes them from the tokens like
          everything else (CLAUDE.md §5). */}
      {total.gt(0) && (
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
          {rows.map(([key, value], i) => (
            <div
              key={key}
              className="h-full"
              style={{
                width: `${value.abs().div(total).toNumber() * 100}%`,
                background: `var(--chart-${i + 1})`,
              }}
              title={t(key)}
            />
          ))}
        </div>
      )}
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([key, value], i) => (
            <tr key={key} className="border-b border-border-c/40">
              <td className="py-1 text-muted">
                <span
                  aria-hidden
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: `var(--chart-${i + 1})` }}
                />
                {t(key)}
              </td>
              <td className="py-1 text-right font-mono whitespace-nowrap">
                <Amount>{fmtAmountPlain(value)}</Amount>
              </td>
            </tr>
          ))}
          <tr className="border-b border-border-c/40">
            <td className="py-1 text-muted">{t("dashboard.breakdownFees")}</td>
            <td className="py-1 text-right font-mono whitespace-nowrap text-muted">
              <Amount>{fmtAmountPlain(breakdown.feeBtc)}</Amount>
            </td>
          </tr>
          <tr>
            <td className="py-1 font-semibold">{t("dashboard.breakdownTotal")}</td>
            <td className="py-1 text-right font-mono font-semibold whitespace-nowrap">
              <Amount>{fmtAmountPlain(breakdown.total)}</Amount>
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
  const { t, loc, fifo, fmtAmount, fmtAmountPlain } = useDashboardData();
  const now = new Date();

  const { free, pending, unresolved, upcoming } = useMemo(() => {
    let free = ZERO;
    let pending = ZERO;
    let unresolved = ZERO;
    const upcoming: { date: Date; btc: Decimal; days: number }[] = [];
    for (const lot of fifo.openLots) {
      // Lots whose origin could not be traced have an arrival date, not an
      // acquisition date — they get counted, never dated (CLAUDE.md §3.2).
      if (lot.originUnresolved) {
        unresolved = unresolved.plus(lot.remainingBtc);
        continue;
      }
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
    return { free, pending, unresolved, upcoming };
    // `now` is intentionally not a dependency: a new Date on every render would
    // recompute forever. Day-level accuracy is enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fifo]);

  const total = free.plus(pending);
  if (!total.gt(0) && !unresolved.gt(0)) {
    return <WidgetEmpty message={t("dashboard.widgets.holdingPeriodEmpty")} />;
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue className="text-gain">{fmtAmountPlain(free)}</StatValue>
        <StatLabel>{t("dashboard.widgets.taxFreeNow")}</StatLabel>
      </div>
      <Meter value={total.gt(0) ? free.div(total).toNumber() : 0} color="bg-gain" />
      {unresolved.gt(0) && (
        <p className="text-xs text-warning">
          <WarnIcon />{" "}
          {t("dashboard.widgets.holdingPeriodUnresolved", {
            amount: fmtAmount(unresolved),
          })}
        </p>
      )}
      {upcoming.length === 0 ? (
        <p className="text-xs text-gain">
          <StarIcon /> {t("dashboard.widgets.allTaxFree")}
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
                  <Amount>{fmtAmountPlain(u.btc)}</Amount>
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
  const { t, loc, entries, openTransactions } = useDashboardData();
  const counts = useMemo(() => countIssues(entries), [entries]);
  const clean = DATA_ISSUES.every((issue) => counts[issue] === 0);
  // The backup state belongs here rather than in a tile of its own: "can this
  // file be trusted" and "does it still exist tomorrow" are the same question
  // asked twice (§6.5).
  const backupState = useAppStore((s) => s.portfolio?.backupState);

  return (
    <div className="flex h-full flex-col gap-2">
      {clean ? (
        <p className="flex h-full items-center justify-center text-xs text-gain">
          <CheckIcon /> {t("dashboard.widgets.dataQualityClean")}
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

      <p
        className={`mt-auto border-t border-border-c/40 pt-1.5 text-[0.65rem] leading-relaxed ${
          backupState?.lastVerified ? "text-muted" : "text-warning"
        }`}
      >
        {backupState?.lastBackupAt
          ? backupState.lastVerified
            ? t("dashboard.widgets.backupOk", {
                when: formatDate(backupState.lastBackupAt, loc),
              })
            : t("dashboard.widgets.backupUnverified", {
                when: formatDate(backupState.lastBackupAt, loc),
              })
          : t("dashboard.widgets.backupNever")}
      </p>
    </div>
  );
}

/**
 * What the whole thing has cost in fees.
 *
 * A BTC fee is valued at the rate of the day it was paid, not today's — fees
 * are money spent when they were spent, and valuing an old fee at today's
 * price would make it grow with the market. Days the price history has no
 * candle for are reported as "not valued" rather than dropped silently.
 *
 * Trading versus network is decided by transaction type, the only thing the
 * ledger actually knows: a fee on a trade went to a venue, a fee on a transfer
 * went to the miners.
 */
export function FeeBalanceWidget() {
  const { t, loc, entries, priceCurrency, fmtDisplay, fmtAmount, fmtAmountPlain } =
    useDashboardData();
  const startTime = entries.length > 0 ? Date.parse(entries[0].date) : null;
  const closes = useDailyCloses(priceCurrency, startTime);

  const totals = useMemo(() => {
    const byDay = new Map((closes.data ?? []).map((c) => [c.time, c.close]));
    return feeTotals(entries, byDay);
  }, [entries, closes.data]);

  if (entries.length === 0) {
    return <WidgetEmpty message={t("dashboard.widgets.feesEmpty")} />;
  }
  if (closes.loading) return <WidgetSkeleton lines={4} />;

  const share = totals.shareOfInvested;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue className="text-warning">
          {fmtDisplay(totals.totalEur.toNumber())}
        </StatValue>
        <StatLabel>
          {t("dashboard.widgets.feesPaid")}
          {share !== null && (
            <>
              {" · "}
              {formatPercent(share, loc).replace("+", "")}{" "}
              {t("dashboard.widgets.feesOfInvested")}
            </>
          )}
        </StatLabel>
      </div>

      {share !== null && <Meter value={Math.min(share, 1)} color="bg-warning" />}

      <dl className="mt-auto space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.feesTrading")}</dt>
          <dd className="font-mono">
            <Amount>{fmtDisplay(totals.tradingEur.toNumber())}</Amount>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.feesNetwork")}</dt>
          <dd className="font-mono">
            <Amount>{fmtDisplay(totals.networkEur.toNumber())}</Amount>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.feesBtc")}</dt>
          <dd className="font-mono">
            <Amount>{fmtAmountPlain(totals.totalBtc)}</Amount>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.feesInvested")}</dt>
          <dd className="font-mono text-muted">
            <Amount>{fmtDisplay(totals.investedEur.toNumber())}</Amount>
          </dd>
        </div>
      </dl>

      {totals.unvaluedBtc.gt(0) && (
        <p className="text-[0.65rem] leading-relaxed text-muted">
          {t("dashboard.widgets.feesUnvalued", {
            amount: fmtAmount(totals.unvaluedBtc),
          })}
        </p>
      )}
      {closes.error && (
        <p className="text-[0.65rem] leading-relaxed text-muted">
          {t("dashboard.widgets.feesNoHistory")}
        </p>
      )}
    </div>
  );
}

/**
 * How long this has been running, and how deep it went in between.
 *
 * The drawdown is the *portfolio's*, not the price's: buying on the way down
 * lifts the curve again, so this number describes what the position actually
 * went through rather than what the market did.
 */
export function TimeInMarketWidget() {
  const { t, loc, entries, priceCurrency, fmtDisplay } = useDashboardData();
  const now = useNowDate();
  const startTime = entries.length > 0 ? Date.parse(entries[0].date) : null;
  const closes = useDailyCloses(priceCurrency, startTime);

  const market = useMemo(
    () => (now === null ? null : timeInMarket(entries, now)),
    [entries, now],
  );
  const drawdown = useMemo(
    () => (closes.data ? maxDrawdown(dailyValueSeries(entries, closes.data)) : null),
    [entries, closes.data],
  );

  if (market === null) return <WidgetSkeleton lines={3} />;
  if (market.firstBuyDate === null) {
    return <WidgetEmpty message={t("dashboard.widgets.timeInMarketEmpty")} />;
  }

  const years = market.days / 365;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue>{formatInt(market.days, loc)}</StatValue>
        <StatLabel>
          {t("dashboard.widgets.daysInMarket")} ·{" "}
          {t("dashboard.widgets.yearsInMarket", { years: years.toFixed(1) })}
        </StatLabel>
      </div>

      <dl className="mt-auto space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.firstBuy")}</dt>
          <dd className="font-mono">{formatDate(market.firstBuyDate, loc)}</dd>
        </div>
        {market.buysPerYear !== null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("dashboard.widgets.buysPerYear")}</dt>
            <dd className="font-mono">{market.buysPerYear.toFixed(1)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.maxDrawdown")}</dt>
          <dd className="font-mono">
            {closes.loading ? (
              "…"
            ) : drawdown === null || drawdown.maxDrawdown === 0 ? (
              "—"
            ) : (
              <PnlValue value={-drawdown.maxDrawdown}>
                −{formatPercent(drawdown.maxDrawdown, loc).replace("+", "")}
              </PnlValue>
            )}
          </dd>
        </div>
      </dl>

      {drawdown !== null && drawdown.maxDrawdown > 0 && drawdown.troughTime !== null && (
        <p className="text-[0.65rem] leading-relaxed text-muted">
          <Amount>
            {t("dashboard.widgets.drawdownDetail", {
              peak: fmtDisplay(drawdown.peakValue),
              trough: fmtDisplay(drawdown.troughValue),
              date: formatDate(drawdown.troughTime, loc),
            })}
          </Amount>
        </p>
      )}
    </div>
  );
}

/**
 * The last few milestones reached, and how far the catalogue is (§5.2).
 *
 * Deliberately a *record*, not a scoreboard: it shows what was decided and
 * when, never a rank and never a comparison, because there is nobody to
 * compare with — the app has only ever seen this one portfolio.
 */
export function MilestonesWidget() {
  const { t, loc, openMilestones } = useDashboardData();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const records = useMemo(() => portfolio.milestones ?? [], [portfolio.milestones]);

  const recent = useMemo(
    () =>
      [...records]
        .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
        .slice(0, 4),
    [records],
  );

  if (records.length === 0) {
    return (
      <WidgetEmpty
        message={t("milestones.widgetEmpty")}
        action={{ label: t("milestones.title"), onClick: openMilestones }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue>
          {records.length}
          <span className="text-base font-normal text-muted"> / {MILESTONES.length}</span>
        </StatValue>
        <StatLabel>{t("milestones.overall")}</StatLabel>
      </div>
      <Meter value={records.length / MILESTONES.length} />

      <ul className="mt-auto space-y-1 text-xs">
        {recent.map((m) => (
          <li key={m.id} className="flex items-baseline gap-2">
            <MilestoneIcon id={m.id} className="h-3.5 w-3.5 shrink-0 self-center text-accent" />
            <span className="min-w-0 flex-1 truncate">
              {t(`milestones.catalog.${m.id}.title`)}
            </span>
            <span className="shrink-0 font-mono text-[0.65rem] text-muted">
              {formatDate(m.achievedAt, loc)}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={openMilestones}
        className="text-left text-[0.65rem] text-accent underline decoration-dotted"
      >
        {t("milestones.showAll")} →
      </button>
    </div>
  );
}
