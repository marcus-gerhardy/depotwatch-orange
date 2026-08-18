// Editing the two links a transfer is made of (CLAUDE.md §3.2).
//
// A transfer carries two independent references, and both must be changeable
// after the fact — an import rarely gets them right the first time:
//
//   1. the out-leg's `lotAllocations`: which source lots this transfer closes,
//   2. the `transferGroupId` pairing an out-leg with its in-leg(s).
//
// Everything here is a pure function over the ledger or the portfolio file, so
// the dialogs stay rendering code and the rules stay testable.

import { Decimal, dec, ZERO } from "./decimal";
import { flattenLedger } from "./types";
import type {
  LedgerEntry,
  LotAllocation,
  PortfolioFile,
  Transaction,
  Wallet,
} from "./types";

const MS_PER_DAY = 86_400_000;

/**
 * What a transfer_out's allocations have to add up to: the coins that actually
 * left the account, which is `amountBtc` **plus** the BTC network fee charged
 * on top of it (§3.2 fee convention, and what the FIFO engine consumes). Using
 * `amountBtc` alone would leave every transfer with a BTC fee permanently
 * short by exactly that fee.
 */
export function allocationTargetBtc(tx: Pick<Transaction, "amountBtc" | "feeBtc">): Decimal {
  return dec(tx.amountBtc).plus(dec(tx.feeBtc));
}

export function allocationSumBtc(allocations: LotAllocation[] | undefined): Decimal {
  return (allocations ?? []).reduce((s, a) => s.plus(dec(a.amountBtc)), ZERO);
}

/** BTC a lot-creating transaction credited to its account (§3.2). */
export function lotCreditedBtc(e: Pick<Transaction, "type" | "amountBtc" | "feeBtc">): Decimal {
  // A BTC fee comes off what a buy or an income receipt credits; a gift and a
  // transfer arrive as recorded (§3.2).
  if (e.type === "buy" || e.type === "income") {
    return dec(e.amountBtc).minus(dec(e.feeBtc));
  }
  return dec(e.amountBtc);
}

export interface LotAvailability {
  entry: LedgerEntry;
  /** What the lot brought into the account. */
  creditedBtc: Decimal;
  /** Claimed by lot allocations of *other* transactions. */
  allocatedBtc: Decimal;
  /** What is still free to allocate (never negative). */
  availableBtc: Decimal;
}

/**
 * Open lots of an account and how much of each is still unallocated.
 *
 * Availability is derived from the persisted allocations, not from the FIFO
 * engine's dynamic consumption: the editor asks "may I still point at this
 * lot", and the answer must not depend on a disposal that happens to have no
 * allocations of its own. `excludeTxId` leaves out the transaction being
 * edited, so its own current claim does not count against itself.
 */
export function lotAvailability(
  entries: LedgerEntry[],
  opts: { accountId?: string; excludeTxId?: string } = {},
): LotAvailability[] {
  const allocated = new Map<string, Decimal>();
  for (const e of entries) {
    if (e.id === opts.excludeTxId) continue;
    for (const a of e.lotAllocations ?? []) {
      allocated.set(
        a.lotTransactionId,
        (allocated.get(a.lotTransactionId) ?? ZERO).plus(dec(a.amountBtc)),
      );
    }
  }
  return entries
    .filter(
      (e) =>
        (e.type === "buy" || e.type === "transfer_in") &&
        (opts.accountId === undefined || e.accountId === opts.accountId),
    )
    .map((entry) => {
      const creditedBtc = lotCreditedBtc(entry);
      const allocatedBtc = allocated.get(entry.id) ?? ZERO;
      const availableBtc = Decimal.max(ZERO, creditedBtc.minus(allocatedBtc));
      return { entry, creditedBtc, allocatedBtc, availableBtc };
    })
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date));
}

/**
 * Group ids that really pair an out-leg with at least one in-leg.
 *
 * Carrying a `transferGroupId` is not the same as being linked: a leg can keep
 * an id whose counterpart never existed or is long gone (an interrupted
 * assignment, an import, an older file). Such a leg is exactly as unlinked as
 * one without an id — it must still be offered as a candidate and still count
 * as a data-quality gap — so everything that asks "is this leg linked" asks
 * this, never the field.
 */
export function pairedGroupIds(
  entries: Pick<Transaction, "type" | "transferGroupId">[],
): Set<string> {
  const seen = new Map<string, { out: boolean; in: boolean }>();
  for (const e of entries) {
    if (!e.transferGroupId) continue;
    const state = seen.get(e.transferGroupId) ?? { out: false, in: false };
    if (e.type === "transfer_out") state.out = true;
    if (e.type === "transfer_in") state.in = true;
    seen.set(e.transferGroupId, state);
  }
  const paired = new Set<string>();
  for (const [group, state] of seen) if (state.out && state.in) paired.add(group);
  return paired;
}

/** Whether this leg has a counterpart of the opposite direction (see above). */
export function isLegPaired(
  leg: Pick<Transaction, "transferGroupId">,
  paired: Set<string>,
): boolean {
  return !!leg.transferGroupId && paired.has(leg.transferGroupId);
}

/** On-chain data a transfer group shares (CLAUDE.md §3.2). */
export interface GroupOnChain {
  txid?: string;
  address?: string;
}

/**
 * What each transfer group knows about its on-chain transaction.
 *
 * Both legs of one transfer describe the same send, so whichever side recorded
 * it holds the data for both — and in practice only one side has it: a hardware
 * wallet exports txid and address, an exchange export usually neither.
 *
 * `txid` is the transaction's id and therefore identical for every leg of the
 * group. The `address` is only shared when the group pairs exactly one out-leg
 * with exactly one in-leg: the out-leg's address is where the coins went, the
 * in-leg's is where they arrived, which is the same output only as long as
 * there is exactly one. A batched send to several arrivals pays several
 * outputs, and picking one of them for the sending leg would be a guess.
 */
export function groupOnChain(entries: LedgerEntry[]): Map<string, GroupOnChain> {
  const legs = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    if (!e.transferGroupId) continue;
    if (e.type !== "transfer_in" && e.type !== "transfer_out") continue;
    const list = legs.get(e.transferGroupId) ?? [];
    list.push(e);
    legs.set(e.transferGroupId, list);
  }

  const shared = new Map<string, GroupOnChain>();
  for (const [group, list] of legs) {
    const oneToOne =
      list.filter((e) => e.type === "transfer_out").length === 1 &&
      list.filter((e) => e.type === "transfer_in").length === 1;
    shared.set(group, {
      txid: list.find((e) => e.txid)?.txid,
      address: oneToOne ? list.find((e) => e.address)?.address : undefined,
    });
  }
  return shared;
}

export interface EffectiveOnChain extends GroupOnChain {
  /** The value came from the counterpart leg, not from this transaction. */
  txidInherited: boolean;
  addressInherited: boolean;
}

/** A leg's on-chain data, its own first and its group's where it has none. */
export function effectiveOnChain(
  leg: Pick<LedgerEntry, "txid" | "address" | "transferGroupId">,
  groups: Map<string, GroupOnChain>,
): EffectiveOnChain {
  const shared = leg.transferGroupId ? groups.get(leg.transferGroupId) : undefined;
  return {
    txid: leg.txid ?? shared?.txid,
    address: leg.address ?? shared?.address,
    txidInherited: !leg.txid && !!shared?.txid,
    addressInherited: !leg.address && !!shared?.address,
  };
}

export interface OutLegCandidate {
  entry: LedgerEntry;
  /** Arrivals this out-leg is already paired with; empty for an unlinked one. */
  linkedInLegs: LedgerEntry[];
  /** The on-chain transaction id is the same on both legs: a certain match. */
  txidMatch: boolean;
  /** How far this candidate's amount is from the arrival's, in BTC. */
  amountDiffBtc: Decimal;
  /** Whole days between the two dates. */
  dayDiff: number;
  /** Lower is closer; a txid match always sorts first. */
  score: number;
}

export interface CandidateFilter {
  walletId?: string;
  accountId?: string;
  /** ISO date (YYYY-MM-DD), inclusive. */
  from?: string;
  to?: string;
  /**
   * Also offer out-legs that already have an arrival. One outgoing transaction
   * can legitimately arrive as several in-legs (§3.2), and without this the
   * user has no way to see — let alone fix — a wrong existing pairing.
   */
  includePaired?: boolean;
}

/**
 * Out-legs that could belong to `inLeg`, most likely first.
 *
 * A shared txid is proof, so those come first regardless of anything else.
 * The rest are ranked by how far off they are in amount and in time, with the
 * amount weighted heavily: a transfer's amount differs from its arrival only
 * by the network fee, while the recorded dates of the two legs routinely
 * differ by hours or a day.
 *
 * "Already linked" means *paired* (`pairedGroupIds`), not "carries a group id":
 * a leg whose counterpart never existed is unlinked and has to be offered,
 * otherwise it is invisible from both sides and can never be repaired.
 */
export function rankOutLegCandidates(
  inLeg: LedgerEntry,
  entries: LedgerEntry[],
  filter: CandidateFilter = {},
): OutLegCandidate[] {
  const amount = dec(inLeg.amountBtc);
  const at = new Date(inLeg.date).getTime();
  const paired = pairedGroupIds(entries);
  return entries
    .filter(
      (e) =>
        e.type === "transfer_out" &&
        (filter.includePaired === true || !isLegPaired(e, paired)) &&
        // The other side of a transfer is another account by definition.
        e.accountId !== inLeg.accountId &&
        (filter.walletId === undefined || e.walletId === filter.walletId) &&
        (filter.accountId === undefined || e.accountId === filter.accountId) &&
        (!filter.from || e.date >= filter.from) &&
        (!filter.to || e.date <= `${filter.to}T23:59:59.999Z`),
    )
    .map((entry) => {
      const linkedInLegs = isLegPaired(entry, paired)
        ? entries.filter(
            (e) => e.type === "transfer_in" && e.transferGroupId === entry.transferGroupId,
          )
        : [];
      const txidMatch =
        !!inLeg.txid && !!entry.txid && inLeg.txid === entry.txid;
      const amountDiffBtc = dec(entry.amountBtc).minus(amount);
      const dayDiff = Math.abs(new Date(entry.date).getTime() - at) / MS_PER_DAY;
      const relativeAmountDiff = amount.gt(0)
        ? amountDiffBtc.abs().div(amount).toNumber()
        : amountDiffBtc.abs().toNumber();
      return {
        entry,
        linkedInLegs,
        txidMatch,
        amountDiffBtc,
        dayDiff: Math.round(dayDiff),
        // An out-leg that already has an arrival is the weaker guess of two
        // equally close ones, so it sorts behind them without being hidden.
        score:
          (txidMatch ? -1 : relativeAmountDiff * 100 + dayDiff) +
          (linkedInLegs.length > 0 ? 1000 : 0),
      };
    })
    .sort((a, b) => a.score - b.score || a.entry.date.localeCompare(b.entry.date));
}

export interface AmountDifference {
  /** Out-leg amount minus in-leg amount: positive means coins went missing. */
  diffBtc: Decimal;
  /** The difference as a fraction of the out-leg amount. */
  ratio: number;
  /** Plausible as a network fee: positive and small. */
  plausibleFee: boolean;
  /** Too large to be a fee, so most likely the wrong counterpart. */
  implausible: boolean;
}

/** Above this share of the transferred amount, a "fee" is a wrong match. */
export const FEE_PLAUSIBILITY_LIMIT = 0.01;

export function amountDifference(
  outLeg: Pick<Transaction, "amountBtc">,
  inLeg: Pick<Transaction, "amountBtc">,
): AmountDifference {
  const out = dec(outLeg.amountBtc);
  const diffBtc = out.minus(dec(inLeg.amountBtc));
  const ratio = out.gt(0) ? diffBtc.abs().div(out).toNumber() : 0;
  return {
    diffBtc,
    ratio,
    plausibleFee: diffBtc.gt(0) && ratio <= FEE_PLAUSIBILITY_LIMIT,
    // A negative difference is not a fee at all: more arrived than left.
    implausible: diffBtc.lt(0) || ratio > FEE_PLAUSIBILITY_LIMIT,
  };
}

function mapTransactions(
  wallets: Wallet[],
  fn: (t: Transaction) => Transaction,
): Wallet[] {
  return wallets.map((w) => ({
    ...w,
    accounts: w.accounts.map((a) => ({ ...a, transactions: a.transactions.map(fn) })),
  }));
}

/**
 * Pair an arrival with an outgoing leg: both get one shared `transferGroupId`
 * and point their `counterpartyAccountId` at each other, which is what makes
 * the FIFO engine carry the source lots over instead of starting a new one.
 *
 * `adoptFeeBtc` turns the amount difference into the out-leg's network fee.
 * That also sets the out-leg's amount to what actually arrived, because the
 * ledger's fee sits *next to* the amount, not inside it (§3.2): recording the
 * fee without shrinking the amount would debit the source account twice for it.
 * `amountBtc + feeBtc` stays the same either way, so existing lot allocations
 * remain exactly as valid as they were.
 *
 * An out-leg that already has an arrival keeps its group and gains a second one
 * (one send can arrive in several pieces, §3.2) — minting a fresh id would tear
 * the existing arrival off it. In that case the out-leg's amount is never
 * touched either: the difference to *this* arrival is not the transfer's fee.
 */
export function linkTransferLegs(
  portfolio: PortfolioFile,
  inLegId: string,
  outLegId: string,
  opts: { adoptFeeBtc?: boolean } = {},
): PortfolioFile {
  const entries = flattenLedger(portfolio.wallets);
  const inLeg = entries.find((e) => e.id === inLegId);
  const outLeg = entries.find((e) => e.id === outLegId);
  if (!inLeg || !outLeg) return portfolio;

  // Joining keeps the group; a leg with an id but no counterpart is unlinked
  // and gets a fresh one like any other (`pairedGroupIds`).
  const joins = isLegPaired(outLeg, pairedGroupIds(entries));
  const transferGroupId = joins ? outLeg.transferGroupId! : crypto.randomUUID();
  const diff = amountDifference(outLeg, inLeg);
  const adopt = !joins && opts.adoptFeeBtc === true && diff.diffBtc.gt(0);

  // Both legs describe the same send, and typically only one side recorded it
  // (a hardware wallet exports txid and address, an exchange rarely does), so
  // the pairing hands them over. The address only when this is the one arrival
  // of the send — see `groupOnChain` for why.
  const oneToOne = !joins;
  const sharedTxid = inLeg.txid ?? outLeg.txid;
  const sharedAddress = oneToOne ? (inLeg.address ?? outLeg.address) : undefined;

  return {
    ...portfolio,
    wallets: mapTransactions(portfolio.wallets, (t) => {
      if (t.id === inLegId) {
        return {
          ...t,
          transferGroupId,
          counterpartyAccountId: outLeg.accountId,
          txid: t.txid ?? sharedTxid,
          address: t.address ?? sharedAddress,
        };
      }
      if (t.id === outLegId) {
        return {
          ...t,
          transferGroupId,
          // With several arrivals the single counterparty field can only name
          // one of them, so an existing pairing keeps the one it has.
          counterpartyAccountId: joins ? t.counterpartyAccountId : inLeg.accountId,
          txid: t.txid ?? sharedTxid,
          address: t.address ?? sharedAddress,
          ...(adopt
            ? {
                amountBtc: inLeg.amountBtc,
                feeBtc: dec(t.feeBtc).plus(diff.diffBtc).toString(),
              }
            : {}),
        };
      }
      return t;
    }),
  };
}

/**
 * Release a leg from its transfer group, on both sides. A group with several
 * in-legs survives losing one of them; anything that would leave a leg without
 * a counterpart dissolves the whole group, so no leg is left pointing at a
 * group that no longer pairs it with anything.
 */
export function unlinkTransferLeg(
  portfolio: PortfolioFile,
  legId: string,
): PortfolioFile {
  const entries = flattenLedger(portfolio.wallets);
  const leg = entries.find((e) => e.id === legId);
  const group = leg?.transferGroupId;
  if (!leg || !group) return portfolio;

  const rest = entries.filter((e) => e.transferGroupId === group && e.id !== legId);
  const stillPaired =
    rest.some((e) => e.type === "transfer_out") &&
    rest.some((e) => e.type === "transfer_in");
  const released = new Set<string>([legId]);
  if (!stillPaired) for (const e of rest) released.add(e.id);

  return {
    ...portfolio,
    wallets: mapTransactions(portfolio.wallets, (t) =>
      released.has(t.id)
        ? { ...t, transferGroupId: undefined, counterpartyAccountId: undefined }
        : t,
    ),
  };
}

/** Write a transfer_out's edited lot allocations back into the portfolio. */
export function setLotAllocations(
  portfolio: PortfolioFile,
  txId: string,
  allocations: LotAllocation[],
): PortfolioFile {
  return {
    ...portfolio,
    wallets: mapTransactions(portfolio.wallets, (t) =>
      t.id === txId
        ? { ...t, lotAllocations: allocations.length > 0 ? allocations : undefined }
        : t,
    ),
  };
}
