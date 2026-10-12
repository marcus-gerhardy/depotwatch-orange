/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "../decimal";
import { addCalendarDays, addCalendarMonths } from "../dates";
import { purchaseDates, nthPurchaseDate } from "./schedule";
import { xirr } from "./irr";
import { fitPowerLaw, projectPrice, daysSinceGenesis, type PowerLawParams } from "./powerLaw";
import {
  simulateDca,
  purchasePrice,
  valuationPrice,
  usesProjection,
  type DcaPlan,
  type PriceHistory,
} from "./simulate";
import { combineSeries, clearPriceCache, loadPriceHistory } from "./prices";
import { readStoredPlan, storePlan } from "./storage";

const d = (v: string | number) => new Decimal(v);

/** A flat history: every day from `from` to `to` at `price`. */
function flat(from: string, to: string, price: string, skip: string[] = []): PriceHistory {
  const days: string[] = [];
  for (let day = from; day <= to; day = addCalendarDays(day, 1)) {
    if (!skip.includes(day)) days.push(day);
  }
  return {
    days,
    closes: days.map(() => d(price)),
    sources: days.map(() => "binance-eur" as const),
  };
}

const model: PowerLawParams = { intercept: -17, slope: 5.8, band: 0.3 };

describe("schedule", () => {
  it("steps by days for daily, weekly and biweekly plans", () => {
    expect(purchaseDates("2024-01-01", "2024-01-03", "daily")).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
    expect(purchaseDates("2024-01-01", "2024-01-29", "weekly")).toHaveLength(5);
    expect(purchaseDates("2024-01-01", "2024-01-29", "biweekly")).toEqual([
      "2024-01-01",
      "2024-01-15",
      "2024-01-29",
    ]);
  });

  it("includes both ends and returns nothing for a reversed range", () => {
    expect(purchaseDates("2024-03-01", "2024-03-01", "monthly")).toEqual(["2024-03-01"]);
    expect(purchaseDates("2024-03-02", "2024-03-01", "daily")).toEqual([]);
  });

  it("clamps the 31st to shorter months without drifting", () => {
    expect(purchaseDates("2024-01-31", "2024-06-30", "monthly")).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
      "2024-04-30",
      "2024-05-31",
      "2024-06-30",
    ]);
    expect(nthPurchaseDate("2023-01-31", "monthly", 1)).toBe("2023-02-28");
    expect(purchaseDates("2024-11-30", "2025-08-31", "quarterly")).toEqual([
      "2024-11-30",
      "2025-02-28",
      "2025-05-30",
      "2025-08-30",
    ]);
  });

  it("adds months across year ends, backwards too", () => {
    expect(addCalendarMonths("2024-12-15", 1)).toBe("2025-01-15");
    expect(addCalendarMonths("2024-03-31", -1)).toBe("2024-02-29");
    expect(addCalendarMonths("2024-01-31", 13)).toBe("2025-02-28");
  });
});

describe("xirr", () => {
  it("finds 10 % for one deposit growing 10 % in a year", () => {
    const r = xirr([
      { day: 0, amount: d(-1000) },
      { day: 365, amount: d(1100) },
    ]);
    expect(r!.toNumber()).toBeCloseTo(0.1, 8);
  });

  it("handles losses and several deposits", () => {
    const loss = xirr([
      { day: 0, amount: d(-1000) },
      { day: 365, amount: d(500) },
    ]);
    expect(loss!.toNumber()).toBeCloseTo(-0.5, 8);

    // Two deposits of 100, valued at 210 after a year: the second only worked
    // half a year, so the rate is above the simple 5 %.
    const r = xirr([
      { day: 0, amount: d(-100) },
      { day: 182, amount: d(-100) },
      { day: 365, amount: d(210) },
    ])!;
    const npv =
      -100 - 100 / (1 + r.toNumber()) ** (182 / 365) + 210 / (1 + r.toNumber());
    expect(npv).toBeCloseTo(0, 6);
    expect(r.toNumber()).toBeGreaterThan(0.05);
  });

  it("has no answer without money in or out", () => {
    expect(xirr([{ day: 0, amount: d(-100) }])).toBeNull();
    expect(xirr([{ day: 0, amount: d(-100) }, { day: 30, amount: d(0) }])).toBeNull();
  });

  it("is fast enough for a daily plan over ten years", () => {
    const flows = Array.from({ length: 3650 }, (_, i) => ({ day: i, amount: d(-10) }));
    flows.push({ day: 3650, amount: d(80_000) });
    const t0 = performance.now();
    expect(xirr(flows)).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe("power law", () => {
  it("recovers the parameters of an exact power law", () => {
    const days = ["2018-01-01", "2020-06-01", "2023-01-01", "2025-06-01"];
    const closes = days.map((day) => d(10 ** (-16 + 5.5 * Math.log10(daysSinceGenesis(day)))));
    const fit = fitPowerLaw(days, closes);
    expect(fit.slope).toBeCloseTo(5.5, 6);
    expect(fit.intercept).toBeCloseTo(-16, 5);
    expect(fit.residualSd).toBeCloseTo(0, 6);
  });

  it("puts the band symmetric around the mean in log space", () => {
    const mean = projectPrice(model, "2030-01-01", "mean");
    const lower = projectPrice(model, "2030-01-01", "lower");
    const upper = projectPrice(model, "2030-01-01", "upper");
    expect(mean.div(lower).toNumber()).toBeCloseTo(10 ** 0.3, 6);
    expect(upper.div(mean).toNumber()).toBeCloseTo(10 ** 0.3, 6);
  });
});

describe("history and projection", () => {
  const history = flat("2024-01-01", "2024-01-10", "50000", ["2024-01-05"]);

  it("uses the close up to the last history day, the model after it", () => {
    expect(purchasePrice(history, model, "mean", "2024-01-10").origin).toBe("history");
    const next = purchasePrice(history, model, "mean", "2024-01-11");
    expect(next.origin).toBe("projection");
    expect(next.price.eq(projectPrice(model, "2024-01-11"))).toBe(true);
  });

  it("buys at the next available candle across a gap", () => {
    const p = purchasePrice(history, model, "mean", "2024-01-05");
    expect(p.priceDay).toBe("2024-01-06");
    expect(p.origin).toBe("history");
  });

  it("values at the latest close on or before the end, never a later one", () => {
    expect(valuationPrice(history, model, "mean", "2024-01-05").priceDay).toBe("2024-01-04");
    expect(valuationPrice(history, model, "mean", "2024-01-11").origin).toBe("projection");
  });

  it("splits a plan at the boundary and counts each side", () => {
    const plan: DcaPlan = {
      oneTimeEur: "1000",
      recurringEur: "100",
      interval: "daily",
      start: "2024-01-08",
      end: "2024-01-12",
      feePercent: "1",
    };
    const result = simulateDca(plan, history, model);
    expect(result.purchases).toHaveLength(6);
    expect(result.historyPurchases).toBe(4); // one-off + 8th, 9th, 10th
    expect(result.projectedPurchases).toBe(2);
    expect(usesProjection(result)).toBe(true);
    expect(result.endPriceOrigin).toBe("projection");
  });
});

describe("simulation", () => {
  const history = flat("2024-01-01", "2024-12-31", "40000");
  const plan: DcaPlan = {
    oneTimeEur: "",
    recurringEur: "100",
    interval: "monthly",
    start: "2024-01-31",
    end: "2024-12-31",
    feePercent: "1.5",
  };

  it("adds up amounts, fees and quantity in Decimal", () => {
    const r = simulateDca(plan, history, model);
    expect(r.purchases).toHaveLength(12);
    expect(r.invested.toString()).toBe("1200");
    expect(r.fees.toString()).toBe("18");
    expect(r.btc.toString()).toBe(d(1182).div(40000).toString());
    expect(r.endValue.toString()).toBe("1182");
    expect(r.pnl.toString()).toBe("-18");
    expect(r.averagePrice!.toString()).toBe("40000");
    expect(r.effectivePrice!.gt(40000)).toBe(true);
    expect(r.simpleReturn!.toString()).toBe("-0.015");
    expect(r.irr!.isNegative()).toBe(true);
    expect(usesProjection(r)).toBe(false);
  });

  it("weights the average price by quantity", () => {
    const h: PriceHistory = {
      days: ["2024-01-01", "2024-01-02"],
      closes: [d(10000), d(40000)],
      sources: ["binance-eur", "binance-eur"],
    };
    const r = simulateDca(
      { ...plan, interval: "daily", start: "2024-01-01", end: "2024-01-02", feePercent: "0" },
      h,
      model,
    );
    // 0.01 + 0.0025 BTC for 200 € → 16 000, not the plain mean of 25 000.
    expect(r.averagePrice!.toString()).toBe("16000");
  });

  it("returns empty figures for a plan without money", () => {
    const r = simulateDca({ ...plan, recurringEur: "0" }, history, model);
    expect(r.purchases).toHaveLength(0);
    expect(r.averagePrice).toBeNull();
    expect(r.simpleReturn).toBeNull();
    expect(r.irr).toBeNull();
  });
});

describe("price sources", () => {
  it("converts USDT closes with the last ECB rate and joins without overlap", () => {
    const rates = new Map([
      ["2019-12-27", d("1.1")],
      ["2019-12-30", d("1.2")],
    ]);
    const { history, segments } = combineSeries(
      [
        { day: "2020-01-03", close: "6500" },
        { day: "2020-01-04", close: "6600" },
      ],
      [
        { day: "2019-12-28", close: "7700" }, // Saturday → Friday's rate
        { day: "2019-12-30", close: "7200" },
        { day: "2020-01-03", close: "9999" }, // overlaps EUR, dropped
      ],
      rates,
    );
    expect(history.days).toEqual(["2019-12-28", "2019-12-30", "2020-01-03", "2020-01-04"]);
    expect(history.closes[0].toString()).toBe("7000");
    expect(history.closes[1].toString()).toBe("6000");
    expect(segments).toEqual([
      { source: "binance-usdt-ecb", from: "2019-12-28", to: "2019-12-30" },
      { source: "binance-eur", from: "2020-01-03", to: "2020-01-04" },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPriceCache();
  });

  it("pages through candles, skips the running day, and caches the series", async () => {
    const day = 86_400_000;
    const now = Date.now();
    const todayStart = Math.floor(now / day) * day;
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.hostname === "api.frankfurter.dev") {
        return new Response(JSON.stringify({ rates: {} }));
      }
      const start = Number(u.searchParams.get("startTime"));
      const symbol = u.searchParams.get("symbol");
      if (symbol === "BTCUSDT") return new Response("[]");
      // BTC/EUR from 1000 days ago: one full page, then the rest incl. today.
      const first = todayStart - 1500 * day;
      const from = Math.max(start, first);
      const rows = [];
      for (let t = from; t <= todayStart && rows.length < 1000; t += day) {
        rows.push([t, "1", "1", "1", "50000", "0", t + day - 1]);
      }
      return new Response(JSON.stringify(rows));
    });
    vi.stubGlobal("fetch", fetchMock);

    const progress: number[] = [];
    const loaded = await loadPriceHistory((p) => progress.push(p.done));
    expect(loaded.days).toHaveLength(1500); // today's running candle left out
    expect(loaded.segments).toHaveLength(1);
    expect(progress.at(-1)).toBeGreaterThan(0);
    const calls = fetchMock.mock.calls.length;

    await loadPriceHistory(() => {});
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});

describe("stored inputs", () => {
  it("round-trips a plan and rejects anything malformed", () => {
    const plan: DcaPlan = {
      oneTimeEur: "500",
      recurringEur: "50",
      interval: "weekly",
      start: "2021-01-01",
      end: "2030-12-31",
      feePercent: "0.5",
    };
    storePlan(plan);
    expect(readStoredPlan()).toEqual(plan);
    localStorage.setItem("depotwatch.dcaCalculator.v1", JSON.stringify({ ...plan, start: "x" }));
    expect(readStoredPlan()).toBeNull();
  });
});
