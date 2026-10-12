"use client";

// The figures of a calculation as tiles: the final value large, the rest
// small. When part of the plan is estimated, every tile shows the mean and,
// below it, the cautious-to-optimistic range — the uncertainty belongs in the
// numbers, not only in the chart.

import { formatCalendarDate } from "@/lib/dates";
import { Decimal, formatBtc, formatFiat, formatInt, formatPercent } from "@/lib/decimal";
import { intlLocale, useI18n } from "@/lib/i18n";
import type { Scenario } from "@/lib/dca/powerLaw";
import { usesProjection, type DcaPlan, type DcaResult } from "@/lib/dca/simulate";
import { Amount, PnlValue } from "../ui";
import InfoTip from "./InfoTip";

export type DcaResults = Partial<Record<Scenario, DcaResult>> & { mean: DcaResult };

function Tile({
  label,
  info,
  children,
  range,
  className = "",
}: {
  label: string;
  info?: string;
  children: React.ReactNode;
  range?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg bg-surface-2/50 px-3 py-2 ${className}`}>
      <p className="flex items-center gap-1 text-[0.7rem] text-muted">
        {label}
        {info && <InfoTip label={label} text={info} />}
      </p>
      <div className="font-mono text-sm tabular-nums text-foreground">{children}</div>
      {range && <p className="font-mono text-[0.65rem] tabular-nums text-muted">{range}</p>}
    </div>
  );
}

export default function DcaResultTiles({
  plan,
  results,
  lastPriceDay,
}: {
  plan: DcaPlan;
  results: DcaResults;
  lastPriceDay: string;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const m = results.mean;
  const estimated = usesProjection(m);

  const eur = (v: Decimal | null) => (v === null ? "–" : formatFiat(v, "EUR", loc));
  const pct = (v: Decimal | null) => (v === null ? "–" : formatPercent(v.toNumber(), loc));

  /** "low bis high" under a tile, only when part of the plan is estimated. */
  const range = (pick: (r: DcaResult) => Decimal | null, show: (v: Decimal | null) => string) => {
    if (!estimated || !results.lower || !results.upper) return undefined;
    let low = pick(results.lower);
    let high = pick(results.upper);
    // A cheaper path buys more bitcoin: order by value, not by scenario.
    if (low !== null && high !== null && low.gt(high)) [low, high] = [high, low];
    return <Amount>{t("dca.results.range", { low: show(low), high: show(high) })}</Amount>;
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile
          label={t("dca.results.endValue")}
          className="col-span-2 bg-accent/10 sm:col-span-3"
          range={range((r) => r.endValue, eur)}
        >
          <span className="font-heading text-2xl font-bold text-accent sm:text-3xl">
            <Amount>{eur(m.endValue)}</Amount>
          </span>
          <span className="ml-2 font-sans text-xs text-muted">
            {t("dca.results.endValueOn", { date: formatCalendarDate(plan.end, loc) })}
          </span>
        </Tile>
        <Tile label={t("dca.results.invested")}>
          <Amount>{eur(m.invested)}</Amount>
          {m.fees.gt(0) && (
            <span className="block text-[0.65rem] text-muted">
              <Amount>{t("dca.results.feesIncluded", { fees: eur(m.fees) })}</Amount>
            </span>
          )}
        </Tile>
        <Tile label={t("dca.results.pnl")} range={range((r) => r.pnl, eur)}>
          <PnlValue value={m.pnl.toNumber()}>{formatFiat(m.pnl, "EUR", loc, true)}</PnlValue>
        </Tile>
        <Tile label={t("dca.results.btc")} range={range((r) => r.btc, (v) => `${formatBtc(v!, loc)} BTC`)}>
          <Amount>
            {formatBtc(m.btc, loc)} BTC
            <span className="block text-[0.65rem] text-muted">
              {formatInt(m.btc.times(100_000_000).toDecimalPlaces(0).toNumber(), loc)} sats
            </span>
          </Amount>
        </Tile>
        <Tile
          label={t("dca.results.averagePrice")}
          info={t("dca.results.averageInfo")}
          range={range((r) => r.averagePrice, eur)}
        >
          {eur(m.averagePrice)}
        </Tile>
        <Tile
          label={t("dca.results.simpleReturn")}
          info={t("dca.results.simpleInfo")}
          range={range((r) => r.simpleReturn, pct)}
        >
          {m.simpleReturn === null ? (
            "–"
          ) : (
            <PnlValue value={m.simpleReturn.toNumber()}>{pct(m.simpleReturn)}</PnlValue>
          )}
        </Tile>
        <Tile
          label={t("dca.results.irr")}
          info={t("dca.results.irrInfo")}
          range={range((r) => r.irr, pct)}
        >
          {m.irr === null ? "–" : <PnlValue value={m.irr.toNumber()}>{pct(m.irr)}</PnlValue>}
        </Tile>
      </div>

      <div className="mt-auto space-y-1 text-[0.7rem] leading-snug text-muted">
        <p>
          {t("dca.results.purchases", {
            count: m.purchases.length,
            start: formatCalendarDate(plan.start, loc),
            end: formatCalendarDate(plan.end, loc),
          })}
        </p>
        {m.shiftedPurchases > 0 && (
          <p>{t("dca.results.shifted", { count: m.shiftedPurchases })}</p>
        )}
        {estimated && (
          // Right at the figures: an estimated number is never read without it.
          <p role="note" className="text-warning">
            {t("dca.results.estimateNote", { date: formatCalendarDate(lastPriceDay, loc) })}
          </p>
        )}
        <p>{t("dca.results.noAdvice")}</p>
      </div>
    </div>
  );
}
