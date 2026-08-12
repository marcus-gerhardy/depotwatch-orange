"use client";

// The year in review as a dashboard tile (CLAUDE.md §4.2).
//
// The last completed year in four figures, and a way into the full review. It
// is deliberately the *previous* year and never the running one: a review of a
// year that is still going would change every week, and a tile that quietly
// restates itself is worse than one that says something finished.
//
// Ledger only. It computes the review from what is already in the file and
// hands in an empty set of closes, so the tile never talks to anybody — the
// market comparison is the one figure that needs history, and it belongs on
// the page where it can be asked for on purpose.

import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { useNowDate } from "@/lib/clock";
import { formatFiat, formatInt, formatPercent } from "@/lib/decimal";
import { computeYearReview, latestReviewYear } from "@/lib/yearInReview";
import { Amount } from "../ui";
import { useDashboardData } from "./context";
import { StatLabel, StatValue, WidgetEmpty, WidgetSkeleton } from "./WidgetFrame";

/** An empty set of closes: this tile never fetches (see the note above). */
const NO_CLOSES = new Map<number, number>();

export function YearInReviewWidget() {
  const { t, loc, entries, fifo, fmtAmount, openYearInReview } = useDashboardData();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const now = useNowDate();

  const year = useMemo(
    () => (now === null ? null : latestReviewYear(entries, now)),
    [entries, now],
  );

  const review = useMemo(
    () =>
      year === null || now === null
        ? null
        : computeYearReview({
            year,
            entries,
            fifo,
            wallets: portfolio.wallets,
            milestones: portfolio.milestones ?? [],
            closeByDay: NO_CLOSES,
            now,
          }),
    [year, now, entries, fifo, portfolio.wallets, portfolio.milestones],
  );

  if (now === null) return <WidgetSkeleton />;
  // Nothing to look back on yet: the ledger has no year that is over.
  if (review === null) {
    return <WidgetEmpty message={t("dashboard.widgets.yearInReviewEmpty")} />;
  }

  const rows: { label: string; value: string; absolute?: boolean }[] = [
    {
      label: t("yearInReview.share.buys"),
      value: formatInt(review.stacked.buyCount, loc),
    },
    ...(review.avgPrice
      ? [
          {
            label: t("yearInReview.share.avgPrice"),
            value: formatFiat(review.avgPrice.yourAvgEur, "EUR", loc),
          },
        ]
      : []),
    {
      label: t("yearInReview.share.custody"),
      value: formatPercent(review.custody.shareAtYearEnd, loc).replace("+", ""),
    },
  ];

  return (
    <div className="flex h-full flex-col gap-2">
      <div>
        <StatValue>{fmtAmount(review.stacked.netBtc)}</StatValue>
        <StatLabel>
          {t("dashboard.widgets.yearInReviewStacked", { year: review.year })}
        </StatLabel>
      </div>

      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border-c/30 last:border-0">
              <td className="py-1 text-muted">{r.label}</td>
              <td className="py-1 text-right font-mono whitespace-nowrap">
                {r.absolute ? <Amount>{r.value}</Amount> : r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        type="button"
        onClick={() => openYearInReview(review.year)}
        className="mt-auto text-left text-[0.65rem] text-accent underline decoration-dotted"
      >
        {t("yearInReview.open")} →
      </button>
    </div>
  );
}
