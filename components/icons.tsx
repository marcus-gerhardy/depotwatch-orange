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
//
// The **inline marks** at the bottom are the third use: the warning triangle,
// the check, the ✕ on a close button. Those were literal characters scattered
// through the components, which is a worse problem than the emoji on the
// dashboard were — `⚠` and `⭳` have no guaranteed presentation, so depending on
// the platform's font fallback the same paragraph shows a line drawing, a
// colour emoji, or an empty box, and none of them takes the stroke weight of
// the icons beside it.
//
// **Where the line runs:** a glyph that acts as an *icon* is drawn here — a
// status badge, a button whose whole label it is, an affordance. A glyph that
// belongs to *running text or a numeric column* stays a character: the arrows
// between two accounts, the `▸` of a disclosure, and above all the ▲/▼/• of
// `PnlValue`, which exist so a direction survives without colour (§5) and have
// to sit on the baseline of the figure they belong to.

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

/** A key: one's own custody, and the moment the coins reached it. */
export const KEY: ReactNode = (
  <>
    <circle cx="8" cy="16" r="3.8" />
    <path d="M10.7 13.3 20 4" />
    <path d="M16.5 7.5l2.2 2.2M14.2 9.8l2.2 2.2" />
  </>
);

/** A slice: 22 May, wherever it is mentioned. */
export const PIZZA_SLICE: ReactNode = (
  <>
    <path d="M12 3 20.5 19.5c-5.5 2.5-11.5 2.5-17 0L12 3Z" />
    <path d="M6.2 16.2c3.8 1.7 7.8 1.7 11.6 0" />
    {iconDot(12, 11.5, 1.1)}
    {iconDot(9.2, 15.6, 1)}
    {iconDot(14.8, 15.6, 1)}
  </>
);

/** A tray with the arrow leaving it: something goes out of the app. */
export const OUTBOX: ReactNode = (
  <>
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    <path d="M12 15.5V4M8 7.5 12 4l4 3.5" />
  </>
);

/** The same tray with the arrow coming in: something enters the app. */
export const INBOX: ReactNode = (
  <>
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    <path d="M12 4v11.5M8 12l4 3.5 4-3.5" />
  </>
);

// ----------------------------------------------------------- inline marks
// Icons that sit *in* a line of text rather than beside a title. They are
// sized in `em` and shifted onto the baseline, so they follow the type they
// belong to — a badge in a 12 px hint and the same badge in a heading stay in
// proportion without either being given a size by hand.

/** The frame for a mark inside a line of text. */
export function InlineIcon({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      {...ICON_PROPS}
      aria-hidden
      className={`inline-block h-[1.15em] w-[1.15em] shrink-0 align-[-0.2em] ${className}`}
    >
      {children}
    </svg>
  );
}

/**
 * A warning. By far the most repeated mark in the app, and the one that most
 * needs to be a drawing: `⚠` is the character with the widest spread of
 * presentations, from a thin outline to a yellow emoji that ignores the
 * `text-warning` colour it was given.
 */
export function WarnIcon({ className = "" }: { className?: string }) {
  return (
    <InlineIcon className={className}>
      <path d="M12 3.6 21.4 19.8H2.6L12 3.6Z" />
      <path d="M12 9.6v4.3" />
      {iconDot(12, 17.1, 1.1)}
    </InlineIcon>
  );
}

/** Done, complete, verified. */
export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <InlineIcon className={className}>
      <path d="M4.5 12.6 9.6 17.7 19.5 6.5" />
    </InlineIcon>
  );
}

/** Close, remove, discard — always the label of a button, never a status. */
export function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <InlineIcon className={className}>
      <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" />
    </InlineIcon>
  );
}

/** The mobile navigation. */
export function MenuIcon({ className = "" }: { className?: string }) {
  return (
    <InlineIcon className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </InlineIcon>
  );
}

/**
 * Edit. A pencil, not the gear this used to be: a gear is settings, and the
 * button it sits on rearranges the dashboard.
 */
export function EditIcon({ className = "" }: { className?: string }) {
  return (
    <InlineIcon className={className}>
      <path d="M4.5 19.5v-3.4L16.2 4.5a1.9 1.9 0 0 1 2.7 0l1.1 1.1a1.9 1.9 0 0 1 0 2.7L8.4 19.5H4.5Z" />
      <path d="M14.9 5.8 18.9 9.8" />
    </InlineIcon>
  );
}

/** Export: something leaves the app as a file. */
export function DownloadIcon({ className = "" }: { className?: string }) {
  return <InlineIcon className={className}>{INBOX}</InlineIcon>;
}

/** Import: a file comes in. */
export function UploadIcon({ className = "" }: { className?: string }) {
  return <InlineIcon className={className}>{OUTBOX}</InlineIcon>;
}

/** Looking, not touching: the read-only mode (§6.7). */
export function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <InlineIcon className={className}>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </InlineIcon>
  );
}

/** The file is encrypted, or the preset cannot be changed. */
export function LockIcon({ className = "" }: { className?: string }) {
  return <InlineIcon className={className}>{PADLOCK}</InlineIcon>;
}

/** The file is not encrypted: the same lock with its shackle swung open. */
export function UnlockIcon({ className = "" }: { className?: string }) {
  return (
    <InlineIcon className={className}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 7.6-1.7" />
      {iconDot(12, 15.5, 1.3)}
    </InlineIcon>
  );
}

/** The demo portfolio: a specimen to try things on, not somebody's money. */
export function FlaskIcon({ className = "" }: { className?: string }) {
  return (
    <InlineIcon className={className}>
      <path d="M9.5 3h5" />
      <path d="M10.4 3.2v6.3L4.9 18a2 2 0 0 0 1.7 3h10.8a2 2 0 0 0 1.7-3l-5.5-8.5V3.2" />
      <path d="M7.4 14.5h9.2" />
    </InlineIcon>
  );
}

/** Custody in one's own hands. */
export function KeyIcon({ className = "" }: { className?: string }) {
  return <InlineIcon className={className}>{KEY}</InlineIcon>;
}

/** 22 May (§5.1). */
export function PizzaIcon({ className = "" }: { className?: string }) {
  return <InlineIcon className={className}>{PIZZA_SLICE}</InlineIcon>;
}

/** Something was reached — the counterpart of the warning, not a rating. */
export function StarIcon({ className = "" }: { className?: string }) {
  return (
    <InlineIcon className={className}>
      <path d="M12 3.5l2.7 5.7 6.3.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 10.1l6.3-.9L12 3.5Z" />
    </InlineIcon>
  );
}

/** The best candidate in a list of them. */
export function TargetIcon({ className = "" }: { className?: string }) {
  return <InlineIcon className={className}>{TARGET}</InlineIcon>;
}
