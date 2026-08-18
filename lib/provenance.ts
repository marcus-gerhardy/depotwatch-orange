// Where the coins in a transaction actually came from.
//
// A transfer_in is not an acquisition: it is the arrival of coins that were
// bought somewhere else, possibly bundled from several buys into one on-chain
// output and possibly moved across several own wallets first (CLAUDE.md §3.2).
// This module answers "which original buys make up this transaction, and with
// what share", by walking the persisted links backwards:
//
//   transfer_in → transferGroupId → transfer_out → lotAllocations → …
//
// It is a pure function over the flattened ledger, deliberately separate from
// the FIFO engine: the engine consumes lots forward in time to compute cost
// basis and disposals, while this reads the same links backwards to explain a
// single transaction. Both derive lot identity from the same persisted data, so
// a test asserts they agree on dates and amounts.

import { Decimal, dec, ZERO } from "./decimal";
import { buyLotBasis } from "./fifo";
import { lotCreditedBtc } from "./transferLink";
import type { LedgerEntry, LotAllocation } from "./types";

/**
 * How deep the backwards walk may go. Every hop is one internal transfer, so
 * this is "coins moved between own accounts 64 times before arriving" — far
 * beyond any real ledger, and a hard stop for corrupt data that the cycle guard
 * alone would not catch (e.g. a chain that keeps branching without repeating).
 */
const MAX_DEPTH = 64;

/** One original acquisition a transaction's amount traces back to. */
export interface OriginLot {
  /** The buy (or external transfer_in) that acquired these coins. */
  lotTxId: string;
  /** Original acquisition date — never the date of any transfer in between. */
  acquiredDate: string;
  /** Share of the resolved transaction's amount that came from this lot. */
  amountBtc: Decimal;
  /** Original cost per BTC; null when the lot has no EUR figure. */
  pricePerBtcEur: Decimal | null;
  /**
   * Tax cost basis of this share (`pricePerBtcEur × amountBtc`, fees included
   * per `buyLotBasis`); null when unknown.
   */
  costEur: Decimal | null;
  /**
   * The EUR the origin transaction actually recorded for this share — its
   * "Betrag (EUR)", split in proportion to the share. Deliberately not the
   * cost basis: that one adds the fiat fee and divides by the net BTC, so a
   * transfer valued with it would not add up to the amounts its buys show in
   * the transaction table. Null when the lot has no EUR figure at all.
   */
  valueEur: Decimal | null;
  /** Where the original acquisition sits, which is not where the coins are now. */
  walletId: string;
  walletName: string;
  accountId: string;
  accountName: string;
  note: string;
  /** Internal transfers between the acquisition and the resolved transaction. */
  hops: number;
}

export type ProvenanceStatus =
  /** The transaction is itself an acquisition (buy, external receive). */
  | "origin"
  /** Every satoshi traced back to an original acquisition. */
  | "resolved"
  /** Part of the amount traced, the rest could not be followed. */
  | "partial"
  /** An internal transfer leg with no counterpart linked to it. */
  | "unlinked"
  /** Linked, but the chain behind it carries no usable lot references. */
  | "unresolvable";

export interface Provenance {
  txId: string;
  /** The amount this was resolved for (the transaction's own amountBtc). */
  amountBtc: Decimal;
  /** Original lots, oldest acquisition first; merged per lot transaction. */
  origins: OriginLot[];
  /** Sum of the origins' shares — equals amountBtc when fully resolved. */
  resolvedBtc: Decimal;
  /** What could not be traced back to any acquisition. */
  unresolvedBtc: Decimal;
  status: ProvenanceStatus;
  /**
   * The walk hit the depth limit or a circular link and stopped early. The
   * result is still usable — the untraceable part is in `unresolvedBtc` — but
   * the data behind it is broken, not merely incomplete.
   */
  truncated: boolean;
}

interface LedgerIndex {
  byId: Map<string, LedgerEntry>;
  /** transfer_out legs per transferGroupId (normally exactly one). */
  outLegsByGroup: Map<string, LedgerEntry[]>;
}

/**
 * Index the ledger once for repeated resolution. Resolving every row of a
 * table separately would otherwise rebuild these maps per row.
 */
export function indexLedger(entries: LedgerEntry[]): LedgerIndex {
  const byId = new Map<string, LedgerEntry>();
  const outLegsByGroup = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    byId.set(e.id, e);
    if (e.type === "transfer_out" && e.transferGroupId) {
      const legs = outLegsByGroup.get(e.transferGroupId) ?? [];
      legs.push(e);
      outLegsByGroup.set(e.transferGroupId, legs);
    }
  }
  return { byId, outLegsByGroup };
}

/** Is this entry an acquisition in its own right, i.e. the end of the walk? */
function isOriginEntry(e: LedgerEntry): boolean {
  // A gift and an income receipt are acquisitions too: the coins entered the
  // ledger there, and there is nothing further back to follow.
  if (e.type === "buy" || e.type === "gift_in" || e.type === "income") return true;
  // An external receive starts a lot at its own date: the coins came from
  // outside the ledger, so there is nothing further back to follow.
  return e.type === "transfer_in" && !e.counterpartyAccountId && !e.transferGroupId;
}

/** Cost per BTC of an entry that is itself an origin lot (fees included). */
function originPricePerBtc(e: LedgerEntry): Decimal | null {
  // Income is valued like a buy: the market value on receipt *is* the cost.
  if (e.type === "buy" || e.type === "income") return buyLotBasis(e).costPerBtcEur;
  // A gift carries the giver's cost basis, or none at all.
  if (e.type === "gift_in") {
    const amount = dec(e.amountBtc);
    return e.inheritedCostBasisEur != null && e.inheritedCostBasisEur !== "" && amount.gt(0)
      ? dec(e.inheritedCostBasisEur).div(amount)
      : null;
  }
  return e.pricePerBtcEur === null || e.pricePerBtcEur === undefined
    ? null
    : dec(e.pricePerBtcEur);
}

/**
 * The EUR figure the transaction itself shows — the total actually paid, or
 * price × amount when only a price was recorded. The same rule the transaction
 * table uses for its value column, so both tell the same number.
 */
function recordedTotalEur(
  e: Pick<LedgerEntry, "amountBtc" | "pricePerBtcEur" | "totalFiatEur">,
): Decimal | null {
  if (e.totalFiatEur != null) return dec(e.totalFiatEur);
  if (e.pricePerBtcEur != null) return dec(e.amountBtc).mul(dec(e.pricePerBtcEur));
  return null;
}

/**
 * What a lot-creating transaction recorded in EUR for `share` of its coins.
 *
 * The recorded total belongs to what the transaction credited to the account
 * (a buy's BTC fee is charged on top of its amount, §3.2), so the share is
 * measured against exactly that: moving a lot in full is then worth its own
 * "Betrag (EUR)" to the cent, and half of it half that. Deliberately not the
 * tax cost basis, which adds the fiat fee and divides by the net BTC — valuing
 * a transfer with that leaves it differing from the buys behind it.
 */
export function recordedShareValue(
  e: Pick<LedgerEntry, "type" | "amountBtc" | "feeBtc" | "pricePerBtcEur" | "totalFiatEur">,
  share: Decimal,
): Decimal | null {
  const total = recordedTotalEur(e);
  const credited = lotCreditedBtc(e);
  return total === null || !credited.gt(0) ? null : total.mul(share).div(credited);
}

function originOf(
  e: LedgerEntry,
  share: Decimal,
  hops: number,
  valueScale: Decimal,
): OriginLot {
  const price = originPricePerBtc(e);
  return {
    lotTxId: e.id,
    // A gift's acquisition is the *giver's*, not the day it arrived
    // ("Fußstapfentheorie", §3.2) — the same date the FIFO engine dates its
    // lot from, so both tell the same story about the holding period.
    acquiredDate:
      e.type === "gift_in" && e.inheritedAcquisitionDate
        ? e.inheritedAcquisitionDate
        : e.date,
    amountBtc: share,
    pricePerBtcEur: price,
    costEur: price === null ? null : price.mul(share),
    // Valued over the share that was *consumed* for this transaction, which is
    // larger than the share that arrived by every network fee on the way (see
    // `valueScale`): the euros of the coins burned as a fee were still paid for
    // these buys, so leaving them out would put the transfer's value below the
    // amounts of the buys it is made of.
    valueEur: recordedShareValue(e, share.mul(valueScale)),
    walletId: e.walletId,
    walletName: e.walletName,
    accountId: e.accountId,
    accountName: e.accountName,
    note: e.note,
    hops,
  };
}

/**
 * Split `share` over `allocations` in proportion to their amounts. That matters
 * in both directions: a transfer_out's allocations cover its amount *plus* the
 * network fee (§3.2), so an in-leg asking for the net amount gets every source
 * lot reduced by its proportional part of the fee; and an in-leg that is itself
 * only partly moved on passes its origins down proportionally.
 *
 * The parts add up to **exactly** `share`. Proportional shares are ratios, so
 * most of them do not terminate in decimal (0.1 of 0.29999 out of 0.3), and
 * decimal.js rounds each one at its configured precision. Summing the rounded
 * parts then misses the total by ~1e-29 — invisible in any BTC figure, but
 * enough to make an equality check claim a "deviation of 0,00000000". So
 * whatever the rounding lost or gained is put back on the largest part, which
 * is the one that can carry it without changing its 8-decimal representation
 * (and never a lot that contributed nothing, as "give it to the last" would).
 */
function splitProportionally(
  allocations: LotAllocation[],
  share: Decimal,
): { allocation: LotAllocation; amount: Decimal }[] {
  const total = allocations.reduce((s, a) => s.plus(dec(a.amountBtc)), ZERO);
  if (total.lte(0)) return [];
  const parts = allocations.map((allocation) => ({
    allocation,
    amount: dec(allocation.amountBtc).mul(share).div(total),
  }));
  const residual = share.minus(parts.reduce((s, p) => s.plus(p.amount), ZERO));
  if (!residual.isZero()) {
    let biggest = 0;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].amount.gt(parts[biggest].amount)) biggest = i;
    }
    parts[biggest].amount = parts[biggest].amount.plus(residual);
  }
  return parts;
}

/**
 * Resolve which original acquisitions `entry`'s coins came from.
 *
 * Works for any transaction that can carry lot references: a transfer_in
 * resolves through its group's out-leg, a sell/spend/transfer_out through its
 * own `lotAllocations`. A buy or an external receive resolves to itself.
 *
 * `amountBtc` defaults to the entry's own amount; pass a smaller value to
 * resolve a part of it (that is what the recursion does for each hop).
 */
export function resolveProvenance(
  entry: LedgerEntry,
  index: LedgerIndex,
  amountBtc?: Decimal,
): Provenance {
  const amount = amountBtc ?? dec(entry.amountBtc);
  const merged = new Map<string, OriginLot>();
  let unresolved = ZERO;
  let truncated = false;
  /** Set once anything at all was followed, to tell "unlinked" from "partial". */
  let followedSomething = false;

  // Ids on the current path, not globally visited: the same lot legitimately
  // appears twice when a transfer bundles two slices of it, while a repeat
  // *within one path* can only be a circular link.
  const path = new Set<string>();

  function addOrigin(o: OriginLot) {
    const prev = merged.get(o.lotTxId);
    if (!prev) {
      merged.set(o.lotTxId, o);
      return;
    }
    prev.amountBtc = prev.amountBtc.plus(o.amountBtc);
    prev.costEur =
      prev.costEur === null || o.costEur === null ? null : prev.costEur.plus(o.costEur);
    prev.valueEur =
      prev.valueEur === null || o.valueEur === null ? null : prev.valueEur.plus(o.valueEur);
    prev.hops = Math.min(prev.hops, o.hops);
  }

  /**
   * `valueScale` turns an arrived share back into the share that was consumed
   * for it. A transfer_out closes `amountBtc + feeBtc` worth of lots but only
   * `amountBtc` reaches the other side, so the shares (which must add up to the
   * arrival's amount) are the net ones while their EUR value has to come from
   * the gross ones. Multiplies across hops, so a chain of transfers keeps every
   * fee it paid inside the value.
   */
  function walk(e: LedgerEntry, share: Decimal, hops: number, valueScale: Decimal) {
    if (share.lte(0)) return;
    if (hops > MAX_DEPTH || path.has(e.id)) {
      truncated = true;
      unresolved = unresolved.plus(share);
      return;
    }
    if (isOriginEntry(e)) {
      addOrigin(originOf(e, share, hops, valueScale));
      return;
    }

    // An incoming leg is explained by the out-leg of its transfer group; every
    // other type carries its own allocations.
    let allocations: LotAllocation[] = [];
    /** What the leg owning these allocations passed on, i.e. minus its fee. */
    let passedOn = dec(e.amountBtc);
    if (e.type === "transfer_in") {
      const legs = e.transferGroupId
        ? (index.outLegsByGroup.get(e.transferGroupId) ?? [])
        : [];
      allocations = legs.flatMap((leg) => leg.lotAllocations ?? []);
      passedOn = legs.reduce((s, leg) => s.plus(dec(leg.amountBtc)), ZERO);
    } else {
      allocations = e.lotAllocations ?? [];
    }
    if (allocations.length === 0) {
      unresolved = unresolved.plus(share);
      return;
    }

    const closed = allocations.reduce((s, a) => s.plus(dec(a.amountBtc)), ZERO);
    const nextScale = passedOn.gt(0) ? valueScale.mul(closed).div(passedOn) : valueScale;

    path.add(e.id);
    for (const part of splitProportionally(allocations, share)) {
      const lotTx = index.byId.get(part.allocation.lotTransactionId);
      if (!lotTx) {
        // The referenced lot is gone (deleted transaction, partial import).
        unresolved = unresolved.plus(part.amount);
        continue;
      }
      followedSomething = true;
      walk(lotTx, part.amount, hops + 1, nextScale);
    }
    path.delete(e.id);
  }

  walk(entry, amount, 0, new Decimal(1));

  const origins = [...merged.values()].sort(
    (a, b) => a.acquiredDate.localeCompare(b.acquiredDate) || a.lotTxId.localeCompare(b.lotTxId),
  );
  const resolved = origins.reduce((s, o) => s.plus(o.amountBtc), ZERO);

  return {
    txId: entry.id,
    amountBtc: amount,
    origins,
    resolvedBtc: resolved,
    unresolvedBtc: unresolved,
    status: statusOf(entry, origins.length, unresolved, followedSomething),
    truncated,
  };
}

/** What a transfer's coins are worth in EUR, derived from where they came from. */
export interface ProvenanceValue {
  /** Value per BTC: the value below over the BTC it covers. */
  pricePerBtcEur: Decimal;
  /**
   * Σ of the origins' recorded EUR amounts for the shares they contributed
   * (`valueEur`), network fees included — a transfer that moves whole buys is
   * worth exactly the sum of those buys' "Betrag (EUR)".
   */
  totalFiatEur: Decimal;
  /** BTC covered by origins that have an EUR figure. */
  valuedBtc: Decimal;
  /** Whether that is the whole amount, i.e. the value is not a partial one. */
  complete: boolean;
}

/**
 * Kurs and value of a transfer leg, computed from its origins.
 *
 * A transfer is not a trade, so it has no price of its own — but the coins it
 * moves do: they were bought somewhere, and their quantity-weighted cost is
 * exactly what the leg is worth. The transfer dialog writes this figure onto
 * the legs it creates (§3.2), which legs from an import or a later linking
 * never got; deriving it here means both look the same in the UI without
 * writing anything into the file.
 *
 * The figures come from what the origin transactions recorded (their "Betrag
 * (EUR)"), not from their tax cost basis: the latter adds the fiat fee and
 * divides by the net BTC, which would leave the transfer's value differing
 * from the sum of the buys it moves. Origins without any EUR figure are left
 * out of both sums rather than valued at the others' average, and `complete`
 * says so — a partial value must never be passed off as the whole one.
 * Returns null when nothing at all can be valued.
 */
export function provenanceValue(p: Provenance): ProvenanceValue | null {
  let valueEur = ZERO;
  let valuedBtc = ZERO;
  for (const o of p.origins) {
    if (o.valueEur === null) continue;
    valueEur = valueEur.plus(o.valueEur);
    valuedBtc = valuedBtc.plus(o.amountBtc);
  }
  if (!valuedBtc.gt(0)) return null;
  return {
    pricePerBtcEur: valueEur.div(valuedBtc),
    totalFiatEur: valueEur,
    valuedBtc,
    complete: valuedBtc.eq(p.amountBtc),
  };
}

/**
 * The derived Kurs/value of every transfer leg in one pass, for surfaces that
 * show many of them (the transaction table). The ledger is indexed once, so
 * this costs one walk per leg instead of one per rendered row.
 */
export function derivedTransferValues(
  entries: LedgerEntry[],
): Map<string, ProvenanceValue> {
  const index = indexLedger(entries);
  const values = new Map<string, ProvenanceValue>();
  for (const e of entries) {
    if (e.type !== "transfer_in" && e.type !== "transfer_out") continue;
    const provenance = resolveProvenance(e, index);
    // A receive from outside the ledger is its own origin: there is nothing
    // behind it to compute from, and recomputing its figures out of itself
    // would only re-derive the rate from the total and quietly replace the one
    // that was actually recorded.
    if (provenance.status === "origin") continue;
    const value = provenanceValue(provenance);
    if (value) values.set(e.id, value);
  }
  return values;
}

function statusOf(
  entry: LedgerEntry,
  originCount: number,
  unresolved: Decimal,
  followedSomething: boolean,
): ProvenanceStatus {
  if (isOriginEntry(entry)) return "origin";
  if (unresolved.lte(0)) return "resolved";
  if (originCount > 0) return "partial";
  // Nothing resolved: an unlinked leg is a missing link the user can fix in the
  // transfer dialog, while a linked one with unusable references is a data
  // problem — the two want different UI, so they stay distinguishable here.
  const unlinked =
    (entry.type === "transfer_in" || entry.type === "transfer_out") &&
    !entry.transferGroupId;
  return unlinked && !followedSomething ? "unlinked" : "unresolvable";
}

/**
 * Whether a transaction's holding period cannot be determined because its
 * origin is unknown. Only internal arrivals qualify: an external receive is a
 * legitimate start of its own lot, and everything else either is an
 * acquisition or resolves through its allocations.
 */
export function hasUnresolvedOrigin(entry: LedgerEntry, index: LedgerIndex): boolean {
  if (entry.type !== "transfer_in") return false;
  if (isOriginEntry(entry)) return false;
  const { status } = resolveProvenance(entry, index);
  return status !== "resolved" && status !== "origin";
}

/** Ids of all transactions whose origin cannot be traced (see above). */
export function unresolvedOriginIds(entries: LedgerEntry[]): Set<string> {
  const index = indexLedger(entries);
  const ids = new Set<string>();
  for (const e of entries) if (hasUnresolvedOrigin(e, index)) ids.add(e.id);
  return ids;
}
