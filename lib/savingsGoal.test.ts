// A savings target, and what may be said about it (§4.4).
//
// The tests worth having are about restraint: what the figure does when the
// goal is overshot, when the date has passed, when there is no history to
// project from. Every one of those is a place where a plausible-looking
// number would be wrong or, worse, would read as a judgement.

import { describe, expect, it } from "vitest";
import { goalProgress } from "./savingsGoal";
import { dec } from "./decimal";
import type { LedgerEntry } from "./types";

const NOW = new Date("2026-07-01T00:00:00.000Z");

const entries = (firstDate: string): LedgerEntry[] => [
  {
    id: "b1",
    type: "buy",
    date: firstDate,
    amountBtc: "0.1",
    pricePerBtcEur: "40000",
    note: "",
    walletId: "w1",
    walletName: "W",
    accountId: "a1",
    accountName: "A",
  },
];

describe("progress towards a target", () => {
  it("reports how far along and what is left", () => {
    const p = goalProgress({ targetBtc: "1" }, dec("0.25"), entries("2026-01-01T00:00:00.000Z"), NOW)!;
    expect(p.fraction).toBeCloseTo(0.25, 10);
    expect(p.remainingBtc.toString()).toBe("0.75");
    expect(p.reached).toBe(false);
  });

  it("treats an overshot target as reached, not as 130 per cent", () => {
    const p = goalProgress({ targetBtc: "1" }, dec("1.3"), entries("2026-01-01T00:00:00.000Z"), NOW)!;
    expect(p.reached).toBe(true);
    expect(p.fraction).toBe(1);
    // Nothing left to save, so no rate and no projection to state.
    expect(p.remainingBtc.toString()).toBe("0");
    expect(p.projectedDate).toBeNull();
  });

  it("is nothing at all without a target amount", () => {
    expect(goalProgress({ targetBtc: "0" }, dec("1"), entries("2026-01-01T00:00:00.000Z"), NOW)).toBeNull();
  });
});

describe("a target with a date", () => {
  it("states the rate the remaining months would need", () => {
    // Half a coin missing, half a year left. Six *calendar* months are 184
    // days, i.e. 6.05 average months — so the rate is 0.0827, not the 0.0833
    // that assuming 30-day months would give.
    const p = goalProgress(
      { targetBtc: "1", targetDate: "2027-01-01T00:00:00.000Z" },
      dec("0.5"),
      entries("2026-01-01T00:00:00.000Z"),
      NOW,
    )!;
    expect(p.byDate!.requiredBtcPerMonth!.toNumber()).toBeCloseTo(0.0827, 4);
    expect(p.byDate!.overdue).toBe(false);
  });

  it("states no rate once the date has passed", () => {
    // "Save the rest in zero months" is a division by zero dressed up as
    // advice. The date is simply reported as past.
    const p = goalProgress(
      { targetBtc: "1", targetDate: "2026-01-01T00:00:00.000Z" },
      dec("0.5"),
      entries("2025-01-01T00:00:00.000Z"),
      NOW,
    )!;
    expect(p.byDate!.requiredBtcPerMonth).toBeNull();
    expect(p.byDate!.overdue).toBe(true);
  });

  it("is not overdue when the target was reached in time", () => {
    const p = goalProgress(
      { targetBtc: "1", targetDate: "2026-01-01T00:00:00.000Z" },
      dec("1"),
      entries("2025-01-01T00:00:00.000Z"),
      NOW,
    )!;
    expect(p.byDate!.overdue).toBe(false);
  });
});

describe("the projection", () => {
  it("follows the pace so far", () => {
    // 0.5 BTC in six months is 1/12 a month; the missing 0.5 takes six more.
    const p = goalProgress(
      { targetBtc: "1" },
      dec("0.5"),
      entries("2026-01-01T00:00:00.000Z"),
      NOW,
    )!;
    expect(p.paceBtcPerMonth!.toNumber()).toBeCloseTo(1 / 12, 2);
    expect(p.projectedDate!.getFullYear()).toBe(2026);
    expect(p.projectedDate!.getMonth()).toBe(11); // December
  });

  it("says nothing where there is nothing to extrapolate from", () => {
    // Zero held: any projection would be "never", which is not information.
    const p = goalProgress({ targetBtc: "1" }, dec("0"), entries("2026-01-01T00:00:00.000Z"), NOW)!;
    expect(p.paceBtcPerMonth).toBeNull();
    expect(p.projectedDate).toBeNull();
  });
});
