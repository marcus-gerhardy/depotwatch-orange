import { describe, expect, it, vi } from "vitest";
import { createEurValuator, suggestEurValuation } from "./valuation";

describe("suggestEurValuation", () => {
  it("values the amount at the day's close", async () => {
    const result = await suggestEurValuation("2024-01-05T14:30:00.000Z", "0.25", async () =>
      40000.5,
    );
    expect(result).toEqual({ pricePerBtcEur: "40000.50", totalFiatEur: "10000.13" });
  });

  it("returns null without a usable amount, date or price", async () => {
    const close = async () => 40000;
    expect(await suggestEurValuation("2024-01-05", "0", close)).toBeNull();
    expect(await suggestEurValuation("no date", "0.5", close)).toBeNull();
    expect(await suggestEurValuation("2024-01-05", "0.5", async () => null)).toBeNull();
  });
});

describe("createEurValuator", () => {
  it("fetches each day once, however many rows fall on it", async () => {
    const close = vi.fn(async () => 50000);
    const valuate = createEurValuator(close);

    const results = await Promise.all([
      valuate("2024-01-05T08:00:00.000Z", "0.1"),
      valuate("2024-01-05T22:00:00.000Z", "0.2"),
      valuate("2024-01-06T08:00:00.000Z", "0.3"),
    ]);

    expect(close).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r?.totalFiatEur)).toEqual([
      "5000.00",
      "10000.00",
      "15000.00",
    ]);
  });

  it("does not swallow a failing lookup", async () => {
    const valuate = createEurValuator(async () => {
      throw new Error("rate limited");
    });
    await expect(valuate("2024-01-05", "0.5")).rejects.toThrow("rate limited");
  });
});
