// Milestones (CLAUDE.md §5.2).
//
// One rule decides what may be in this catalogue: a milestone rewards a
// **decision the user made**, never what the market did. Nothing here is
// awarded for the price going up, because that is not an achievement — it is
// weather. There are no streaks either: a streak turns a tool one opens when
// there is something to record into one that punishes you for not opening it,
// and this file is somebody's money, not a game. And nothing compares one user
// to another, because the app has never seen another user and never will.
//
// Everything below is a pure function over a snapshot of the portfolio. That
// makes the catalogue testable without a browser, and it is what lets the app
// work out *when* a milestone was reached when it meets a file that already
// has years of history in it (see `achievedAtOf`).

import { Decimal, dec, ZERO } from "./decimal";
import { SATS_PER_BTC } from "./displayUnit";
import { isLotTaxFree, type FifoResult } from "./fifo";
import { dailyBalanceSeries, totalBalance } from "./portfolio";
import { hasIssue, issueContext } from "./dataQuality";
import type { LedgerEntry, PortfolioFile, WalletType } from "./types";

export type MilestoneCategory =
  | "stacking"
  | "sovereignty"
  | "patience"
  | "diligence"
  | "culture";

export const MILESTONE_CATEGORIES: MilestoneCategory[] = [
  "stacking",
  "sovereignty",
  "patience",
  "diligence",
  "culture",
];

/** One reached milestone, as the portfolio file stores it. */
export interface MilestoneRecord {
  id: string;
  /** When it was reached — derived from the ledger where that is possible. */
  achievedAt: string;
  /** Whether its notification has been shown. */
  acknowledged: boolean;
}

/**
 * The snapshot every predicate reads. Built once per evaluation, so a run over
 * the whole catalogue costs one flatten and one FIFO pass rather than one per
 * entry.
 */
export interface MilestoneContext {
  portfolio: PortfolioFile;
  entries: LedgerEntry[];
  fifo: FifoResult;
  balanceBtc: Decimal;
  now: Date;
  /**
   * Facts the file cannot carry about itself: whether it is encrypted, and
   * whether it has ever been written to disk. Both are runtime state of the
   * store, and both are decisions the user made.
   */
  encrypted: boolean;
  savedOnce: boolean;
}

export interface MilestoneProgress {
  current: number;
  target: number;
  /** "sats" | "btc" | "percent" | "days" — how the overview formats it. */
  unit: "sats" | "btc" | "percent" | "days";
}

/**
 * One entry of the catalogue. What it *looks* like is not in here: the icons
 * are drawings and live in `components/MilestoneIcon.tsx`, keyed by id, so this
 * module stays free of JSX and testable without a DOM. A test there asserts
 * every id below has one.
 */
export interface MilestoneDefinition {
  id: string;
  category: MilestoneCategory;
  /**
   * Whether the portfolio can decide this on its own. Event milestones (the
   * whitepaper was opened, a tax report was exported) are recorded when they
   * happen, because nothing in the file remembers them afterwards.
   */
  event?: boolean;
  /** Reached? Absent for event milestones. */
  reached?: (ctx: MilestoneContext) => boolean;
  /**
   * When it was reached, derived from the data rather than from the clock.
   * Returns null when the data cannot say, and the caller falls back to now.
   * This is what stops a file with five years of history from claiming every
   * milestone happened the afternoon it was first opened.
   */
  achievedAt?: (ctx: MilestoneContext) => string | null;
  /** Quantitative milestones show how far along they are. */
  progress?: (ctx: MilestoneContext) => MilestoneProgress;
}

const DAY = 86_400_000;
const SELF_CUSTODY: WalletType[] = ["hardware", "software", "paper"];

/**
 * The four halvings that have happened. Only past ones are used: a milestone
 * for "held through a halving" must not rest on an estimate, and the next date
 * is one until the block arrives.
 */
export const HALVING_DATES = [
  "2012-11-28",
  "2016-07-09",
  "2020-05-11",
  "2024-04-20",
] as const;

const localDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isoDay = (ms: number) => new Date(ms).toISOString();

/** Transactions in ledger order, oldest first — the basis for every date. */
function sorted(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

function firstBuy(ctx: MilestoneContext): LedgerEntry | null {
  return sorted(ctx.entries).find((e) => e.type === "buy") ?? null;
}

/** The day the holding first reached `sats`, from the daily balance series. */
function dayHoldingReached(ctx: MilestoneContext, sats: number): string | null {
  const target = dec(sats).div(SATS_PER_BTC);
  for (const point of dailyBalanceSeries(ctx.entries)) {
    if (point.btc.gte(target)) return isoDay(point.time);
  }
  return null;
}

function holdingSats(ctx: MilestoneContext): number {
  return ctx.balanceBtc.mul(SATS_PER_BTC).toNumber();
}

/** A milestone for "the holding reached N sats". */
function stackMilestone(id: string, sats: number): MilestoneDefinition {
  return {
    id,
    category: "stacking",
    reached: (ctx) => ctx.balanceBtc.mul(SATS_PER_BTC).gte(sats),
    achievedAt: (ctx) => dayHoldingReached(ctx, sats),
    progress: (ctx) => ({
      current: Math.min(holdingSats(ctx), sats),
      target: sats,
      unit: sats >= SATS_PER_BTC ? "btc" : "sats",
    }),
  };
}

/** Wallet type per wallet id, for the custody questions. */
function walletTypes(ctx: MilestoneContext): Map<string, WalletType> {
  return new Map(ctx.portfolio.wallets.map((w) => [w.id, w.type]));
}

/** Share of the holding that is not on an exchange, 0…1. */
function selfCustodyShare(entries: LedgerEntry[], types: Map<string, WalletType>): number {
  let self = ZERO;
  let total = ZERO;
  const perWallet = new Map<string, Decimal>();
  for (const e of entries) {
    const delta =
      e.type === "buy"
        ? dec(e.amountBtc).minus(dec(e.feeBtc))
        : e.type === "transfer_in"
          ? dec(e.amountBtc)
          : dec(e.amountBtc).plus(dec(e.feeBtc)).neg();
    perWallet.set(e.walletId, (perWallet.get(e.walletId) ?? ZERO).plus(delta));
  }
  for (const [walletId, amount] of perWallet) {
    if (!amount.gt(0)) continue;
    total = total.plus(amount);
    if (SELF_CUSTODY.includes(types.get(walletId) ?? "software")) {
      self = self.plus(amount);
    }
  }
  return total.gt(0) ? self.div(total).toNumber() : 0;
}

/** The first day the self-custody share was at least `share`. */
function dayCustodyReached(ctx: MilestoneContext, share: number): string | null {
  const types = walletTypes(ctx);
  const ordered = sorted(ctx.entries);
  for (let i = 0; i < ordered.length; i++) {
    if (selfCustodyShare(ordered.slice(0, i + 1), types) >= share) {
      return ordered[i].date;
    }
  }
  return null;
}

/** First transfer that moved coins off an exchange into one's own wallet. */
function firstWithdrawalToSelf(ctx: MilestoneContext): LedgerEntry | null {
  const types = walletTypes(ctx);
  const byId = new Map(ctx.entries.map((e) => [e.accountId, e.walletId]));
  return (
    sorted(ctx.entries).find(
      (e) =>
        e.type === "transfer_out" &&
        types.get(e.walletId) === "exchange" &&
        e.counterpartyAccountId !== undefined &&
        SELF_CUSTODY.includes(
          types.get(byId.get(e.counterpartyAccountId) ?? "") ?? "exchange",
        ),
    ) ?? null
  );
}

const TAPROOT = /^bc1p/i;
/**
 * Lightning wallets are recognised by name, because the ledger has no wallet
 * type for them: a Lightning balance is custodial or self-custodial software
 * either way, and inventing a fifth type for a milestone would be the tail
 * wagging the dog. The list is the handful of names people actually use.
 */
const LIGHTNING_NAMES =
  /(lightning|\bln\b|phoenix|breez|zeus|muun|wallet of satoshi|walletofsatoshi|blixt|alby|strike|cash ?app|blue ?wallet)/i;

/** A transfer that closed several lots at once looks like a consolidation. */
const CONSOLIDATION_INPUTS = 3;

export const MILESTONES: MilestoneDefinition[] = [
  // ------------------------------------------------------------- stacking
  {
    id: "firstTransaction",
    category: "stacking",
    reached: (ctx) => ctx.entries.length > 0,
    achievedAt: (ctx) => sorted(ctx.entries)[0]?.date ?? null,
  },
  stackMilestone("sats100k", 100_000),
  stackMilestone("sats1m", 1_000_000),
  stackMilestone("btc010", 10_000_000),
  stackMilestone("btc021", 21_000_000),
  stackMilestone("btc1", SATS_PER_BTC),
  stackMilestone("btc21", 2.1 * SATS_PER_BTC),

  // ---------------------------------------------------------- sovereignty
  {
    id: "firstWithdrawal",
    category: "sovereignty",
    reached: (ctx) => firstWithdrawalToSelf(ctx) !== null,
    achievedAt: (ctx) => firstWithdrawalToSelf(ctx)?.date ?? null,
  },
  {
    id: "selfCustody50",
    category: "sovereignty",
    reached: (ctx) => selfCustodyShare(ctx.entries, walletTypes(ctx)) >= 0.5,
    achievedAt: (ctx) => dayCustodyReached(ctx, 0.5),
    progress: (ctx) => ({
      current: Math.min(selfCustodyShare(ctx.entries, walletTypes(ctx)) * 100, 50),
      target: 50,
      unit: "percent",
    }),
  },
  {
    id: "selfCustody100",
    category: "sovereignty",
    // Not "no exchange wallet exists" but "nothing is left on one".
    reached: (ctx) =>
      ctx.balanceBtc.gt(0) && selfCustodyShare(ctx.entries, walletTypes(ctx)) >= 1,
    achievedAt: (ctx) => dayCustodyReached(ctx, 1),
    progress: (ctx) => ({
      current: selfCustodyShare(ctx.entries, walletTypes(ctx)) * 100,
      target: 100,
      unit: "percent",
    }),
  },
  {
    id: "firstWatchedAddress",
    category: "sovereignty",
    reached: (ctx) => ctx.portfolio.watchedAddresses.length > 0,
  },
  {
    id: "taprootAddress",
    category: "sovereignty",
    reached: (ctx) =>
      ctx.portfolio.watchedAddresses.some((a) => TAPROOT.test(a.value.trim())) ||
      ctx.entries.some((e) => e.address !== undefined && TAPROOT.test(e.address.trim())),
    achievedAt: (ctx) =>
      sorted(ctx.entries).find((e) => e.address && TAPROOT.test(e.address.trim()))?.date ??
      null,
  },
  {
    id: "lightningWallet",
    category: "sovereignty",
    reached: (ctx) => ctx.portfolio.wallets.some((w) => LIGHTNING_NAMES.test(w.name)),
  },

  // -------------------------------------------------------------- patience
  {
    id: "firstTaxFreeLot",
    category: "patience",
    reached: (ctx) =>
      ctx.fifo.openLots.some((l) => !l.originUnresolved && isLotTaxFree(l, ctx.now)) ||
      ctx.fifo.disposals.some((d) => d.parts.some((p) => p.taxFree)),
    achievedAt: (ctx) => {
      const lots = ctx.fifo.openLots
        .filter((l) => !l.originUnresolved)
        .map((l) => l.taxFreeDate.getTime())
        .filter((t) => t <= ctx.now.getTime())
        .sort((a, b) => a - b);
      return lots.length > 0 ? isoDay(lots[0]) : null;
    },
  },
  {
    id: "days100",
    category: "patience",
    reached: (ctx) => daysSinceFirstBuy(ctx) >= 100,
    achievedAt: (ctx) => afterFirstBuy(ctx, 100),
    progress: (ctx) => ({
      current: Math.min(daysSinceFirstBuy(ctx), 100),
      target: 100,
      unit: "days",
    }),
  },
  {
    id: "year1",
    category: "patience",
    reached: (ctx) => daysSinceFirstBuy(ctx) >= 365,
    achievedAt: (ctx) => afterFirstBuy(ctx, 365),
    progress: (ctx) => ({
      current: Math.min(daysSinceFirstBuy(ctx), 365),
      target: 365,
      unit: "days",
    }),
  },
  {
    id: "throughHalving",
    category: "patience",
    reached: (ctx) => halvingHeldThrough(ctx) !== null,
    achievedAt: (ctx) => {
      const day = halvingHeldThrough(ctx);
      return day === null ? null : `${day}T00:00:00.000Z`;
    },
  },
  {
    id: "years4",
    category: "patience",
    reached: (ctx) => daysSinceFirstBuy(ctx) >= 4 * 365,
    achievedAt: (ctx) => afterFirstBuy(ctx, 4 * 365),
    progress: (ctx) => ({
      current: Math.min(daysSinceFirstBuy(ctx), 4 * 365),
      target: 4 * 365,
      unit: "days",
    }),
  },

  // ------------------------------------------------------------- diligence
  {
    id: "firstBackup",
    category: "diligence",
    reached: (ctx) => ctx.savedOnce,
  },
  {
    id: "encrypted",
    category: "diligence",
    reached: (ctx) => ctx.encrypted,
  },
  {
    id: "allTransfersLinked",
    category: "diligence",
    reached: (ctx) => {
      const transfers = ctx.entries.filter(
        (e) => e.type === "transfer_in" || e.type === "transfer_out",
      );
      if (transfers.length === 0) return false;
      const issues = issueContext(ctx.entries);
      return !transfers.some((e) => hasIssue(e, "unlinkedTransfer", issues));
    },
  },
  {
    id: "allTxidsRecorded",
    category: "diligence",
    reached: (ctx) => {
      const transfers = ctx.entries.filter(
        (e) => e.type === "transfer_in" || e.type === "transfer_out",
      );
      if (transfers.length === 0) return false;
      const issues = issueContext(ctx.entries);
      return !transfers.some((e) => hasIssue(e, "missingTxid", issues));
    },
  },
  { id: "taxExported", category: "diligence", event: true },
  {
    id: "taxYearClosed",
    category: "diligence",
    // A calendar year that is over and had disposals, all of them assigned.
    reached: (ctx) => closedTaxYear(ctx) !== null,
    achievedAt: (ctx) => {
      const year = closedTaxYear(ctx);
      return year === null ? null : `${year + 1}-01-01T00:00:00.000Z`;
    },
  },

  // --------------------------------------------------------------- culture
  { id: "whitepaperOpened", category: "culture", event: true },
  {
    id: "firstConsolidation",
    category: "culture",
    // In the ledger a consolidation looks like one transfer closing several
    // lots at once. An approximation, and the only one the ledger allows: what
    // actually happened on chain is the watchlist's business, not the ledger's.
    reached: (ctx) => firstConsolidation(ctx) !== null,
    achievedAt: (ctx) => firstConsolidation(ctx)?.date ?? null,
  },
  {
    id: "boughtOnHalvingDay",
    category: "culture",
    reached: (ctx) => buyOnDay(ctx, HALVING_DATES) !== null,
    achievedAt: (ctx) => buyOnDay(ctx, HALVING_DATES)?.date ?? null,
  },
  {
    id: "boughtOnPizzaDay",
    category: "culture",
    reached: (ctx) => pizzaDayBuy(ctx) !== null,
    achievedAt: (ctx) => pizzaDayBuy(ctx)?.date ?? null,
  },
];

export const MILESTONES_BY_ID = new Map(MILESTONES.map((m) => [m.id, m]));

// ---------------------------------------------------------------- helpers

function daysSinceFirstBuy(ctx: MilestoneContext): number {
  const first = firstBuy(ctx);
  if (!first) return 0;
  const t = new Date(first.date).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((ctx.now.getTime() - t) / DAY));
}

function afterFirstBuy(ctx: MilestoneContext, days: number): string | null {
  const first = firstBuy(ctx);
  if (!first) return null;
  const t = new Date(first.date).getTime();
  return Number.isNaN(t) ? null : isoDay(t + days * DAY);
}

/** The first halving the portfolio was already holding coins through. */
function halvingHeldThrough(ctx: MilestoneContext): string | null {
  const series = dailyBalanceSeries(ctx.entries);
  if (series.length === 0) return null;
  for (const halving of HALVING_DATES) {
    const day = Date.parse(`${halving}T00:00:00.000Z`);
    if (day > ctx.now.getTime()) continue;
    const before = series.filter((p) => p.time <= day).pop();
    const after = series.find((p) => p.time >= day);
    if (before?.btc.gt(0) && after?.btc.gt(0)) return halving;
  }
  return null;
}

function buyOnDay(ctx: MilestoneContext, days: readonly string[]): LedgerEntry | null {
  const set = new Set(days);
  return (
    sorted(ctx.entries).find((e) => {
      if (e.type !== "buy") return false;
      const d = new Date(e.date);
      if (Number.isNaN(d.getTime())) return false;
      const local = localDay(d);
      const key = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(
        local.getDate(),
      ).padStart(2, "0")}`;
      return set.has(key);
    }) ?? null
  );
}

/** 22 May, in the user's own timezone — the day the pizzas were paid for. */
function pizzaDayBuy(ctx: MilestoneContext): LedgerEntry | null {
  return (
    sorted(ctx.entries).find((e) => {
      if (e.type !== "buy") return false;
      const d = new Date(e.date);
      if (Number.isNaN(d.getTime())) return false;
      return d.getMonth() === 4 && d.getDate() === 22;
    }) ?? null
  );
}

function firstConsolidation(ctx: MilestoneContext): LedgerEntry | null {
  return (
    sorted(ctx.entries).find(
      (e) =>
        e.type === "transfer_out" &&
        (e.lotAllocations?.length ?? 0) >= CONSOLIDATION_INPUTS,
    ) ?? null
  );
}

/** The most recent calendar year that is over, had disposals, and is complete. */
function closedTaxYear(ctx: MilestoneContext): number | null {
  const currentYear = ctx.now.getFullYear();
  const years = new Set(
    ctx.fifo.disposals
      .map((d) => new Date(d.date).getFullYear())
      .filter((y) => y < currentYear),
  );
  for (const year of [...years].sort((a, b) => b - a)) {
    const ofYear = ctx.fifo.disposals.filter(
      (d) => new Date(d.date).getFullYear() === year,
    );
    // "Closed" means the engine could account for all of it: nothing left
    // uncovered, no disposal resting on an unresolved origin.
    if (
      ofYear.every((d) => !d.uncoveredBtc.gt(0) && !d.unresolvedOriginBtc.gt(0))
    ) {
      return year;
    }
  }
  return null;
}

/** Build the snapshot the predicates read. */
export function milestoneContext(
  portfolio: PortfolioFile,
  entries: LedgerEntry[],
  fifo: FifoResult,
  runtime: { encrypted: boolean; savedOnce: boolean },
  now: Date = new Date(),
): MilestoneContext {
  return {
    portfolio,
    entries,
    fifo,
    balanceBtc: totalBalance(entries),
    now,
    encrypted: runtime.encrypted,
    savedOnce: runtime.savedOnce,
  };
}

export interface Evaluation {
  /** The complete list to store, existing records untouched. */
  milestones: MilestoneRecord[];
  /** What was reached in this run — what the notification is about. */
  newlyAchieved: MilestoneRecord[];
}

/**
 * Work out which milestones are reached now, keeping everything already
 * recorded exactly as it is.
 *
 * **A reached milestone stays reached.** The holding can fall back below one
 * coin, coins can move back onto an exchange — none of that un-earns the
 * decision that was made at the time, and re-deriving the date would rewrite
 * history. So existing records are never touched, only added to.
 */
export function evaluateMilestones(
  ctx: MilestoneContext,
  existing: MilestoneRecord[] = [],
): Evaluation {
  const have = new Map(existing.map((m) => [m.id, m]));
  const newlyAchieved: MilestoneRecord[] = [];

  for (const def of MILESTONES) {
    if (have.has(def.id) || def.event || !def.reached) continue;
    if (!def.reached(ctx)) continue;
    // Derived from the data where it can be, so a file with years of history
    // does not claim everything happened the afternoon it was first opened.
    const derived = def.achievedAt?.(ctx) ?? null;
    const at = derived ?? ctx.now.toISOString();
    const record: MilestoneRecord = {
      id: def.id,
      // Never in the future: a derived date is an estimate, and an estimate
      // that has not happened yet is simply wrong.
      achievedAt: new Date(at).getTime() > ctx.now.getTime() ? ctx.now.toISOString() : at,
      acknowledged: false,
    };
    newlyAchieved.push(record);
  }

  return {
    milestones: [...existing, ...newlyAchieved],
    newlyAchieved,
  };
}

/** Record an event milestone (the whitepaper was opened, a report exported). */
export function achieveEvent(
  existing: MilestoneRecord[] = [],
  id: string,
  now: Date = new Date(),
): Evaluation {
  if (existing.some((m) => m.id === id) || !MILESTONES_BY_ID.has(id)) {
    return { milestones: existing, newlyAchieved: [] };
  }
  const record: MilestoneRecord = {
    id,
    achievedAt: now.toISOString(),
    acknowledged: false,
  };
  return { milestones: [...existing, record], newlyAchieved: [record] };
}

/** Mark records as notified, so a toast is shown once and not on every load. */
export function acknowledgeAll(existing: MilestoneRecord[] = []): MilestoneRecord[] {
  return existing.some((m) => !m.acknowledged)
    ? existing.map((m) => (m.acknowledged ? m : { ...m, acknowledged: true }))
    : existing;
}

export interface CategoryProgress {
  category: MilestoneCategory;
  achieved: number;
  total: number;
}

/** How far along each category is, for the overview. */
export function categoryProgress(records: MilestoneRecord[] = []): CategoryProgress[] {
  const done = new Set(records.map((m) => m.id));
  return MILESTONE_CATEGORIES.map((category) => {
    const of = MILESTONES.filter((m) => m.category === category);
    return {
      category,
      achieved: of.filter((m) => done.has(m.id)).length,
      total: of.length,
    };
  });
}
