/** @vitest-environment jsdom */
// The spot price is fetched in one place and read everywhere: however many
// components subscribe, one pair of requests per refresh — and none at all
// while the tab is hidden, the app is locked, or the source asked for a pause.

import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import * as binance from "./binance";
import { refreshPricesNow, resetPriceFeed, usePriceFeed, type PriceFeedState } from "./priceFeed";
import { useAppStore } from "./store";
import { emptyPortfolio } from "./types";

let seen: PriceFeedState | null = null;

function Reader() {
  const feed = usePriceFeed();
  useEffect(() => {
    seen = feed;
  });
  return null;
}

function renderReaders(n = 1) {
  return render(
    <>
      {Array.from({ length: n }, (_, i) => (
        <Reader key={i} />
      ))}
    </>,
  );
}

const flush = () => act(async () => {});
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetPriceFeed();
  seen = null;
  setVisibility("visible");
  useAppStore.setState({ locked: false, portfolio: emptyPortfolio() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("price feed", () => {
  it("costs one pair of requests however many components read it", async () => {
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockResolvedValue(50_000);
    renderReaders(5);
    await flush();
    expect(spot).toHaveBeenCalledTimes(2);
    expect(seen?.prices).toEqual({ eur: 50_000, usd: 50_000 });
  });

  it("refreshes on the interval, once for everybody", async () => {
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockResolvedValue(50_000);
    renderReaders(3);
    await flush();
    spot.mockClear();

    await advance(30_000);
    expect(spot).not.toHaveBeenCalled();
    await advance(31_000);
    expect(spot).toHaveBeenCalledTimes(2);
  });

  it("follows the interval set in the file", async () => {
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockResolvedValue(50_000);
    const p = emptyPortfolio();
    p.uiSettings = { priceRefresh: 15 };
    useAppStore.setState({ portfolio: p });
    renderReaders();
    await flush();
    spot.mockClear();
    await advance(16_000);
    expect(spot).toHaveBeenCalledTimes(2);
  });

  it("pauses while the tab is hidden and refreshes once on return", async () => {
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockResolvedValue(50_000);
    renderReaders();
    await flush();
    spot.mockClear();

    setVisibility("hidden");
    await advance(10 * 60_000);
    expect(spot).not.toHaveBeenCalled();

    await act(async () => setVisibility("visible"));
    expect(spot).toHaveBeenCalledTimes(2);
  });

  it("fetches nothing while the app is locked", async () => {
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockResolvedValue(50_000);
    renderReaders();
    await flush();
    spot.mockClear();

    useAppStore.setState({ locked: true });
    await advance(10 * 60_000);
    expect(spot).not.toHaveBeenCalled();
    act(() => refreshPricesNow());
    expect(spot).not.toHaveBeenCalled();
  });

  it("keeps the last price on a failure and backs off a rate limit", async () => {
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockResolvedValue(50_000);
    renderReaders();
    await flush();

    spot.mockReset();
    spot.mockRejectedValue(new binance.PriceHttpError(429, null));
    await advance(60_000);
    expect(spot).toHaveBeenCalled();
    expect(seen?.failure).toBe("rateLimit");
    // Never emptied: the last good reading stays on screen.
    expect(seen?.prices).toEqual({ eur: 50_000, usd: 50_000 });

    // The rate-limit backoff (60 s) outlasts the interval's next tick…
    spot.mockClear();
    await advance(50_000);
    expect(spot).not.toHaveBeenCalled();
    // …and a click does not cut it short.
    act(() => refreshPricesNow());
    expect(spot).not.toHaveBeenCalled();

    spot.mockResolvedValue(51_000);
    await advance(11_000);
    expect(spot).toHaveBeenCalledTimes(2);
    expect(seen?.failure).toBeNull();
    expect(seen?.prices?.eur).toBe(51_000);
  });

  it("marks which way the price moved", async () => {
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockResolvedValue(50_000);
    renderReaders();
    await flush();
    expect(seen?.direction).toBeNull();

    spot.mockResolvedValue(49_000);
    await advance(60_000);
    expect(seen?.direction).toBe("down");
    expect(seen?.changeSeq).toBe(1);
  });

  it("starts from the price remembered in the browser, never from the file", async () => {
    localStorage.setItem(
      "depotwatch.lastPrice.v1",
      JSON.stringify({ eur: 40_000, usd: 43_000, at: Date.now() - 10_000 }),
    );
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockRejectedValue(new TypeError("offline"));
    renderReaders();
    await flush();
    expect(seen?.prices).toEqual({ eur: 40_000, usd: 43_000 });
    expect(seen?.remembered).toBe(true);
    expect(spot).not.toHaveBeenCalled();
    expect(useAppStore.getState().portfolio?.uiSettings).toBeUndefined();
  });

  it("refreshes manually in manual mode, and only then", async () => {
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockResolvedValue(50_000);
    const p = emptyPortfolio();
    p.uiSettings = { priceRefresh: "manual" };
    useAppStore.setState({ portfolio: p });
    renderReaders();
    await flush();
    expect(spot).toHaveBeenCalledTimes(2);
    spot.mockClear();

    await advance(30 * 60_000);
    expect(spot).not.toHaveBeenCalled();
    await act(async () => refreshPricesNow());
    expect(spot).toHaveBeenCalledTimes(2);
  });

  it("stops every timer when the last reader goes away", async () => {
    const spot = vi.spyOn(binance, "fetchSpotPrice").mockResolvedValue(50_000);
    const { unmount } = renderReaders(2);
    await flush();
    spot.mockClear();
    unmount();
    await advance(10 * 60_000);
    expect(spot).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
