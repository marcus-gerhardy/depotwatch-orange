"use client";

// Headline-figure widgets: portfolio value, P/L, BTC price, sats stack and
// average cost. All of them read the shared dashboard context — none fetches
// anything of its own beyond the daily closes, which are cached per day.

import { useMemo, useState } from "react";
import {
  formatFiat,
  formatFiatInput,
  formatInt,
  formatPercent,
  parseNumberInput,
} from "@/lib/decimal";
import { whatIf } from "@/lib/dashboardStats";
import { dailyValueSeries } from "@/lib/portfolio";
import { useDailyCloses } from "@/lib/marketData";
import { SATS_PER_BTC, moscowTime } from "@/lib/displayUnit";
import { formatPizzas, isPizzaDay, pizzasFor, useEasterEggs } from "@/lib/easterEggs";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { Amount, PnlValue, inputCls } from "../ui";
import { useDashboardData } from "./context";
import {
  Meter,
  StatLabel,
  StatValue,
  WidgetEmpty,
  WidgetSkeleton,
} from "./WidgetFrame";

const DAY = 86_400_000;

/** Change over a period, as a chip with sign colour. */
function DeltaChip({
  label,
  absolute,
  relative,
  format,
}: {
  label: string;
  absolute: number | null;
  relative: number | null;
  format: (v: number) => string;
}) {
  const { loc } = useDashboardData();
  return (
    <div className="min-w-0">
      <div className="text-[0.65rem] tracking-wide text-muted uppercase">{label}</div>
      {absolute === null ? (
        <div className="text-xs text-muted">—</div>
      ) : (
        <PnlValue value={absolute} showArrow={false}>
          <span className="block truncate text-xs font-medium">
            {absolute > 0 ? "+" : "−"}
            {format(absolute)}
          </span>
          {relative !== null && (
            <span className="block text-[0.65rem] opacity-80">
              {formatPercent(relative, loc)}
            </span>
          )}
        </PnlValue>
      )}
    </div>
  );
}

/**
 * Widget 1: total portfolio value plus its 24h / 7d / 30d change.
 *
 * The current value uses the live spot price; the comparison points come from
 * the daily-close series, so a change reflects both the price move and any
 * buying or selling that happened in between.
 */
export function PortfolioValueWidget() {
  const { t, loc, currency, priceCurrency, entries, balanceBtc, displayPrice, fmtValue, fmtAmount } =
    useDashboardData();
  const eggs = useEasterEggs();
  const startTime = entries.length > 0 ? Date.parse(entries[0].date) : null;
  const closes = useDailyCloses(priceCurrency, startTime);
  const inSats = currency === "BTC";

  const series = useMemo(
    () =>
      (closes.data ? dailyValueSeries(entries, closes.data) : []).map((p) => ({
        ...p,
        // On a Bitcoin standard the value of the stack is the stack.
        value: inSats ? p.btc * SATS_PER_BTC : p.value,
      })),
    [entries, closes.data, inSats],
  );

  const totalBtc = balanceBtc.toNumber();
  const totalValue = displayPrice !== null ? totalBtc * displayPrice : null;

  /**
   * Portfolio value `days` ago. The series runs to today, so its last day is
   * the reference point — comparing against the same day grid the values come
   * from avoids an off-by-one whenever the wall clock and the last candle
   * disagree about which day it is.
   */
  const valueDaysAgo = (days: number): number | null => {
    if (series.length === 0) return null;
    const target = series[series.length - 1].time - days * DAY;
    let found: number | null = null;
    for (const p of series) {
      if (p.time <= target) found = p.value;
      else break;
    }
    return found;
  };

  const periods: [string, number][] = [
    ["dashboard.widgets.change24h", 1],
    ["dashboard.widgets.change7d", 7],
    ["dashboard.widgets.change30d", 30],
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue>
          {/* Measured in Bitcoin, a Bitcoin is worth a Bitcoin — the one figure
              on this dashboard that never moves (§5.1). */}
          {inSats && eggs ? t("dashboard.widgets.oneBtc") : fmtValue(totalValue)}
        </StatValue>
        <StatLabel>
          <Amount>{fmtAmount(balanceBtc)}</Amount>
        </StatLabel>
        {eggs && isPizzaDay() && balanceBtc.gt(0) && (
          <StatLabel>
            <Amount>
              🍕{" "}
              {t("dashboard.widgets.pizzaDay", {
                pizzas: formatPizzas(pizzasFor(balanceBtc), loc),
              })}
            </Amount>
          </StatLabel>
        )}
      </div>
      {closes.loading && entries.length > 0 ? (
        <WidgetSkeleton lines={2} />
      ) : (
        <div className="mt-auto grid grid-cols-3 gap-2">
          {periods.map(([key, days]) => {
            const then = valueDaysAgo(days);
            const absolute =
              totalValue === null || then === null ? null : totalValue - then;
            return (
              <DeltaChip
                key={key}
                label={t(key)}
                absolute={absolute}
                relative={
                  absolute === null || then === null || then === 0
                    ? null
                    : absolute / then
                }
                format={fmtValue}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Widget 2: unrealized P/L against cost basis, realized gains separately.
 *
 * Both sides of the subtraction have to describe the *same* coins. The cost
 * basis only covers open lots that have a known cost per BTC, so the market
 * value is taken over `fifo.openBasisBtc` rather than over the whole holding —
 * valuing every coin against a partial cost basis turns coins whose purchase
 * price is unknown (an external transfer_in without a price, a buy with no EUR
 * figure) into pure profit, which can show a gain while the price sits below
 * the average cost. What is left out is stated below the figure instead.
 */
export function PnlWidget() {
  const { t, loc, fifo, balanceBtc, priceEur, fmtDisplay, fmtAmount, fmtAmountPlain } =
    useDashboardData();
  const openCostEur = fifo.openCostBasisEur.toNumber();
  const basisBtc = fifo.openBasisBtc;
  const unrealizedEur =
    priceEur === null ? null : basisBtc.toNumber() * priceEur - openCostEur;
  const unrealizedPct =
    unrealizedEur === null || openCostEur === 0 ? null : unrealizedEur / openCostEur;
  const realizedEur = fifo.realizedGainEur.toNumber();
  // Holding the cost basis says nothing about. Negative if the engine covered
  // more than the ledger holds, which the dashboard already warns about.
  const withoutBasisBtc = balanceBtc.minus(basisBtc);

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue>
          <PnlValue value={unrealizedEur ?? 0}>{fmtDisplay(unrealizedEur)}</PnlValue>
        </StatValue>
        <StatLabel>
          {t("dashboard.widgets.unrealizedAgainstCost")}
          {unrealizedPct !== null && (
            <>
              {" · "}
              <PnlValue value={unrealizedEur ?? 0}>
                {formatPercent(unrealizedPct, loc)}
              </PnlValue>
            </>
          )}
        </StatLabel>
      </div>
      <dl className="mt-auto space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.costBasis")}</dt>
          <dd className="font-mono">
            <Amount>{fmtDisplay(openCostEur)}</Amount>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.pnlCoveredBtc")}</dt>
          <dd className="font-mono">
            <Amount>{fmtAmountPlain(basisBtc)}</Amount>
          </dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-border-c/40 pt-1">
          <dt className="text-muted">{t("dashboard.realizedPnl")}</dt>
          <dd className="font-mono">
            <PnlValue value={realizedEur}>{fmtDisplay(realizedEur)}</PnlValue>
          </dd>
        </div>
        {TAX_FEATURES_ENABLED && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("tax.taxFreeGain")}</dt>
            <dd className="font-mono">
              <Amount>{fmtDisplay(fifo.realizedTaxFreeGainEur.toNumber())}</Amount>
            </dd>
          </div>
        )}
      </dl>
      {withoutBasisBtc.gt("0.00000001") && (
        <p className="text-[0.65rem] leading-relaxed text-warning">
          ⚠{" "}
          <Amount>
            {t("dashboard.widgets.pnlWithoutBasisHint", {
              amount: fmtAmount(withoutBasisBtc),
            })}
          </Amount>
        </p>
      )}
    </div>
  );
}

/** The BTC spot price card the dashboard has always shown. */
export function BtcPriceWidget() {
  const { t, loc, currency, displayPrice, priceEur, priceUsd, priceError, priceLoading, fmtValue } =
    useDashboardData();
  // Moscow time is a dollar figure by convention — sats per US dollar, wherever
  // one reads it — so it stays on the USD price no matter what the file
  // displays. A "moscow time" that meant something else per user would not be
  // comparable to the one everybody else quotes.
  const moscow = moscowTime(priceUsd);
  // The display currency first, then the fiat it does not already show. Both
  // fiat prices come from the spot request that runs anyway (the EUR/USD cross
  // rate needs them), so naming the second one costs nothing; displaying BTC
  // puts the first row in sats, which leaves both fiat prices worth listing.
  const placeholder = priceLoading ? "…" : priceError ? t("dashboard.priceUnavailable") : "—";
  const rows: { code: string; value: string }[] = [
    {
      code: currency,
      value: displayPrice === null ? placeholder : fmtValue(displayPrice),
    },
    ...(
      [
        ["EUR", priceEur],
        ["USD", priceUsd],
      ] as const
    )
      .filter(([code]) => code !== currency)
      .map(([code, price]) => ({
        code,
        value: price === null ? placeholder : formatFiat(price, code, loc),
      })),
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="space-y-1">
        {/* One row per currency, identical in every respect but colour: the
            displayed one in the accent, the rest muted. */}
        <div className="space-y-0.5">
          {rows.map(({ code, value }, i) => (
            <div key={code} className="flex items-baseline gap-2">
              <span className="w-8 shrink-0 text-[0.6rem] font-semibold tracking-[0.12em] text-muted uppercase">
                {code}
              </span>
              <span
                className={`truncate font-mono text-xl leading-tight font-semibold tabular-nums ${
                  i === 0 ? "text-accent" : "text-muted"
                }`}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
        <StatLabel>{t("dashboard.widgets.spotPriceSource")}</StatLabel>
      </div>
      <div
        className="mt-auto flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/5 px-2.5 py-1.5"
        title={t("dashboard.widgets.moscowTimeHint")}
      >
        <span className="font-mono text-xl leading-none font-semibold tracking-wider text-accent tabular-nums">
          {moscow ? (
            <>
              {moscow.clock.slice(0, 2)}
              <span className="text-accent/50">:</span>
              {moscow.clock.slice(3)}
            </>
          ) : priceLoading ? (
            "…"
          ) : (
            "—"
          )}
        </span>
        <span className="ml-auto min-w-0 text-right">
          <span className="block truncate text-[0.6rem] font-semibold tracking-[0.12em] text-muted uppercase">
            {t("dashboard.widgets.moscowTime")}
          </span>
          {moscow && (
            <span className="block truncate text-[0.65rem] text-muted">
              {t("dashboard.widgets.moscowTimeSats", {
                sats: formatInt(moscow.sats, loc),
              })}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/** Milestones a stack grows through, in sats. */
const SATS_MILESTONES = [
  { sats: 1_000_000, key: "dashboard.widgets.milestone001" },
  { sats: 10_000_000, key: "dashboard.widgets.milestone01" },
  { sats: 50_000_000, key: "dashboard.widgets.milestone05" },
  { sats: 100_000_000, key: "dashboard.widgets.milestoneWholecoiner" },
];

/** Widget 4: the stack in sats, with progress towards the next milestone. */
export function SatsStackWidget() {
  const { t, loc, balanceBtc } = useDashboardData();
  const sats = Math.round(balanceBtc.mul(100_000_000).toNumber());
  const next = SATS_MILESTONES.find((m) => sats < m.sats);
  const wholecoin = sats / 100_000_000;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue>{formatInt(sats, loc)}</StatValue>
        <StatLabel>{t("dashboard.widgets.sats")}</StatLabel>
      </div>
      <div className="mt-auto space-y-2">
        {next ? (
          <div>
            <div className="mb-1 flex justify-between gap-2 text-xs">
              <span className="text-muted">
                {t("dashboard.widgets.nextMilestone")}: {t(next.key)}
              </span>
              <span className="font-mono">
                <Amount>{formatPercent(sats / next.sats, loc).replace("+", "")}</Amount>
              </span>
            </div>
            <Meter value={sats / next.sats} />
            <div className="mt-1 text-[0.65rem] text-muted">
              <Amount>
                {t("dashboard.widgets.satsToGo", {
                  amount: formatInt(next.sats - sats, loc),
                })}
              </Amount>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gain">
            ★ {t("dashboard.widgets.wholecoinerReached")}
          </p>
        )}
        <div className="text-[0.65rem] text-muted">
          <Amount>
            {t("dashboard.widgets.ofOneBtc", {
              percent: formatPercent(wholecoin, loc).replace("+", ""),
            })}
          </Amount>
        </div>
      </div>
    </div>
  );
}

/**
 * Widget 5: average cost basis against the current price. The bar puts both on
 * one scale so the distance is visible at a glance rather than only readable.
 */
export function AvgCostWidget() {
  const { t, loc, fifo, displayPrice, eurToDisplay, fmtDisplay, fmtValue } =
    useDashboardData();
  const avgEur = fifo.avgCostPerBtcEur?.toNumber() ?? null;
  const avgDisplay =
    avgEur === null || eurToDisplay === null ? null : avgEur * eurToDisplay;
  const diff =
    avgDisplay === null || displayPrice === null ? null : displayPrice - avgDisplay;
  const diffPct = diff === null || !avgDisplay ? null : diff / avgDisplay;

  // Both markers share one axis from 0 to the higher of the two values.
  const scale = Math.max(avgDisplay ?? 0, displayPrice ?? 0) || 1;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue>{avgEur === null ? "—" : fmtDisplay(avgEur)}</StatValue>
        <StatLabel>{t("dashboard.avgCost")}</StatLabel>
      </div>
      {avgDisplay === null || displayPrice === null ? (
        <p className="mt-auto text-xs text-muted">
          {t("dashboard.widgets.avgCostUnknown")}
        </p>
      ) : (
        <div className="mt-auto space-y-2">
          <div className="relative h-6">
            <div className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-surface-2" />
            <div
              className="absolute top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-muted"
              style={{ left: `${(avgDisplay / scale) * 100}%` }}
              title={t("dashboard.avgCost")}
            />
            <div
              className="absolute top-0 h-6 w-0.5 -translate-x-1/2 rounded bg-accent"
              style={{ left: `${(displayPrice / scale) * 100}%` }}
              title={t("dashboard.price")}
            />
          </div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted">{t("dashboard.widgets.distance")}</span>
            <PnlValue value={diff ?? 0} showArrow={false}>
              <span className="font-mono">
                {diff !== null && diff > 0 ? "+" : diff !== null && diff < 0 ? "−" : ""}
                {fmtValue(diff)}
                {diffPct !== null && ` (${formatPercent(diffPct, loc)})`}
              </span>
            </PnlValue>
          </div>
          <div className="flex justify-between gap-2 text-[0.65rem] text-muted">
            <span>
              ▎{t("dashboard.avgCost")}: {fmtDisplay(avgEur)}
            </span>
            <span className="text-accent">
              ▎{t("dashboard.price")}: {fmtValue(displayPrice)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Steps the slider offers around the current price, as factors. */
const WHAT_IF_MIN = 0.25;
const WHAT_IF_MAX = 5;

/**
 * The portfolio at a price that does not exist yet.
 *
 * Valued over the open lots that *have* a cost basis, exactly like the P/L
 * widget (§4.1): coins whose acquisition price is unknown would otherwise turn
 * their whole market value into profit. The slider spans a quarter to five
 * times today's price, and the field takes any number for the cases that range
 * does not cover — a scenario tool that cannot express one's actual scenario
 * is a toy.
 */
export function WhatIfWidget() {
  const { t, loc, fifo, priceEur, priceCurrency, fmtDisplay, fmtAmountPlain } =
    useDashboardData();
  const [override, setOverride] = useState<string | null>(null);

  // Nothing to model against until the live price arrives; the field is what
  // the tile is for, so it waits rather than inventing a reference.
  if (priceEur === null) return <WidgetSkeleton lines={3} />;
  if (!fifo.openBasisBtc.gt(0)) {
    return <WidgetEmpty message={t("dashboard.widgets.whatIfEmpty")} />;
  }

  const parsed = override === null ? null : parseNumberInput(override);
  const price =
    parsed !== null && Number.isFinite(Number(parsed)) && Number(parsed) > 0
      ? Number(parsed)
      : priceEur;
  const result = whatIf(fifo, price, priceEur);
  const pnl = result.pnlEur?.toNumber() ?? null;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue>{fmtDisplay(result.valueEur.toNumber())}</StatValue>
        <StatLabel>
          {t("dashboard.widgets.whatIfValue")}
          {result.multiple !== null && result.multiple !== 1 && (
            <> · {t("dashboard.widgets.whatIfMultiple", {
              multiple: result.multiple.toFixed(2),
            })}</>
          )}
        </StatLabel>
      </div>

      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted">{t("dashboard.widgets.whatIfPrice")}</span>
          <input
            className={`${inputCls} w-32 py-1 font-mono text-xs`}
            inputMode="decimal"
            value={override ?? formatFiatInput(String(price), loc)}
            onChange={(e) => setOverride(e.target.value)}
            aria-label={t("dashboard.widgets.whatIfPrice")}
          />
          <span className="text-muted">{priceCurrency}</span>
        </label>
        <input
          type="range"
          className="w-full accent-accent"
          min={Math.round(priceEur * WHAT_IF_MIN)}
          max={Math.round(priceEur * WHAT_IF_MAX)}
          step={Math.max(1, Math.round(priceEur / 200))}
          value={Math.min(
            Math.max(price, priceEur * WHAT_IF_MIN),
            priceEur * WHAT_IF_MAX,
          )}
          onChange={(e) => setOverride(e.target.value)}
          aria-label={t("dashboard.widgets.whatIfPrice")}
        />
        <div className="flex justify-between text-[0.6rem] text-muted">
          <span>{fmtDisplay(priceEur * WHAT_IF_MIN)}</span>
          <button
            type="button"
            className="underline decoration-dotted hover:text-foreground"
            onClick={() => setOverride(null)}
          >
            {t("dashboard.widgets.whatIfReset")}
          </button>
          <span>{fmtDisplay(priceEur * WHAT_IF_MAX)}</span>
        </div>
      </div>

      <dl className="mt-auto space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.whatIfPnl")}</dt>
          <dd className="font-mono">
            {pnl === null ? (
              "—"
            ) : (
              <PnlValue value={pnl}>
                {pnl > 0 ? "+" : pnl < 0 ? "−" : ""}
                {fmtDisplay(Math.abs(pnl))}
                {result.pnlPct !== null &&
                  ` (${formatPercent(result.pnlPct, loc)})`}
              </PnlValue>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.whatIfValued")}</dt>
          <dd className="font-mono text-muted">
            <Amount>{fmtAmountPlain(fifo.openBasisBtc)}</Amount>
          </dd>
        </div>
      </dl>
    </div>
  );
}
