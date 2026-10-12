// The app's navigation, in one place.
//
// What the header offers, in which order, under which condition and with
// which counter is declared here and nowhere else: the header, the mobile
// menu and the start screen all render these lists. Adding, moving or hiding
// an entry is an edit to this file, not a hunt through markup.
//
// The app has no URL per view — it is one page that switches views in place
// (a static export with an encrypted file in memory has nothing a URL could
// usefully point at). A `view` here is that in-place destination.

import { countIssues } from "./dataQuality";
import type { LedgerEntry } from "./types";

/** Every place the main area can show. */
export type ViewId =
  | "dashboard"
  | "transactions"
  | "wallets"
  | "walletDetail"
  | "tax"
  | "pointInTime"
  | "milestones"
  | "yearInReview"
  | "dca"
  | "settings";

/** The tabs inside "Wallets & accounts". */
export type WalletsTab = "overview" | "addresses";

/** What the entries' conditions and counters are evaluated against. */
export interface NavContext {
  /** A portfolio file is open. */
  hasFile: boolean;
  /** The tax features are compiled in (lib/features.ts). */
  taxEnabled: boolean;
  /** Open ledger items: unlinked transfers and transactions without a EUR value. */
  openItems: number;
  /** A backup is due (the same rule as the dashboard's reminder). */
  backupDue: boolean;
}

export type NavIconId = "settings" | "help";

/**
 * A counter or a marker beside an entry. Only ever produced when there is
 * something to say: no entry carries a permanent zero.
 */
export type NavBadge =
  | { kind: "count"; value: number; labelKey: string }
  | { kind: "dot"; labelKey: string };

interface NavBase {
  id: string;
  /** i18n key of the label (also the accessible name of an icon entry). */
  labelKey: string;
  icon?: NavIconId;
  /** Shown only when this holds; absent means always. Hidden, never greyed out. */
  visible?: (ctx: NavContext) => boolean;
  badge?: (ctx: NavContext) => NavBadge | null;
}

/** Goes to a view. */
export interface NavViewEntry extends NavBase {
  kind: "view";
  view: ViewId;
  /**
   * Further views that count as being "in" this entry — sub-pages reached
   * from it — so the entry stays highlighted there.
   */
  alsoActiveFor?: ViewId[];
}

/** Does something instead of going somewhere (the help opens as a panel). */
export interface NavActionEntry extends NavBase {
  kind: "action";
  action: "help";
}

/**
 * Several views under one label. Not used yet: it is what "Savings plan"
 * becomes once the sale simulator and the point-in-time view join it under
 * "Tools" — replace the `dca` entry below with
 *
 *   { kind: "group", id: "tools", labelKey: "nav.tools",
 *     children: [dcaEntry, saleSimulatorEntry, pointInTimeEntry] }
 *
 * and the header and the mobile menu render it as a menu without any change.
 */
export interface NavGroupEntry extends NavBase {
  kind: "group";
  children: NavViewEntry[];
}

export type NavEntry = NavViewEntry | NavActionEntry | NavGroupEntry;

const withFile = (ctx: NavContext) => ctx.hasFile;

/** The main navigation, in display order. */
export const MAIN_NAV: NavEntry[] = [
  { kind: "view", id: "dashboard", labelKey: "nav.dashboard", view: "dashboard", visible: withFile },
  {
    kind: "view",
    id: "transactions",
    labelKey: "nav.transactions",
    view: "transactions",
    visible: withFile,
    badge: (ctx) =>
      ctx.openItems > 0
        ? { kind: "count", value: ctx.openItems, labelKey: "nav.openItems" }
        : null,
  },
  {
    kind: "view",
    id: "wallets",
    labelKey: "wallets.title",
    view: "wallets",
    alsoActiveFor: ["walletDetail"],
    visible: withFile,
  },
  {
    kind: "view",
    id: "tax",
    labelKey: "nav.tax",
    view: "tax",
    alsoActiveFor: ["pointInTime"],
    visible: (ctx) => ctx.hasFile && ctx.taxEnabled,
  },
  // Needs no file: it calculates with public prices only.
  { kind: "view", id: "dca", labelKey: "nav.dca", view: "dca" },
];

/** The icon row at the right of the header. */
export const UTILITY_NAV: NavEntry[] = [
  {
    kind: "view",
    id: "settings",
    labelKey: "nav.settings",
    icon: "settings",
    view: "settings",
    // Milestones are reached from the settings (and from their widget); the
    // year in review from the milestones.
    alsoActiveFor: ["milestones", "yearInReview"],
    badge: (ctx) => (ctx.hasFile && ctx.backupDue ? { kind: "dot", labelKey: "nav.backupDue" } : null),
  },
  { kind: "action", id: "help", labelKey: "help.title", icon: "help", action: "help" },
];

/** The entries to show, with hidden ones (and groups left empty) removed. */
export function visibleNav(entries: NavEntry[], ctx: NavContext): NavEntry[] {
  const out: NavEntry[] = [];
  for (const entry of entries) {
    if (entry.visible && !entry.visible(ctx)) continue;
    if (entry.kind === "group") {
      const children = entry.children.filter((c) => !c.visible || c.visible(ctx));
      if (children.length > 0) out.push({ ...entry, children });
    } else {
      out.push(entry);
    }
  }
  return out;
}

/**
 * Whether the entry is the one the user is in, sub-pages included. `null` is
 * a place no entry stands for (the start screen).
 */
export function isActive(entry: NavEntry, view: ViewId | null): boolean {
  if (view === null) return false;
  switch (entry.kind) {
    case "view":
      return entry.view === view || (entry.alsoActiveFor?.includes(view) ?? false);
    case "group":
      return entry.children.some((c) => isActive(c, view));
    case "action":
      return false;
  }
}

export function badgeOf(entry: NavEntry, ctx: NavContext): NavBadge | null {
  const own = entry.badge?.(ctx) ?? null;
  if (own || entry.kind !== "group") return own;
  // A group shows the sum of its children's counters, or a dot for markers.
  let count = 0;
  let dot: NavBadge | null = null;
  for (const child of entry.children) {
    const b = child.badge?.(ctx);
    if (b?.kind === "count") count += b.value;
    else if (b?.kind === "dot") dot = b;
  }
  if (count > 0) return { kind: "count", value: count, labelKey: "nav.openItems" };
  return dot;
}

/**
 * Open ledger items for the transactions counter: transfers without their
 * counterpart and transactions without a EUR value — the two gaps the user
 * fixes in the transaction table.
 */
export function openItemCount(entries: LedgerEntry[]): number {
  const counts = countIssues(entries);
  return counts.unlinkedTransfer + counts.missingEurValue;
}
