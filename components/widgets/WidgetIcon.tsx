// One drawn icon per dashboard widget (CLAUDE.md §4.1).
//
// The same family as the milestone icons and for the same reasons (§5.2): an
// emoji at this size is a handful of pixels whose look belongs to the
// platform's emoji font rather than to the theme, it takes no accent colour,
// and a row of them reads as clip art rather than as one interface. The shared
// geometry and the motifs both sets use live in `components/icons.tsx`.
//
// Keyed by widget id, so the registry carries no icon of its own — a new widget
// is still one registry entry, plus its drawing here. A test asserts the two
// lists match, because a widget with no icon is a blank square in the picker.

import type { ReactNode } from "react";
import {
  BRICKS,
  COIN_STACK,
  CYCLE,
  HALVING_BLOCKS,
  HOURGLASS,
  LineIcon,
  PADLOCK,
  RECEIPT,
  SHIELD,
  STOPWATCH,
  TARGET,
  iconDot,
} from "../icons";

const DRAWINGS: Record<string, ReactNode> = {
  // What it is worth, and how that changed.
  portfolioValue: (
    <>
      <path d="M4 8.5V19a2 2 0 0 0 2 2h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 19 10H6a2 2 0 0 1 0-4h11v4" />
      {iconDot(17, 15, 1.2)}
    </>
  ),
  pnl: (
    <>
      <path d="M3 20h18" />
      <path d="M5 15.5 10 10l3.5 3.5L20 6" />
      <path d="M15.5 6H20v4.5" />
    </>
  ),
  btcPrice: (
    <>
      <path d="M12.6 3H20v7.4a2 2 0 0 1-.6 1.4l-7.6 7.6a2 2 0 0 1-2.8 0l-4.4-4.4a2 2 0 0 1 0-2.8l7.6-7.6A2 2 0 0 1 12.6 3Z" />
      {iconDot(16.2, 7.8, 1.3)}
    </>
  ),
  holdingPeriod: HOURGLASS,
  satsStack: BRICKS,
  avgCost: TARGET,
  custody: PADLOCK,

  // Curves and the market's context.
  priceEntries: (
    <>
      <path d="M7 3v3.5M7 17.5V21M17 3v4.5M17 18.5V21" />
      <rect x="4.5" y="6.5" width="5" height="11" rx="1" />
      <rect x="14.5" y="7.5" width="5" height="11" rx="1" />
    </>
  ),
  portfolioChart: (
    <>
      <path d="M3 20h18" />
      <path d="M3 16.5 8 11l4 3.5 3-4.5 3.5 5" />
      <path d="M3 20v-3.5" />
      {iconDot(8, 11, 1.1)}
      {iconDot(15, 10, 1.1)}
    </>
  ),
  stackHistory: (
    <>
      <path d="M3 20.5h18" />
      <rect x="4" y="13" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="11" rx="1" />
      <rect x="16" y="5" width="4" height="15" rx="1" />
    </>
  ),
  whatIf: (
    <>
      <path d="M3.5 8h17M3.5 16h17" />
      <circle cx="9" cy="8" r="2.4" />
      <circle cx="15.5" cy="16" r="2.4" />
    </>
  ),

  // Buying behaviour.
  buyHeatmap: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9h18" />
      {iconDot(7, 13, 1.3)}
      {iconDot(11.5, 13, 1.3)}
      {iconDot(16, 16.5, 1.3)}
      {iconDot(7, 16.5, 1.3)}
    </>
  ),
  dca: CYCLE,

  // What the ledger is made of.
  walletBreakdown: (
    <>
      <path d="M3 8.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M3 12h18" />
    </>
  ),
  holdingComposition: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V12l6.5 5.5" />
    </>
  ),
  feeBalance: RECEIPT,
  dataQuality: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.5h6v1" />
      <path d="M8.5 12.5 11 15l4.5-5" />
    </>
  ),

  // Tax.
  taxFreeProceeds: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.2 12.2 10.8 14.8 16 8.6" />
    </>
  ),
  exemptionLimit: (
    <>
      <path d="M12 4.5V21M8 21h8M12 6.5 4.5 9m7.5-2.5L19.5 9" />
      <path d="M1.8 15a2.7 2.7 0 0 0 5.4 0L4.5 9 1.8 15Z" />
      <path d="M16.8 15a2.7 2.7 0 0 0 5.4 0L19.5 9 16.8 15Z" />
      {iconDot(12, 4.2, 1.2)}
    </>
  ),

  // The watchlist, on chain.
  utxoOverview: COIN_STACK,
  watchlistStatus: SHIELD,
  blockClock: (
    <>
      <path d="M12 3 4 7.25v9.5L12 21l8-4.25v-9.5L12 3Z" />
      <path d="M12 11.5 4 7.25m8 4.25 8-4.25m-8 4.25V21" />
    </>
  ),

  // Ambient chain facts, and the record of what was decided.
  networkFees: (
    <>
      <path d="M4 18.5a9 9 0 1 1 16 0" />
      <path d="M12 18.5 16.5 11" />
      {iconDot(12, 18.5, 1.4)}
    </>
  ),
  halving: HALVING_BLOCKS,
  timeInMarket: STOPWATCH,
  milestones: (
    <>
      <path d="M6 21V3" />
      <path d="M6 4h11l-2.5 4L17 12H6" />
    </>
  ),
  // A report with a curve on it, not a calendar: the buy heatmap already is
  // one, and two calendars side by side in the picker say nothing apart.
  yearInReview: (
    <>
      <path d="M5.5 21V3H14l4.5 4.7V21Z" />
      <path d="M13.8 3.2V8h4.7" />
      <path d="M8.5 17.5 11 14l2 1.8 3-4.3" />
    </>
  ),
  // A flag on a rise: a target one is walking towards. Not a trophy and not a
  // podium — nothing here is a competition (§4.4).
  savingsGoal: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4.8h10.5l-2.2 3.2 2.2 3.2H6" />
      <path d="M3.5 21h7" />
    </>
  ),
};

/** Which ids this module can draw — what the completeness test reads. */
export const WIDGET_ICON_IDS = new Set(Object.keys(DRAWINGS));

/**
 * A widget's icon. Decoration beside a title that already names the widget, so
 * it is `aria-hidden` and carries no label of its own.
 */
export default function WidgetIcon({
  id,
  className = "h-4 w-4",
}: {
  id: string;
  className?: string;
}) {
  return (
    <LineIcon className={className}>
      {/* An id with no drawing gets the neutral marker rather than a hole. */}
      {DRAWINGS[id] ?? <circle cx="12" cy="12" r="8.5" />}
    </LineIcon>
  );
}
