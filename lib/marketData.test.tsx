/** @vitest-environment jsdom */
// The rule from CLAUDE.md §4.1: one module-level cache, so a re-render never
// becomes a request and an unreachable source never becomes a request storm.
//
// Two subscribers to the same figure are now normal rather than exotic: the
// dashboard reads the spot price, and so does every surface that shows a
// holding in the display currency (§4.5). This is what stops each of them from
// bringing its own background refresh along.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { clearMarketDataCache, useSpotPrices } from "./marketData";
import * as binance from "./binance";

function Reader() {
  useSpotPrices();
  return null;
}

beforeEach(() => {
  clearMarketDataCache();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useSpotPrices", () => {
  it("costs one pair of requests however many components ask", async () => {
    const spot = vi
      .spyOn(binance, "fetchSpotPrice")
      .mockResolvedValue(50_000);

    render(
      <>
        <Reader />
        <Reader />
        <Reader />
      </>,
    );
    await act(async () => {});

    // One EUR and one USD request, shared by all three.
    expect(spot).toHaveBeenCalledTimes(2);
  });

  it("refreshes on a schedule without multiplying it by the subscribers", async () => {
    const spot = vi
      .spyOn(binance, "fetchSpotPrice")
      .mockResolvedValue(50_000);

    render(
      <>
        <Reader />
        <Reader />
        <Reader />
      </>,
    );
    await act(async () => {});
    spot.mockClear();

    // Every subscriber has its own interval; the tick is TTL-guarded, so the
    // first one fetches and the others read what it just wrote.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(spot).toHaveBeenCalledTimes(2);
  });
});
