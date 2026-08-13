// The shared geometry behind every drawn icon in the app (CLAUDE.md §5).
//
// Two sets use it — the milestones (§5.2) and the dashboard widgets (§4.1) —
// and they have to look like one family, because they appear on the same
// screens. So the geometry lives here rather than being repeated: a 24×24 box,
// no fill, `currentColor` at stroke width 1.6, round caps and joins. Anything
// needing a solid dot uses `iconDot`, which is the one place a fill is allowed.
//
// The **motifs that mean the same thing in both sets** live here too. An
// hourglass is the holding period whether it sits on a milestone or on a
// widget, and two copies of it would drift the first time one is touched.

import type { ReactNode } from "react";

export const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** A solid dot — targets, keyholes, calendar days. The only filled shape. */
export const iconDot = (cx: number, cy: number, r = 1.2): ReactNode => (
  <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

/** The frame every icon is drawn in. */
export function LineIcon({
  children,
  className = "h-5 w-5",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg {...ICON_PROPS} aria-hidden className={className}>
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------- motifs
// Shared between the two sets, because they say the same thing in both.

/** Time passing: the holding period, and how long one has been in the market. */
export const HOURGLASS: ReactNode = (
  <>
    <path d="M6 3h12M6 21h12" />
    <path d="M7.5 3v3c0 2.5 4.5 3.8 4.5 6s-4.5 3.5-4.5 6v3" />
    <path d="M16.5 3v3c0 2.5-4.5 3.8-4.5 6s4.5 3.5 4.5 6v3" />
  </>
);

/** Masonry: a stack that was built rather than bought in one go. */
export const BRICKS: ReactNode = (
  <>
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <path d="M3 10h18M3 14h18M12 6v4M8 10v4M16 10v4M12 14v4" />
  </>
);

/** A target: the average price aimed at, and the 0.21 mark. */
export const TARGET: ReactNode = (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    {iconDot(12, 12, 1.4)}
  </>
);

/** A padlock: custody, and an encrypted file. */
export const PADLOCK: ReactNode = (
  <>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    {iconDot(12, 15.5, 1.3)}
  </>
);

/** A calendar: a year, and the days it is made of. */
export const CALENDAR: ReactNode = (
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
    {iconDot(8, 14.5, 1.1)}
    {iconDot(12, 14.5, 1.1)}
    {iconDot(16, 14.5, 1.1)}
    {iconDot(8, 18, 1.1)}
  </>
);

/** A receipt: what was paid in fees, and what was recorded about it. */
export const RECEIPT: ReactNode = (
  <>
    <path d="M6 21V3h12v18l-2.4-1.7-2.4 1.7-2.4-1.7-2.4 1.7L6 19.3Z" />
    <path d="M9 8h6M9 12h6" />
  </>
);

/** A stack of coins: what is actually held, in one place or in outputs. */
export const COIN_STACK: ReactNode = (
  <>
    <ellipse cx="12" cy="6.5" rx="7" ry="3" />
    <path d="M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11" />
    <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
  </>
);

/** A shield: what is watched, and what is in one's own custody. */
export const SHIELD: ReactNode = (
  <path d="M12 3 20 6v6c0 4.2-3.2 7.4-8 9-4.8-1.6-8-4.8-8-9V6l8-3Z" />
);

/** A stopwatch: elapsed time that was measured on purpose. */
export const STOPWATCH: ReactNode = (
  <>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M9.5 3h5M12 3v3M18.8 6.6l1.5-1.5" />
    <path d="M12 13.5V9.5" />
  </>
);

/** Two blocks, the second half the first: the halving. */
export const HALVING_BLOCKS: ReactNode = (
  <>
    <rect x="3.5" y="5" width="7.5" height="14" rx="1" />
    <rect x="13" y="12" width="7.5" height="7" rx="1" />
    <path d="M2 21.5h20" />
  </>
);

/** A cycle: doing the same thing again, on purpose. */
export const CYCLE: ReactNode = (
  <>
    <path d="M5.2 9.4A7.5 7.5 0 0 1 18.6 7.6" />
    <path d="M18.8 14.6A7.5 7.5 0 0 1 5.4 16.4" />
    <path d="M18.9 3.6v4h-4M5.1 20.4v-4h4" />
  </>
);
