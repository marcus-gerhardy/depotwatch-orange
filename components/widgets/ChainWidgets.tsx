"use client";

// On-chain widgets. Both read exclusively from the explorer configured in the
// settings (CLAUDE.md §3.3) — no hard-wired third party — and both fail on
// their own: an unreachable explorer puts this tile into an error state and
// leaves the rest of the dashboard untouched.

import { formatDate } from "@/lib/i18n";
import { useNow } from "@/lib/clock";
import { formatInt } from "@/lib/decimal";
import { useBlockHeight, useFeeEstimates } from "@/lib/marketData";
import { explorerBase } from "@/lib/esplora";
import { feeMood, useEasterEggs } from "@/lib/easterEggs";
import { useDashboardData } from "./context";
import { Meter, StatLabel, StatValue, WidgetError, WidgetSkeleton } from "./WidgetFrame";

/** Widget 8: current fee rates in sat/vB from the configured explorer. */
export function NetworkFeesWidget() {
  const { t, explorerSettings } = useDashboardData();
  const fees = useFeeEstimates(explorerSettings);
  const eggs = useEasterEggs();

  if (fees.loading) return <WidgetSkeleton lines={4} />;
  if (fees.error || !fees.data) {
    return (
      <WidgetError
        message={t("dashboard.widgets.explorerUnavailable", {
          endpoint: explorerBase(explorerSettings) || "—",
        })}
        onRetry={fees.reload}
        retryLabel={t("common.refresh")}
      />
    );
  }

  const rows: [string, number][] = [
    ["dashboard.widgets.feeFastest", fees.data.fastestFee],
    ["dashboard.widgets.feeHalfHour", fees.data.halfHourFee],
    ["dashboard.widgets.feeHour", fees.data.hourFee],
    ["dashboard.widgets.feeEconomy", fees.data.economyFee],
  ];

  return (
    <div className="flex h-full flex-col gap-2">
      <div>
        <StatValue className="text-accent">
          {fees.data.halfHourFee} <span className="text-sm font-normal">sat/vB</span>
        </StatValue>
        <StatLabel>{t("dashboard.widgets.feeHalfHour")}</StatLabel>
        {/* What one would actually do at this rate — consolidate while blocks
            are cheap, wait while they are not (§5.1). */}
        {eggs && (
          <p className="mt-1 text-xs leading-snug text-muted">
            {t(`dashboard.widgets.feeMood.${feeMood(fees.data.halfHourFee)}`)}
          </p>
        )}
      </div>
      <table className="mt-auto w-full text-xs">
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key} className="border-b border-border-c/30 last:border-0">
              <td className="py-1 text-muted">{t(key)}</td>
              <td className="py-1 text-right font-mono whitespace-nowrap">
                {value} sat/vB
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HALVING_INTERVAL = 210_000;
/** Target block time, used for the (necessarily rough) date estimate. */
const MINUTES_PER_BLOCK = 10;

/** Widget 9: block height, blocks to go and estimated days to the next halving. */
export function HalvingWidget() {
  const { t, loc, explorerSettings } = useDashboardData();
  const tip = useBlockHeight(explorerSettings);
  const now = useNow();

  if (tip.loading) return <WidgetSkeleton lines={3} />;
  if (tip.error || tip.data === null) {
    return (
      <WidgetError
        message={t("dashboard.widgets.explorerUnavailable", {
          endpoint: explorerBase(explorerSettings) || "—",
        })}
        onRetry={tip.reload}
        retryLabel={t("common.refresh")}
      />
    );
  }

  const height = tip.data;
  const epoch = Math.floor(height / HALVING_INTERVAL);
  const target = (epoch + 1) * HALVING_INTERVAL;
  const remaining = target - height;
  const days = (remaining * MINUTES_PER_BLOCK) / 60 / 24;
  const estimated = new Date(now + days * 86_400_000);
  const progress = (height % HALVING_INTERVAL) / HALVING_INTERVAL;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue>
          {t("dashboard.widgets.daysValue", { days: Math.round(days) })}
        </StatValue>
        <StatLabel>
          {t("dashboard.widgets.untilHalving")} · ≈ {formatDate(estimated, loc)}
        </StatLabel>
      </div>
      <Meter value={progress} />
      <dl className="mt-auto space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.blockHeight")}</dt>
          <dd className="font-mono">{formatInt(height, loc)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.blocksToGo")}</dt>
          <dd className="font-mono">{formatInt(remaining, loc)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.halvingBlock")}</dt>
          <dd className="font-mono">{formatInt(target, loc)}</dd>
        </div>
      </dl>
      <p className="text-[0.65rem] leading-relaxed text-muted">
        {t("dashboard.widgets.halvingEstimateHint")}
      </p>
    </div>
  );
}
