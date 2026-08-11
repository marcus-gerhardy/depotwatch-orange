"use client";

// Tax widgets (German rules, §23 EStG): what could be realised tax-free right
// now, and how much of this year's exemption limit is left.
//
// Both read the persisted lot assignments through the FIFO engine and never
// guess: a lot whose origin could not be traced (§3.2) is reported as exactly
// that, never counted as tax-free and never quietly counted as taxable. Both
// are gated by TAX_FEATURES_ENABLED in the registry, like every other tax
// surface.

import { useMemo } from "react";
import { formatPercent } from "@/lib/decimal";
import { formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useNowDate } from "@/lib/clock";
import { realizedInYear, taxFreeRealizable } from "@/lib/dashboardStats";
import { DEFAULT_TAX_EXEMPTION_LIMIT_EUR } from "@/lib/types";
import { Amount, PnlValue } from "../ui";
import { useDashboardData } from "./context";
import {
  Meter,
  StatLabel,
  StatValue,
  WidgetEmpty,
  WidgetSkeleton,
} from "./WidgetFrame";

/**
 * What is out of the holding period, valued at the current price.
 *
 * The holding period comes from the *resolved original* acquisition (§3.2),
 * which is what the FIFO engine already carries on every open lot — a transfer
 * between one's own wallets never restarts the clock. Lots whose origin the
 * trace could not establish are shown separately: their acquisition date is an
 * arrival, so calling them tax-free would be an invention.
 */
export function TaxFreeProceedsWidget() {
  const { t, loc, fifo, priceEur, fmtDisplay, fmtAmountPlain, unit } = useDashboardData();
  // The clock ticks per minute (lib/clock.ts): a lot becoming tax-free is a
  // date, and the tile should not need a reload to notice.
  const now = useNowDate();

  const summary = useMemo(
    () => (now === null ? null : taxFreeRealizable(fifo.openLots, now)),
    [fifo.openLots, now],
  );

  if (summary === null) return <WidgetSkeleton lines={3} />;

  if (!summary.btc.gt(0) && !summary.unresolvedBtc.gt(0) && !summary.lockedBtc.gt(0)) {
    return <WidgetEmpty message={t("dashboard.widgets.taxFreeEmpty")} />;
  }

  const proceedsEur = priceEur === null ? null : summary.btc.mul(priceEur).toNumber();
  const total = summary.btc.plus(summary.lockedBtc);
  const share = total.gt(0) ? summary.btc.div(total).toNumber() : 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue className="text-gain">{fmtDisplay(proceedsEur)}</StatValue>
        <StatLabel>{t("dashboard.widgets.taxFreeProceedsLabel")}</StatLabel>
      </div>

      <div>
        <div className="mb-1 flex justify-between gap-2 text-xs">
          <span className="text-muted">{t("dashboard.widgets.taxFreeShare")}</span>
          <span className="font-mono">
            {formatPercent(share, loc).replace("+", "")}
          </span>
        </div>
        <Meter value={share} color="bg-gain" />
      </div>

      <dl className="mt-auto space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">
            {t("dashboard.widgets.taxFreeAmount", { unit })}
          </dt>
          <dd className="font-mono">
            <Amount>{fmtAmountPlain(summary.btc)}</Amount>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.taxFreeLots")}</dt>
          <dd className="font-mono">{summary.lotCount}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">
            {t("dashboard.widgets.taxFreeLocked", { unit })}
          </dt>
          <dd className="font-mono text-muted">
            <Amount>{fmtAmountPlain(summary.lockedBtc)}</Amount>
          </dd>
        </div>
        {summary.unresolvedBtc.gt(0) && (
          <div className="flex justify-between gap-2">
            <dt className="text-warning">
              {t("dashboard.widgets.taxFreeUnresolved", {
                count: summary.unresolvedLotCount,
              })}
            </dt>
            <dd className="font-mono text-warning">
              <Amount>{fmtAmountPlain(summary.unresolvedBtc)}</Amount>
            </dd>
          </div>
        )}
      </dl>

      <p className="text-[0.65rem] leading-relaxed text-muted">
        {t("dashboard.widgets.taxDisclaimer")}
      </p>
    </div>
  );
}

/**
 * This year's realised gains against the §23 EStG exemption limit.
 *
 * The limit is a *Freigrenze*, not an allowance: one euro over it and the
 * whole gain is taxable, not just the excess. That is the single most
 * misunderstood thing about it, so the widget says it in words rather than
 * leaving it to a progress bar — and it changes its tone once the line is
 * crossed instead of just filling up.
 *
 * The threshold comes from the settings (§6.3), because the legislator moves
 * it; the widget never hard-codes a figure.
 */
export function ExemptionLimitWidget() {
  const { t, loc, fifo, fmtDisplay } = useDashboardData();
  const limitSetting = useAppStore((s) => s.portfolio?.settings.taxExemptionLimitEur);
  const now = useNowDate();
  const year = now?.getFullYear() ?? null;
  const limit = limitSetting ?? DEFAULT_TAX_EXEMPTION_LIMIT_EUR;

  const realized = useMemo(
    () => (year === null ? null : realizedInYear(fifo.disposals, year)),
    [fifo.disposals, year],
  );

  if (realized === null || now === null || year === null) {
    return <WidgetSkeleton lines={3} />;
  }

  const gain = realized.taxableGainEur.toNumber();
  const exceeded = limit > 0 && gain > limit;
  const headroom = limit - gain;
  const fill = limit > 0 ? Math.max(0, gain) / limit : 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue className={exceeded ? "text-loss" : undefined}>
          <PnlValue value={gain}>{fmtDisplay(gain)}</PnlValue>
        </StatValue>
        <StatLabel>
          {t("dashboard.widgets.exemptionRealized", { year: String(year) })}
        </StatLabel>
      </div>

      <div>
        <div className="mb-1 flex justify-between gap-2 text-xs">
          <span className="text-muted">
            {t("dashboard.widgets.exemptionLimitLabel")} {fmtDisplay(limit)}
          </span>
          <span className="font-mono">
            {formatPercent(Math.min(fill, 1), loc).replace("+", "")}
          </span>
        </div>
        <Meter value={fill} color={exceeded ? "bg-loss" : "bg-gain"} />
      </div>

      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">
            {exceeded
              ? t("dashboard.widgets.exemptionOver")
              : t("dashboard.widgets.exemptionHeadroom")}
          </dt>
          <dd className={`font-mono ${exceeded ? "text-loss" : "text-gain"}`}>
            <Amount>{fmtDisplay(Math.abs(headroom))}</Amount>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.exemptionDisposals")}</dt>
          <dd className="font-mono">{realized.disposalCount}</dd>
        </div>
        {realized.taxFreeGainEur.abs().gt(0) && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("dashboard.widgets.exemptionTaxFreeGain")}</dt>
            <dd className="font-mono text-muted">
              <Amount>{fmtDisplay(realized.taxFreeGainEur.toNumber())}</Amount>
            </dd>
          </div>
        )}
        {realized.unresolvedOriginBtc.gt(0) && (
          <div className="flex justify-between gap-2">
            <dt className="text-warning">
              {t("dashboard.widgets.exemptionUnresolved")}
            </dt>
            <dd className="font-mono text-warning">
              <Amount>{realized.unresolvedOriginBtc.toFixed(8)}</Amount>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-auto space-y-1">
        {/* The distinction that decides the tax bill, spelled out — a bar that
            simply fills up would suggest an allowance. */}
        <p
          className={`text-[0.65rem] leading-relaxed ${
            exceeded ? "text-loss" : "text-warning"
          }`}
        >
          ⚠ {t("dashboard.widgets.exemptionIsLimitNotAllowance")}
        </p>
        <p className="text-[0.65rem] leading-relaxed text-muted">
          {t("dashboard.widgets.taxDisclaimer")}
        </p>
        {realized.disposalCount > 0 && (
          <p className="text-[0.6rem] text-muted">
            {t("dashboard.widgets.exemptionAsOf", {
              date: formatDate(now.toISOString(), loc),
            })}
          </p>
        )}
      </div>
    </div>
  );
}
