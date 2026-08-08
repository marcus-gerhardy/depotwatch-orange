import { describe, expect, it } from "vitest";
import {
  BTC_PER_PIZZA,
  feeMood,
  formatPizzas,
  isGenesisDay,
  isPizzaDay,
  isRunningBitcoinDay,
  pizzasFor,
} from "./easterEggs";
import { dec } from "./decimal";

/** A local-time date, since the day-of effects follow the user's own clock. */
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe("the day-of effects appear on their day and no other", () => {
  it("pizza day is 22 May", () => {
    expect(isPizzaDay(local(2026, 5, 22))).toBe(true);
    expect(isPizzaDay(local(2026, 5, 21, 23))).toBe(false);
    expect(isPizzaDay(local(2026, 5, 23, 0))).toBe(false);
  });

  it("genesis is 3 January, Hal Finney's tweet 10 January", () => {
    expect(isGenesisDay(local(2027, 1, 3))).toBe(true);
    expect(isGenesisDay(local(2027, 1, 10))).toBe(false);
    expect(isRunningBitcoinDay(local(2027, 1, 10))).toBe(true);
    expect(isRunningBitcoinDay(local(2027, 1, 3))).toBe(false);
  });

  it("is judged in local time, not UTC", () => {
    // Late on 21 May in the user's timezone is not pizza day yet, however the
    // same instant reads in UTC.
    expect(isPizzaDay(local(2026, 5, 21, 23))).toBe(false);
    expect(isPizzaDay(local(2026, 5, 22, 0))).toBe(true);
  });
});

describe("pizzas", () => {
  it("uses the 2010 rate: 10 000 BTC for two", () => {
    expect(BTC_PER_PIZZA).toBe(5000);
    expect(pizzasFor("10000").toString()).toBe("2");
    expect(pizzasFor("5000").toString()).toBe("1");
  });

  it("keeps a normal stack readable instead of rounding it to zero", () => {
    // 0.618 BTC is 0.0001236 pizzas — "0,00" would be the whole point lost.
    expect(formatPizzas(pizzasFor("0.618"), "de-DE")).toBe("0,000124");
  });
});

describe("fee comment", () => {
  it("moves through the rates in one direction only", () => {
    const moods = [1, 2, 3, 10, 11, 50, 51, 150, 151, 900].map(feeMood);
    expect(moods).toEqual([
      "veryLow",
      "veryLow",
      "low",
      "low",
      "normal",
      "normal",
      "high",
      "high",
      "veryHigh",
      "veryHigh",
    ]);
  });

  it("has a comment for every mood", () => {
    // Guards against a rate that would render an untranslated key.
    for (const rate of [0, 1, 5, 25, 100, 500, 5000]) {
      expect(["veryLow", "low", "normal", "high", "veryHigh"]).toContain(feeMood(rate));
    }
  });
});

describe("sats display", () => {
  it("rounds to whole satoshis, the smallest unit there is", async () => {
    const { satsOf, formatSats, formatAmount, amountUnit } = await import("./displayUnit");
    expect(satsOf("1")).toBe(100_000_000);
    expect(satsOf("0.000000005")).toBe(1); // half a sat rounds up
    expect(formatSats("0.61805", "de-DE")).toBe("61.805.000");
    expect(formatAmount("0.5", "de-DE", "BTC")).toBe("50.000.000 sats");
    expect(formatAmount("0.5", "de-DE", "EUR")).toBe("0,50000000 BTC");
    expect(amountUnit("BTC")).toBe("sats");
    expect(amountUnit("USD")).toBe("BTC");
  });

  it("never lets the display unit touch a stored value", async () => {
    // The ledger keeps BTC decimal strings; sats are a rendering, so the value
    // a comparison or a sum sees is the same in either mode.
    const { satsOf } = await import("./displayUnit");
    const btc = dec("0.61805");
    expect(satsOf(btc)).toBe(61_805_000);
    expect(btc.toString()).toBe("0.61805");
  });
});
