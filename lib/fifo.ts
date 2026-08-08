// FIFO cost-basis engine for the German tax module.
//
// Pure function over the flattened ledger. Lots are kept in one FIFO queue;
// internal transfers are NOT disposals and never reset the acquisition date.
//
// Lot-moving transfers: an internal transfer_out that carries a
// transferGroupId closes its allocated source-account lots, and the in-leg(s)
// of the same group re-create them in the receiving account with the original
// acquisition date and cost basis (the in-leg's own date is only the arrival
// time). This resolves transitively across multiple hops, because a moved lot
// keeps its origin data and can itself be referenced by the next transfer's
// allocations. The in-leg receives amountBtc net of the BTC network fee, so
// the fee simply never re-materializes.
//
// Legacy internal transfer legs (no transferGroupId) keep the old behavior:
// the lots never leave the source account's queue; only the fee is consumed.
//
// Sell/spend consume the oldest lots first; a disposal part is tax-free when
// the lot was held longer than the configured holding period (§23 EStG:
// > 1 year). Disposals and transfer_outs that carry persisted
// `lotAllocations` consume exactly those lots; ones without (legacy data)
// fall back to dynamic FIFO consumption.

import { Decimal, dec, ZERO } from "./decimal";
import type { LedgerEntry, LotAllocation } from "./types";

const MS_PER_DAY = 86_400_000;

/**
 * What a buy contributes as a lot: the BTC actually credited (amount net of a
 * BTC fee, §3.2) and its cost per BTC, where the recorded total beats the
 * price × amount approximation and a fiat fee raises the acquisition cost.
 *
 * Exported because `lib/provenance.ts` reports the same figure when it traces a
 * transfer back to this buy — one rule, so the two can never disagree.
 */
export function buyLotBasis(e: {
  amountBtc: string;
  feeBtc?: string;
  feeFiatEur?: string;
  pricePerBtcEur: string | null;
  totalFiatEur?: string | null;
}): { netBtc: Decimal; costPerBtcEur: Decimal | null } {
  const amount = dec(e.amountBtc);
  const netBtc = amount.minus(dec(e.feeBtc));
  const price = e.pricePerBtcEur === null ? null : dec(e.pricePerBtcEur);
  const gross =
    e.totalFiatEur != null ? dec(e.totalFiatEur) : price === null ? null : amount.mul(price);
  const totalCost = gross === null ? null : gross.plus(dec(e.feeFiatEur));
  return {
    netBtc,
    costPerBtcEur: totalCost === null || netBtc.lte(0) ? null : totalCost.div(netBtc),
  };
}

/** First day a lot acquired on `acquiredDate` is tax-free (exclusive bound). */
export function taxFreeDateOf(acquiredDate: string, holdingPeriodDays: number): Date {
  return new Date(
    new Date(acquiredDate).getTime() + (holdingPeriodDays + 1) * MS_PER_DAY,
  );
}

export interface OpenLot {
  /** Transaction that created the lot. */
  txId: string;
  acquiredDate: string;
  /** Account the lot-creating transaction belongs to. */
  accountId: string;
  walletName: string;
  accountName: string;
  originalAmountBtc: Decimal;
  remainingBtc: Decimal;
  /** Cost per BTC in EUR; null when the basis is unknown (external transfer in). */
  costPerBtcEur: Decimal | null;
  /** First day the lot is tax-free (acquisition + holding period, exclusive). */
  taxFreeDate: Date;
  /** Note of the lot-creating transaction. */
  note: string;
  /**
   * The lot's acquisition date is the arrival of coins whose real origin could
   * not be traced (an internal transfer_in that received more than its out-leg
   * moved). `acquiredDate` is then an assumption, so every tax statement about
   * this lot has to be marked rather than presented as a fact (CLAUDE.md §3.2).
   */
  originUnresolved?: boolean;
}

export interface DisposalPart {
  lotTxId: string;
  acquiredDate: string;
  amountBtc: Decimal;
  costBasisEur: Decimal | null;
  holdingDays: number;
  taxFree: boolean;
  /** The consumed lot's acquisition date is an assumption — see OpenLot. */
  originUnresolved: boolean;
}

export interface Disposal {
  txId: string;
  date: string;
  type: "sell" | "spend";
  amountBtc: Decimal;
  proceedsEur: Decimal;
  costBasisEur: Decimal;
  gainEur: Decimal;
  /** Gain on parts still inside the holding period (taxable). */
  taxableGainEur: Decimal;
  /** Gain on parts held past the holding period (tax-free). */
  taxFreeGainEur: Decimal;
  parts: DisposalPart[];
  /** BTC disposed of beyond what open lots covered (data entry gap). */
  uncoveredBtc: Decimal;
  /**
   * BTC of this disposal taken from lots whose origin is unknown. Their
   * holding period rests on an arrival date, so the tax view reports them
   * separately instead of quietly counting them as taxable or tax-free.
   */
  unresolvedOriginBtc: Decimal;
  /** Note of the disposing transaction. */
  note: string;
}

/** One internal transfer_out leg that moved (part of) a lot to another own account. */
export interface LotTransferLeg {
  transferOutTxId: string;
  transferGroupId: string;
  counterpartyAccountId: string;
  date: string;
  amountBtc: Decimal;
}

export interface FullyTransferredLot {
  amountBtc: Decimal;
  transfers: LotTransferLeg[];
}

export interface FifoResult {
  openLots: OpenLot[];
  disposals: Disposal[];
  /**
   * BTC still covered by open lots. This is NOT the portfolio holding: a
   * disposal the engine cannot cover (a sell whose buy is missing, e.g. from a
   * partial CSV export) leaves `uncoveredBtc` behind and no lot to consume, so
   * this stays above the actual balance. Use portfolio.totalBalance() for
   * "how much BTC do I hold" — this value only bounds what has a cost basis.
   */
  openLotsBtc: Decimal;
  /** Cost basis of open lots with known basis. */
  openCostBasisEur: Decimal;
  /**
   * BTC that `openCostBasisEur` actually covers — open lots with a known cost
   * per BTC. Lots without one (an external transfer_in with no price, a buy
   * with no EUR figure) are open and part of the holding, but contribute no
   * cost. Anything comparing the cost basis against a market value has to use
   * this quantity, never the portfolio holding: valuing the whole holding
   * against a partial cost basis reports the uncovered coins as pure profit.
   */
  openBasisBtc: Decimal;
  /** Average cost per BTC over open lots with known basis. */
  avgCostPerBtcEur: Decimal | null;
  realizedGainEur: Decimal;
  realizedTaxableGainEur: Decimal;
  realizedTaxFreeGainEur: Decimal;
  /**
   * Lot-creating transactions (buy/transfer_in) whose entire balance left
   * exclusively via one or more internal transfers — none of it sold, spent,
   * sent externally, or still open. Keyed by the lot-creating transaction's
   * id (matches how the UI aggregates a lot's remaining balance by id).
   */
  fullyTransferredLots: Map<string, FullyTransferredLot>;
}

function holdingDaysBetween(acquired: string, disposed: string): number {
  return Math.floor(
    (new Date(disposed).getTime() - new Date(acquired).getTime()) / MS_PER_DAY,
  );
}

/** A lot slice consumed by a transfer_out, waiting for its in-leg(s). */
interface MovedPart {
  acquiredDate: string;
  amountBtc: Decimal;
  costPerBtcEur: Decimal | null;
}

export function computeFifo(
  entries: LedgerEntry[],
  holdingPeriodDays: number,
): FifoResult {
  // Lots stay in the array even when exhausted: targeted allocations may
  // consume mid-queue lots, so FIFO consumption skips empty ones instead of
  // shifting from the front.
  const lots: OpenLot[] = [];
  const disposals: Disposal[] = [];
  const movedByGroup = new Map<string, MovedPart[]>();
  // Per lot-creating tx id: BTC consumed by an internal transfer (with legs),
  // vs. BTC consumed by anything else (sell/spend/external send/legacy fee).
  // A lot only fades in the UI when it's fully closed and 100% of that
  // closure came from the "transfer" bucket — see fullyTransferredLots below.
  const transferConsumed = new Map<string, LotTransferLeg[]>();
  const otherConsumedBtc = new Map<string, Decimal>();

  function addTransferConsumption(
    parts: DisposalPart[],
    leg: Omit<LotTransferLeg, "amountBtc">,
  ) {
    for (const p of parts) {
      const legs = transferConsumed.get(p.lotTxId) ?? [];
      legs.push({ ...leg, amountBtc: p.amountBtc });
      transferConsumed.set(p.lotTxId, legs);
    }
  }

  function addOtherConsumption(parts: DisposalPart[]) {
    for (const p of parts) {
      otherConsumedBtc.set(
        p.lotTxId,
        (otherConsumedBtc.get(p.lotTxId) ?? ZERO).plus(p.amountBtc),
      );
    }
  }

  const taxFreeDateFor = (acquired: string) => taxFreeDateOf(acquired, holdingPeriodDays);

  function takePart(lot: OpenLot, take: Decimal, disposedDate: string): DisposalPart {
    const days = holdingDaysBetween(lot.acquiredDate, disposedDate);
    lot.remainingBtc = lot.remainingBtc.minus(take);
    return {
      lotTxId: lot.txId,
      acquiredDate: lot.acquiredDate,
      amountBtc: take,
      costBasisEur:
        lot.costPerBtcEur === null ? null : lot.costPerBtcEur.mul(take),
      holdingDays: days,
      taxFree: days > holdingPeriodDays,
      originUnresolved: lot.originUnresolved === true,
    };
  }

  /**
   * Consume exactly the persisted allocations (capped at the disposal amount).
   *
   * This is the *only* way lots are ever consumed: which buys a disposal took
   * its coins from is a decision the user makes and the file records (§3.2).
   * The engine never picks lots by itself — a guessed assignment silently
   * decides holding periods and cost basis, and quietly changes them again as
   * soon as anything earlier in the ledger is edited. Missing/short lots (a
   * deleted buy) and anything the allocations do not cover stay uncovered and
   * are reported as such.
   */
  function consumeAllocated(
    allocations: LotAllocation[],
    amount: Decimal,
    disposedDate: string,
  ): { parts: DisposalPart[]; uncovered: Decimal } {
    const parts: DisposalPart[] = [];
    let budget = amount;
    let uncovered = ZERO;
    for (const a of allocations) {
      let want = Decimal.min(dec(a.amountBtc), budget);
      if (want.lte(0)) continue;
      budget = budget.minus(want);
      // A transfer_in can have re-created several lots under one transaction
      // id, so one allocation may span multiple queue entries (in order).
      for (const lot of lots) {
        if (want.lte(0)) break;
        if (lot.txId !== a.lotTransactionId || lot.remainingBtc.lte(0)) continue;
        const take = Decimal.min(want, lot.remainingBtc);
        parts.push(takePart(lot, take, disposedDate));
        want = want.minus(take);
      }
      uncovered = uncovered.plus(want);
    }
    return { parts, uncovered: uncovered.plus(budget) };
  }

  /**
   * Close `leaving` BTC (amount + network fee, §3.2) against the persisted
   * allocations. What they do not cover is not closed against anything — the
   * lots keep those coins and the gap is reported, rather than being taken
   * from whichever lot happens to be oldest.
   */
  function consumeLeaving(
    leaving: Decimal,
    e: LedgerEntry,
  ): { parts: DisposalPart[]; uncovered: Decimal } {
    if (leaving.lte(0)) return { parts: [], uncovered: ZERO };
    return e.lotAllocations?.length
      ? consumeAllocated(e.lotAllocations, leaving, e.date)
      : { parts: [], uncovered: leaving };
  }

  /**
   * Split consumed parts at `amount`: what the disposal sold, and the tail that
   * paid the BTC network fee. The allocations of a sell cover both (§3.2), but
   * only the first part has proceeds — the fee's coins simply leave.
   */
  function splitAtAmount(
    parts: DisposalPart[],
    amount: Decimal,
  ): { sold: DisposalPart[]; fee: DisposalPart[] } {
    const sold: DisposalPart[] = [];
    const fee: DisposalPart[] = [];
    let left = amount;
    for (const p of parts) {
      if (left.lte(0)) {
        fee.push(p);
        continue;
      }
      if (p.amountBtc.lte(left)) {
        sold.push(p);
        left = left.minus(p.amountBtc);
        continue;
      }
      // One part straddles the boundary: divide it in proportion.
      const share = left.div(p.amountBtc);
      sold.push({
        ...p,
        amountBtc: left,
        costBasisEur: p.costBasisEur === null ? null : p.costBasisEur.mul(share),
      });
      fee.push({
        ...p,
        amountBtc: p.amountBtc.minus(left),
        costBasisEur:
          p.costBasisEur === null ? null : p.costBasisEur.mul(ZERO.plus(1).minus(share)),
      });
      left = ZERO;
    }
    return { sold, fee };
  }

  for (const e of entries) {
    const amount = dec(e.amountBtc);
    const feeBtc = dec(e.feeBtc);
    const price = e.pricePerBtcEur === null ? null : dec(e.pricePerBtcEur);

    switch (e.type) {
      case "buy": {
        // Net BTC received; fiat fee raises the cost basis. The actually paid
        // total (when recorded) beats the price × amount approximation.
        const { netBtc: net, costPerBtcEur } = buyLotBasis(e);
        if (net.lte(0)) break;
        lots.push({
          txId: e.id,
          acquiredDate: e.date,
          accountId: e.accountId,
          walletName: e.walletName,
          accountName: e.accountName,
          originalAmountBtc: net,
          remainingBtc: net,
          costPerBtcEur,
          taxFreeDate: taxFreeDateFor(e.date),
          note: e.note,
        });
        break;
      }
      case "transfer_in": {
        if (e.counterpartyAccountId) {
          // Legacy internal leg (no group): the lots never left the source
          // account's queue — nothing to re-create here.
          if (!e.transferGroupId) break;
          const moved = movedByGroup.get(e.transferGroupId);
          // A group whose out-leg does not exist (a half-imported transfer, a
          // stale id): nothing moved, but the coins are in the account and the
          // balance counts them. Dropping them here would take them out of the
          // engine entirely — the holding would silently lose a chunk. They
          // become a lot of unknown origin instead, like the surplus below.
          if (!moved) {
            lots.push({
              txId: e.id,
              acquiredDate: e.date,
              accountId: e.accountId,
              walletName: e.walletName,
              accountName: e.accountName,
              originalAmountBtc: amount,
              remainingBtc: amount,
              costPerBtcEur: null,
              taxFreeDate: taxFreeDateFor(e.date),
              note: e.note,
              originUnresolved: true,
            });
            break;
          }
          // Re-create the moved lot slices in this account, keeping the
          // original acquisition date and cost basis. The in-leg amount is
          // net of the BTC fee, so the tail slice (the fee) stays unclaimed.
          let remaining = amount;
          for (const part of moved) {
            if (remaining.lte(0)) break;
            const take = Decimal.min(part.amountBtc, remaining);
            if (take.lte(0)) continue;
            part.amountBtc = part.amountBtc.minus(take);
            remaining = remaining.minus(take);
            lots.push({
              txId: e.id,
              acquiredDate: part.acquiredDate,
              accountId: e.accountId,
              walletName: e.walletName,
              accountName: e.accountName,
              originalAmountBtc: take,
              remainingBtc: take,
              costPerBtcEur: part.costPerBtcEur,
              taxFreeDate: taxFreeDateFor(part.acquiredDate),
              note: e.note,
            });
          }
          if (remaining.gt(0)) {
            // More arrived than the out-leg moved (data gap): the remainder
            // starts a fresh lot with unknown basis at the arrival date. That
            // date is an assumption, not an acquisition — flagged so the tax
            // views report it instead of computing a holding period from it.
            lots.push({
              txId: e.id,
              acquiredDate: e.date,
              accountId: e.accountId,
              walletName: e.walletName,
              accountName: e.accountName,
              originalAmountBtc: remaining,
              remainingBtc: remaining,
              costPerBtcEur: null,
              taxFreeDate: taxFreeDateFor(e.date),
              note: e.note,
              originUnresolved: true,
            });
          }
          break;
        }
        // External receive: new lot with unknown (or provided) basis.
        lots.push({
          txId: e.id,
          acquiredDate: e.date,
          accountId: e.accountId,
          walletName: e.walletName,
          accountName: e.accountName,
          originalAmountBtc: amount,
          remainingBtc: amount,
          costPerBtcEur: price,
          taxFreeDate: taxFreeDateFor(e.date),
          note: e.note,
        });
        break;
      }
      case "transfer_out": {
        // What actually left the account: the transferred amount plus the
        // network fee on top (CLAUDE.md §3.2) — exactly what the lot
        // allocations of a transfer add up to.
        const leaving = amount.plus(feeBtc);
        if (e.counterpartyAccountId && e.transferGroupId) {
          // Lot-moving transfer: close the allocated source-account lots and
          // stash them for the in-leg(s) of the same group. No disposal — the
          // in-leg re-materializes `amount`, the fee slice stays behind
          // unclaimed and is thereby burned.
          const { parts } = consumeLeaving(leaving, e);
          addTransferConsumption(parts, {
            transferOutTxId: e.id,
            transferGroupId: e.transferGroupId,
            counterpartyAccountId: e.counterpartyAccountId,
            date: e.date,
          });
          const moved = movedByGroup.get(e.transferGroupId) ?? [];
          for (const p of parts) {
            moved.push({
              acquiredDate: p.acquiredDate,
              amountBtc: p.amountBtc,
              costPerBtcEur:
                p.costBasisEur === null ? null : p.costBasisEur.div(p.amountBtc),
            });
          }
          movedByGroup.set(e.transferGroupId, moved);
          break;
        }
        if (e.counterpartyAccountId) {
          // Legacy internal leg (no group): the lots never left the source
          // account's queue, so there is nothing to close here either.
          break;
        }
        // External send: coins leave the ledger without taxable proceeds; the
        // persisted allocations say which lots close, and nothing else does.
        addOtherConsumption(consumeLeaving(leaving, e).parts);
        break;
      }
      case "sell":
      case "spend": {
        // The persisted allocations are the only source: a sell without them
        // closes no lots and is reported as uncovered (§3.2). They cover what
        // actually left the account, i.e. the amount plus the BTC fee.
        const closed = consumeLeaving(amount.plus(feeBtc), e);
        const { sold: parts, fee: feeParts } = splitAtAmount(closed.parts, amount);
        // Whatever is missing is missing from the sale first — the fee tail is
        // the last thing the allocations cover.
        const uncovered = Decimal.min(amount, closed.uncovered);
        addOtherConsumption(parts);
        addOtherConsumption(feeParts);
        const gross =
          e.totalFiatEur != null
            ? dec(e.totalFiatEur)
            : price === null
              ? null
              : amount.mul(price);
        const proceeds = gross === null ? ZERO : gross.minus(dec(e.feeFiatEur));
        let costBasis = ZERO;
        let taxableGain = ZERO;
        let taxFreeGain = ZERO;
        const covered = amount.minus(uncovered);
        for (const p of parts) {
          const partCost = p.costBasisEur ?? ZERO;
          costBasis = costBasis.plus(partCost);
          const partProceeds = covered.gt(0)
            ? proceeds.mul(p.amountBtc).div(covered)
            : ZERO;
          const partGain = partProceeds.minus(partCost);
          if (p.taxFree) taxFreeGain = taxFreeGain.plus(partGain);
          else taxableGain = taxableGain.plus(partGain);
        }
        disposals.push({
          txId: e.id,
          date: e.date,
          type: e.type,
          amountBtc: amount,
          proceedsEur: proceeds,
          costBasisEur: costBasis,
          gainEur: taxableGain.plus(taxFreeGain),
          taxableGainEur: taxableGain,
          taxFreeGainEur: taxFreeGain,
          parts,
          uncoveredBtc: uncovered,
          unresolvedOriginBtc: parts.reduce(
            (s, p) => (p.originUnresolved ? s.plus(p.amountBtc) : s),
            ZERO,
          ),
          note: e.note,
        });
        break;
      }
    }
  }

  const openLots = lots.filter((l) => l.remainingBtc.gt(0));

  let openLotsBtc = ZERO;
  let openCost = ZERO;
  let knownBasisBtc = ZERO;
  for (const lot of openLots) {
    openLotsBtc = openLotsBtc.plus(lot.remainingBtc);
    if (lot.costPerBtcEur !== null) {
      openCost = openCost.plus(lot.costPerBtcEur.mul(lot.remainingBtc));
      knownBasisBtc = knownBasisBtc.plus(lot.remainingBtc);
    }
  }

  let realized = ZERO;
  let realizedTaxable = ZERO;
  let realizedTaxFree = ZERO;
  for (const d of disposals) {
    realized = realized.plus(d.gainEur);
    realizedTaxable = realizedTaxable.plus(d.taxableGainEur);
    realizedTaxFree = realizedTaxFree.plus(d.taxFreeGainEur);
  }

  // A lot-creating tx can have several queue entries sharing one id (a
  // bundled transfer_in re-creates one per origin lot) — aggregate by id
  // before judging whether the whole thing is closed and how.
  const partsByTxId = new Map<string, OpenLot[]>();
  for (const lot of lots) {
    const arr = partsByTxId.get(lot.txId) ?? [];
    arr.push(lot);
    partsByTxId.set(lot.txId, arr);
  }
  const fullyTransferredLots = new Map<string, FullyTransferredLot>();
  for (const [txId, parts] of partsByTxId) {
    const remaining = parts.reduce((s, l) => s.plus(l.remainingBtc), ZERO);
    if (remaining.gt(0)) continue; // still (partially) open
    if ((otherConsumedBtc.get(txId) ?? ZERO).gt(0)) continue; // sold/spent/sent externally too
    const transfers = transferConsumed.get(txId);
    if (!transfers?.length) continue; // never consumed at all
    fullyTransferredLots.set(txId, {
      amountBtc: transfers.reduce((s, t) => s.plus(t.amountBtc), ZERO),
      transfers,
    });
  }

  return {
    openLots,
    disposals,
    openLotsBtc,
    openCostBasisEur: openCost,
    openBasisBtc: knownBasisBtc,
    avgCostPerBtcEur: knownBasisBtc.gt(0) ? openCost.div(knownBasisBtc) : null,
    realizedGainEur: realized,
    realizedTaxableGainEur: realizedTaxable,
    realizedTaxFreeGainEur: realizedTaxFree,
    fullyTransferredLots,
  };
}

// Both take anything carrying a taxFreeDate, so a provenance row (whose date
// comes from `taxFreeDateOf`) is judged by exactly the same rule as an open lot.
export function daysUntilTaxFree(
  lot: { taxFreeDate: Date },
  now: Date = new Date(),
): number {
  return Math.max(0, Math.ceil((lot.taxFreeDate.getTime() - now.getTime()) / MS_PER_DAY));
}

export function isLotTaxFree(
  lot: { taxFreeDate: Date },
  now: Date = new Date(),
): boolean {
  return now.getTime() >= lot.taxFreeDate.getTime();
}
