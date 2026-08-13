"use client";

// Widgets over the address watchlist: the UTXO picture and the open security
// findings.
//
// Both read one shared scan (lib/watchlistScan.ts) — cached per address,
// walked one address at a time, and only ever against the explorer configured
// in the settings (§3.3). Watch-only and strictly separate from the ledger
// (§3.1): nothing here derives an address from a transaction or the other way
// round.

import { useMemo } from "react";
import { formatInt } from "@/lib/decimal";
import { useAppStore } from "@/lib/store";
import { explorerBase } from "@/lib/esplora";
import { SATS_PER_BTC } from "@/lib/displayUnit";
import {
  summarizeSecurity,
  summarizeUtxos,
  useWatchlistScan,
} from "@/lib/watchlistScan";
import { Amount, Button } from "../ui";
import { useDashboardData } from "./context";
import { CheckIcon, WarnIcon } from "../icons";
import {
  StatLabel,
  StatValue,
  WidgetEmpty,
  WidgetError,
  WidgetSkeleton,
} from "./WidgetFrame";

/** Shared shell: empty watchlist, loading, explorer unreachable. */
function useScan() {
  const { explorerSettings } = useDashboardData();
  const watched = useAppStore((s) => s.portfolio?.watchedAddresses) ?? [];
  return { scan: useWatchlistScan(explorerSettings, watched), watched, explorerSettings };
}

/**
 * How the watched coins are cut up: how many UTXOs, how many of them are dust
 * (spending them would cost more in fees than they hold, at the current rate)
 * and what folding the small ones together would cost.
 */
export function UtxoOverviewWidget() {
  const { t, loc, fmtDisplay, priceEur, openWatchlist } = useDashboardData();
  const { scan, watched, explorerSettings } = useScan();

  const summary = useMemo(
    () => (scan.data ? summarizeUtxos(scan.data) : null),
    [scan.data],
  );

  if (watched.length === 0) {
    // Nothing to scan yet, and the tile knows exactly what is missing — so it
    // offers the step instead of only naming the gap.
    return (
      <WidgetEmpty
        message={t("dashboard.widgets.watchlistEmpty")}
        action={{ label: t("watchlist.add"), onClick: () => openWatchlist({ add: true }) }}
      />
    );
  }
  if (scan.loading) return <WidgetSkeleton lines={4} />;
  if (scan.error || !summary) {
    return (
      <WidgetError
        message={t("dashboard.widgets.explorerUnavailable", {
          endpoint: explorerBase(explorerSettings) || "—",
        })}
        onRetry={scan.reload}
        retryLabel={t("common.refresh")}
      />
    );
  }

  const eurOf = (sats: number) =>
    priceEur === null ? "—" : fmtDisplay((sats / SATS_PER_BTC) * priceEur);

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <StatValue>{formatInt(summary.utxoCount, loc)}</StatValue>
        <StatLabel>
          {t("dashboard.widgets.utxoCountLabel", { addresses: summary.addressCount })}
        </StatLabel>
      </div>

      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.utxoTotal")}</dt>
          <dd className="font-mono">
            <Amount>{eurOf(summary.totalSats)}</Amount>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className={summary.dustCount > 0 ? "text-warning" : "text-muted"}>
            {t("dashboard.widgets.utxoDust")}
          </dt>
          <dd
            className={`font-mono ${summary.dustCount > 0 ? "text-warning" : ""}`}
          >
            {formatInt(summary.dustCount, loc)}
            {summary.dustCount > 0 && (
              <span className="ml-1 text-muted">
                <Amount>({eurOf(summary.dustSats)})</Amount>
              </span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t("dashboard.widgets.utxoConsolidatable")}</dt>
          <dd className="font-mono">{formatInt(summary.consolidatableCount, loc)}</dd>
        </div>
        {summary.consolidationCostSats > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("dashboard.widgets.utxoConsolidationCost")}</dt>
            <dd className="font-mono">
              {formatInt(summary.consolidationCostSats, loc)} sats
              <span className="ml-1 text-muted">
                <Amount>({eurOf(summary.consolidationCostSats)})</Amount>
              </span>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-auto space-y-2">
        {summary.consolidatableCount > 1 && (
          <p
            className={`text-[0.65rem] leading-relaxed ${
              summary.feeIsLow ? "text-gain" : "text-muted"
            }`}
          >
            {summary.feeIsLow
              ? t("dashboard.widgets.utxoConsolidateNow", {
                  count: summary.consolidatableCount,
                })
              : t("dashboard.widgets.utxoConsolidateWait")}
          </p>
        )}
        <Button variant="ghost" onClick={openWatchlist} className="px-2 py-0.5 text-xs">
          {t("dashboard.widgets.toWatchlist")} →
        </Button>
      </div>
    </div>
  );
}

/** Findings ranked by how loudly they need saying. */
const SEVERITY_CLASS: Record<string, string> = {
  danger: "text-loss",
  warning: "text-warning",
  info: "text-muted",
};

/**
 * Open security findings across the watchlist: address reuse, suspected
 * poisoning, exposed public keys and the rest of §6.1, counted per kind.
 * Clicking goes to the watchlist, where each address has its own analysis.
 */
export function WatchlistStatusWidget() {
  const { t, loc, openWatchlist } = useDashboardData();
  const { scan, watched, explorerSettings } = useScan();

  const summary = useMemo(
    () => (scan.data ? summarizeSecurity(scan.data) : null),
    [scan.data],
  );
  const skipped = scan.data?.skipped ?? 0;

  if (watched.length === 0) {
    // Nothing to scan yet, and the tile knows exactly what is missing — so it
    // offers the step instead of only naming the gap.
    return (
      <WidgetEmpty
        message={t("dashboard.widgets.watchlistEmpty")}
        action={{ label: t("watchlist.add"), onClick: () => openWatchlist({ add: true }) }}
      />
    );
  }
  if (scan.loading) return <WidgetSkeleton lines={4} />;
  if (scan.error || !summary) {
    return (
      <WidgetError
        message={t("dashboard.widgets.explorerUnavailable", {
          endpoint: explorerBase(explorerSettings) || "—",
        })}
        onRetry={scan.reload}
        retryLabel={t("common.refresh")}
      />
    );
  }

  const serious = summary.danger + summary.warning;

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        {/* The count is the metric; colour only reinforces it, and the symbol
            carries the same message without it. */}
        <StatValue className={serious > 0 ? "text-warning" : "text-gain"}>
          {serious > 0 ? <WarnIcon /> : <CheckIcon />}{" "}
          {formatInt(serious, loc)}
        </StatValue>
        <StatLabel>
          {t("dashboard.widgets.watchlistFindings", {
            addresses: summary.addressCount,
          })}
        </StatLabel>
      </div>

      {summary.byKind.length === 0 ? (
        <p className="text-xs text-gain">{t("dashboard.widgets.watchlistClean")}</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {summary.byKind.map((f) => (
              <tr key={f.key} className="border-b border-border-c/30 last:border-0">
                {/* Short labels of their own: watchlist.findings.* are full
                    sentences meant for the address detail view. */}
                <td className={`py-1 ${SEVERITY_CLASS[f.severity] ?? ""}`}>
                  {t(`dashboard.widgets.finding.${f.key}`)}
                </td>
                <td className="py-1 text-right font-mono whitespace-nowrap">
                  {formatInt(f.count, loc)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-auto space-y-2">
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{t("dashboard.widgets.watchlistScore")}</dt>
            <dd className="font-mono">
              {summary.avgPrivacyScore === null
                ? "—"
                : `${Math.round(summary.avgPrivacyScore)} / 100`}
            </dd>
          </div>
          {skipped > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("dashboard.widgets.watchlistSkipped")}</dt>
              <dd className="font-mono text-muted">{formatInt(skipped, loc)}</dd>
            </div>
          )}
        </dl>
        <Button variant="ghost" onClick={openWatchlist} className="px-2 py-0.5 text-xs">
          {t("dashboard.widgets.toWatchlist")} →
        </Button>
      </div>
    </div>
  );
}
