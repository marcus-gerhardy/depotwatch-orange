// The milestone icons (CLAUDE.md §5.2).
//
// One drawn icon per catalogue entry, and drawn for the same reason the laser
// eyes are (§5.1): an emoji at 20 px is a handful of pixels whose look is
// decided by the platform's emoji font, not by the theme — Windows, macOS and
// a Linux desktop each render a different picture, and none of them takes the
// accent colour. A line icon is the same drawing everywhere, inherits
// `currentColor`, and sits at the same optical weight as the rest of the UI.
//
// All of them share one geometry, which is what makes a column of them read as
// a set: a 24×24 box, no fill, `currentColor` at stroke width 1.6, round caps
// and joins. Anything that needs a solid dot uses a filled circle of the same
// colour — the only exception, and the same one the transaction table's type
// glyphs make.
//
// The set is complete by test (`MilestoneIcon.test.tsx`): every entry in
// MILESTONES has a drawing here, so a new milestone cannot ship with a blank
// space where its icon belongs.

import type { ReactNode } from "react";
import {
  BRICKS,
  CALENDAR,
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
  iconDot as dot,
} from "./icons";

/**
 * The drawings, keyed by milestone id. Each one keeps the motif its entry has
 * always had, so the catalogue reads the same as before — only drawn.
 */
const DRAWINGS: Record<string, ReactNode> = {
  // ------------------------------------------------------------- stacking
  // A sprout: the first transaction.
  firstTransaction: (
    <>
      <path d="M12 21v-7" />
      <path d="M12 14.5C9 14.5 7 12.5 7 9.5c3 0 5 2 5 5Z" />
      <path d="M12 13.5c0-3 2-5 5-5 0 3-2 5-5 5Z" />
    </>
  ),
  // A cube of ice: the first block of the stack.
  sats100k: (
    <>
      <path d="M12 3 4.5 7.25 12 11.5l7.5-4.25L12 3Z" />
      <path d="M4.5 7.25v9.5L12 21l7.5-4.25v-9.5" />
      <path d="M12 11.5V21" />
    </>
  ),
  // A brick wall: a million sats is masonry, not a single stone.
  sats1m: BRICKS,
  // A stack of coins: a tenth, and the pile is growing.
  btc010: COIN_STACK,
  // A target: one percent of twenty-one.
  btc021: TARGET,
  // A crown: the whole coin.
  btc1: (
    <>
      <path d="M4 17 3 6.5l5 3.5L12 4l4 6 5-3.5L20 17Z" />
      <path d="M3.8 20.5h16.4" />
    </>
  ),
  // A temple: ten percent of twenty-one, and a holding that stands.
  btc21: (
    <>
      <path d="M2.5 9 12 3.5 21.5 9" />
      <path d="M5.5 9v8M12 9v8M18.5 9v8" />
      <path d="M3 17h18M2 20.5h20" />
    </>
  ),

  // ---------------------------------------------------------- sovereignty
  // A key: the first withdrawal into one's own custody.
  firstWithdrawal: (
    <>
      <circle cx="8" cy="16" r="3.8" />
      <path d="M10.7 13.3 20 4" />
      <path d="M16.5 7.5l2.2 2.2M14.2 9.8l2.2 2.2" />
    </>
  ),
  // A shield, split down the middle: half the holding is one's own.
  selfCustody50: (
    <>
      {SHIELD}
      <path d="M12 3.4v17.3" />
    </>
  ),
  // A keep with battlements: nothing left on an exchange.
  selfCustody100: (
    <>
      <path d="M3 21V8h3V5.5h3V8h3V5.5h3V8h3v13Z" />
      <path d="M10 21v-4.5a2 2 0 0 1 4 0V21" />
    </>
  ),
  // An eye: the watchlist watches, it never touches the ledger.
  firstWatchedAddress: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // A leaf: taproot.
  taprootAddress: (
    <>
      <path d="M5 19c-1-8 4-14 14-14 1 9-5 14-14 14Z" />
      <path d="M5 19 16 8" />
    </>
  ),
  // A bolt: the second layer.
  lightningWallet: <path d="M13 2.5 4.5 14H10l-1 7.5L19.5 10H14l-1-7.5Z" />,

  // -------------------------------------------------------------- patience
  // An hourglass: the first lot past the holding period.
  firstTaxFreeLot: HOURGLASS,
  // A stopwatch: a hundred days counted out.
  days100: STOPWATCH,
  // A calendar with a day marked: a full year.
  year1: CALENDAR,
  // The step itself: two blocks, the second half the first. Held across it.
  throughHalving: HALVING_BLOCKS,
  // A cycle: four years, one turn of the wheel.
  years4: CYCLE,

  // ------------------------------------------------------------- diligence
  // A floppy disk: the file was written to disk.
  firstBackup: (
    <>
      <path d="M4.5 4.5h10.6l4.4 4.4V19.5H4.5Z" />
      <path d="M8.5 4.5v4.5h6V4.5" />
      <path d="M7.5 19.5v-6h9v6" />
    </>
  ),
  // A padlock: the file is encrypted.
  encrypted: PADLOCK,
  // Two links: every transfer paired with its counterpart.
  allTransfersLinked: (
    <>
      <path d="M10.2 13.8a4.5 4.5 0 0 0 6.4 0l2.6-2.6a4.5 4.5 0 1 0-6.4-6.4l-1.3 1.3" />
      <path d="M13.8 10.2a4.5 4.5 0 0 0-6.4 0l-2.6 2.6a4.5 4.5 0 1 0 6.4 6.4l1.3-1.3" />
    </>
  ),
  // A receipt: every transfer has its txid.
  allTxidsRecorded: RECEIPT,
  // An outbox: a report left the app.
  taxExported: (
    <>
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M12 15.5V4M8 7.5 12 4l4 3.5" />
    </>
  ),
  // A check: a tax year the engine could account for completely.
  taxYearClosed: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7.8 12.2 10.8 15.2 16.2 9" />
    </>
  ),

  // --------------------------------------------------------------- culture
  // A document with a folded corner: the whitepaper.
  whitepaperOpened: (
    <>
      <path d="M6.5 21V3H14l5 5.2V21Z" />
      <path d="M13.8 3.2V8.5h5.1" />
      <path d="M9.5 12.5h7M9.5 16h7" />
    </>
  ),
  // Several inputs becoming one: a consolidation, as the ledger sees it.
  firstConsolidation: (
    <>
      <path d="M3 6h4c2 0 3 1.5 4.5 3M3 12h8.5M3 18h4c2 0 3-1.5 4.5-3" />
      <path d="M11.5 12H20M16.5 8.5 20 12l-3.5 3.5" />
    </>
  ),
  // A pickaxe: the miners' day, and a buy made on it. The head crosses the
  // handle at its middle, which is what stops it reading as an umbrella.
  boughtOnHalvingDay: (
    <>
      <path d="M10.5 6.5c5 0 9 4 9 9" />
      <path d="M6 20 18 8" />
      <path d="M4.5 21.5 7 19" />
    </>
  ),
  // A slice: 22 May.
  boughtOnPizzaDay: (
    <>
      <path d="M12 3 20.5 19.5c-5.5 2.5-11.5 2.5-17 0L12 3Z" />
      <path d="M6.2 16.2c3.8 1.7 7.8 1.7 11.6 0" />
      {dot(12, 11.5, 1.1)}
      {dot(9.2, 15.6, 1)}
      {dot(14.8, 15.6, 1)}
    </>
  ),
};

/** Which ids this module can draw — what the completeness test reads. */
export const MILESTONE_ICON_IDS = new Set(Object.keys(DRAWINGS));

/**
 * The icon of one milestone. Decoration next to a title that already says
 * what it is, so it is `aria-hidden` and carries no label of its own.
 */
export default function MilestoneIcon({
  id,
  className = "h-5 w-5",
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
