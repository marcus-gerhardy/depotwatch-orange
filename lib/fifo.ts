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
}

export interface DisposalPart {
  lotTxId: string;
  acquiredDate: string;
  amountBtc: Decimal;
  costBasisEur: Decimal | null;
  holdingDays: number;
  taxFree: boolean;
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
  /** Note of the disposing transaction. */
  note: string;
}

export interface FifoResult {
  openLots: OpenLot[];
  disposals: Disposal[];
  totalBtc: Decimal;
  /** Cost basis of open lots with known basis. */
  openCostBasisEur: Decimal;
  /** Average cost per BTC over open lots with known basis. */
  avgCostPerBtcEur: Decimal | null;
  realizedGainEur: Decimal;
  realizedTaxableGainEur: Decimal;
  realizedTaxFreeGainEur: Decimal;
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

  const taxFreeDateFor = (acquired: string) =>
    new Date(new Date(acquired).getTime() + (holdingPeriodDays + 1) * MS_PER_DAY);

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
    };
  }

  /**
   * Consume `amount` BTC oldest-lot-first; returns consumed parts. With
   * `accountId` only that account's lots are touched (lot-moving transfers
   * must not drain other accounts).
   */
  function consumeFifo(
    amount: Decimal,
    disposedDate: string,
    accountId?: string,
  ): {
    parts: DisposalPart[];
    uncovered: Decimal;
  } {
    const parts: DisposalPart[] = [];
    let remaining = amount;
    for (const lot of lots) {
      if (remaining.lte(0)) break;
      if (lot.remainingBtc.lte(0)) continue;
      if (accountId && lot.accountId !== accountId) continue;
      const take = Decimal.min(remaining, lot.remainingBtc);
      parts.push(takePart(lot, take, disposedDate));
      remaining = remaining.minus(take);
    }
    return { parts, uncovered: remaining };
  }

  /**
   * Consume exactly the persisted allocations (capped at the disposal amount).
   * Missing/short lots (e.g. the referenced buy was deleted) become uncovered,
   * as does any disposal remainder the allocations don't cover.
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

  for (const e of entries) {
    const amount = dec(e.amountBtc);
    const feeBtc = dec(e.feeBtc);
    const price = e.pricePerBtcEur === null ? null : dec(e.pricePerBtcEur);

    switch (e.type) {
      case "buy": {
        // Net BTC received; fiat fee raises the cost basis. The actually paid
        // total (when recorded) beats the price × amount approximation.
        const net = amount.minus(feeBtc);
        if (net.lte(0)) break;
        const gross =
          e.totalFiatEur != null
            ? dec(e.totalFiatEur)
            : price === null
              ? null
              : amount.mul(price);
        const totalCost = gross === null ? null : gross.plus(dec(e.feeFiatEur));
        lots.push({
          txId: e.id,
          acquiredDate: e.date,
          accountId: e.accountId,
          walletName: e.walletName,
          accountName: e.accountName,
          originalAmountBtc: net,
          remainingBtc: net,
          costPerBtcEur: totalCost === null ? null : totalCost.div(net),
          taxFreeDate: taxFreeDateFor(e.date),
          note: e.note,
        });
        break;
      }
      case "transfer_in": {
        if (e.counterpartyAccountId) {
          const moved = e.transferGroupId
            ? movedByGroup.get(e.transferGroupId)
            : undefined;
          // Legacy internal leg (no group): the lots never left the source
          // account's queue — nothing to re-create here.
          if (!moved) break;
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
            // starts a fresh lot with unknown basis at the arrival date.
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
        if (e.counterpartyAccountId && e.transferGroupId) {
          // Lot-moving transfer: close the allocated source-account lots and
          // stash them for the in-leg(s) of the same group. No disposal, no
          // separate fee consumption — the in-leg re-materializes the amount
          // net of the fee.
          const { parts } = e.lotAllocations?.length
            ? consumeAllocated(e.lotAllocations, amount, e.date)
            : consumeFifo(amount, e.date, e.accountId);
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
          // Legacy internal leg: no disposal, no lot movement. Only the
          // network fee leaves the portfolio.
          if (feeBtc.gt(0)) consumeFifo(feeBtc, e.date);
          break;
        }
        // External send: coins leave the ledger without taxable proceeds;
        // persisted allocations pin which lots close. As with internal
        // transfers, the BTC fee is part of amountBtc — no extra consumption.
        if (e.lotAllocations?.length) {
          consumeAllocated(e.lotAllocations, amount, e.date);
        } else if (amount.gt(0)) {
          consumeFifo(amount, e.date);
        }
        break;
      }
      case "sell":
      case "spend": {
        // Persisted allocations are authoritative; legacy sells without them
        // fall back to dynamic FIFO.
        const { parts, uncovered } = e.lotAllocations?.length
          ? consumeAllocated(e.lotAllocations, amount, e.date)
          : consumeFifo(amount, e.date);
        if (feeBtc.gt(0)) consumeFifo(feeBtc, e.date); // fee BTC leaves too
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
          note: e.note,
        });
        break;
      }
    }
  }

  const openLots = lots.filter((l) => l.remainingBtc.gt(0));

  let totalBtc = ZERO;
  let openCost = ZERO;
  let knownBasisBtc = ZERO;
  for (const lot of openLots) {
    totalBtc = totalBtc.plus(lot.remainingBtc);
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

  return {
    openLots,
    disposals,
    totalBtc,
    openCostBasisEur: openCost,
    avgCostPerBtcEur: knownBasisBtc.gt(0) ? openCost.div(knownBasisBtc) : null,
    realizedGainEur: realized,
    realizedTaxableGainEur: realizedTaxable,
    realizedTaxFreeGainEur: realizedTaxFree,
  };
}

/**
 * FIFO allocation for a new disposal: oldest lot first, split across lots as
 * needed. Lots of `preferredAccountId` (the sell's account) are consumed
 * before lots of other accounts; if the amount exceeds all open lots, the
 * remainder simply stays unallocated (reported as uncovered by computeFifo).
 */
export function allocateFifo(
  openLots: OpenLot[],
  amount: Decimal,
  preferredAccountId?: string,
): LotAllocation[] {
  const ordered = preferredAccountId
    ? [
        ...openLots.filter((l) => l.accountId === preferredAccountId),
        ...openLots.filter((l) => l.accountId !== preferredAccountId),
      ]
    : openLots;
  const out: LotAllocation[] = [];
  let remaining = amount;
  for (const lot of ordered) {
    if (remaining.lte(0)) break;
    if (lot.remainingBtc.lte(0)) continue;
    const take = Decimal.min(remaining, lot.remainingBtc);
    const last = out[out.length - 1];
    if (last && last.lotTransactionId === lot.txId) {
      // Several queue lots can share one transaction id (multi-lot
      // transfer_in) — collapse them into a single allocation entry.
      last.amountBtc = dec(last.amountBtc).plus(take).toString();
    } else {
      out.push({ lotTransactionId: lot.txId, amountBtc: take.toString() });
    }
    remaining = remaining.minus(take);
  }
  return out;
}

export function daysUntilTaxFree(lot: OpenLot, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((lot.taxFreeDate.getTime() - now.getTime()) / MS_PER_DAY));
}

export function isLotTaxFree(lot: OpenLot, now: Date = new Date()): boolean {
  return now.getTime() >= lot.taxFreeDate.getTime();
}
