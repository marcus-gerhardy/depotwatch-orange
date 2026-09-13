// One-off conversions applied to a portfolio file when it is opened.
//
// Pure functions over the file, deliberately outside the store: the store is a
// browser thing (zustand, localStorage, the file handles), and a migration has
// to be runnable anywhere the file is — a test, and the validation script in
// scripts/validate-portfolio.ts, which reads a real file exactly the way the
// app does.

import { Decimal, dec, ZERO } from "./decimal";
import type { PortfolioFile, Transaction } from "./types";

/**
 * Files written before the fee convention was unified (CLAUDE.md §3.2) stored
 * an internal transfer_out *including* its network fee: `amountBtc` was the
 * gross amount that left the account and the lot allocations summed to exactly
 * that, while the in-leg recorded `amountBtc − feeBtc`. Now `amountBtc` is what
 * arrives and `feeBtc` sits on top (allocations sum to `amountBtc + feeBtc`),
 * so such a leg has to give up the fee from its amount — otherwise the fee
 * would be charged twice.
 *
 * **The arrival decides, wherever there is one.** Under the current convention
 * two paired legs carry the same `amountBtc`, and under the old one the
 * arrival was short by exactly the fee — so the in-leg is direct evidence of
 * which shape a file is in, and it is asked first.
 *
 * The allocations are only a *fallback*, for a leg whose arrival is missing
 * (a half-imported transfer). On their own they are ambiguous: allocations
 * summing to `amountBtc` are equally what a legacy file looks like and what a
 * current file looks like when the fee was filled in after the lots were
 * assigned (§3.2). Reading that as legacy silently shrank the recorded
 * transfer amount, which left the arrival claiming more than the send ever
 * moved — the file quietly gaining the fee instead of paying it. Such a leg is
 * left exactly as it is, and the repair in `lib/feeAllocation.ts` closes the
 * assignment instead.
 */
export function migrateTransferFeeConvention(p: PortfolioFile): PortfolioFile {
  const inLegByGroup = new Map<string, Decimal>();
  for (const w of p.wallets) {
    for (const a of w.accounts) {
      for (const t of a.transactions) {
        if (t.type === "transfer_in" && t.transferGroupId) {
          inLegByGroup.set(
            t.transferGroupId,
            (inLegByGroup.get(t.transferGroupId) ?? ZERO).plus(dec(t.amountBtc)),
          );
        }
      }
    }
  }

  const isLegacyGross = (t: Transaction): boolean => {
    if (t.type !== "transfer_out" || !t.counterpartyAccountId) return false;
    const fee = dec(t.feeBtc);
    if (!fee.gt(0)) return false;
    const amount = dec(t.amountBtc);
    const arrived = t.transferGroupId
      ? inLegByGroup.get(t.transferGroupId)
      : undefined;
    // The arrival is the evidence: short by the fee means the old shape, equal
    // means the current one, whatever the allocations happen to say.
    if (arrived !== undefined) return arrived.eq(amount.minus(fee));
    if (t.lotAllocations?.length) {
      const allocated = t.lotAllocations.reduce(
        (s, a) => s.plus(dec(a.amountBtc)),
        ZERO,
      );
      return allocated.eq(amount);
    }
    return false;
  };

  let changed = false;
  const wallets = p.wallets.map((w) => ({
    ...w,
    accounts: w.accounts.map((a) => ({
      ...a,
      transactions: a.transactions.map((t) => {
        if (!isLegacyGross(t)) return t;
        changed = true;
        return { ...t, amountBtc: dec(t.amountBtc).minus(dec(t.feeBtc)).toString() };
      }),
    })),
  }));
  return changed ? { ...p, wallets } : p;
}
