import { describe, expect, it } from "vitest";
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  RATE_LIMIT_BASE_MS,
  backoffMs,
  isFetchDue,
  isPriceStale,
  isReturnRefreshDue,
  priceDirection,
  refreshIntervalMs,
  type ScheduleState,
} from "./priceRefresh";

const base: ScheduleState = {
  now: 1_000_000,
  lastSuccessAt: null,
  retryAt: null,
  intervalMs: 60_000,
  fetchedThisSession: false,
};

describe("refreshIntervalMs", () => {
  it("reads the setting, falling back to 60 s for anything unknown", () => {
    expect(refreshIntervalMs(15)).toBe(15_000);
    expect(refreshIntervalMs(300)).toBe(300_000);
    expect(refreshIntervalMs("manual")).toBeNull();
    expect(refreshIntervalMs(undefined)).toBe(60_000);
    expect(refreshIntervalMs(7)).toBe(60_000);
  });
});

describe("backoffMs", () => {
  it("doubles per failure and stops at the cap", () => {
    expect(backoffMs(1, false)).toBe(BACKOFF_BASE_MS);
    expect(backoffMs(2, false)).toBe(2 * BACKOFF_BASE_MS);
    expect(backoffMs(3, false)).toBe(4 * BACKOFF_BASE_MS);
    expect(backoffMs(50, false)).toBe(BACKOFF_MAX_MS);
  });

  it("starts higher for a rate limit and honours a longer Retry-After", () => {
    expect(backoffMs(1, true)).toBe(RATE_LIMIT_BASE_MS);
    expect(backoffMs(1, true, 5_000)).toBe(RATE_LIMIT_BASE_MS);
    expect(backoffMs(1, true, 120_000)).toBe(120_000);
  });
});

describe("isFetchDue", () => {
  it("fetches at once when there is no price yet", () => {
    expect(isFetchDue(base)).toBe(true);
  });

  it("measures the interval from the last reading, not from a tick", () => {
    const last = base.now - 59_000;
    expect(isFetchDue({ ...base, lastSuccessAt: last })).toBe(false);
    // A throttled tab whose timer fired late still fetches on its first tick.
    expect(isFetchDue({ ...base, lastSuccessAt: base.now - 3_600_000 })).toBe(true);
  });

  it("waits out a backoff even when the interval has passed", () => {
    const s = { ...base, lastSuccessAt: base.now - 120_000, retryAt: base.now + 1 };
    expect(isFetchDue(s)).toBe(false);
    expect(isFetchDue({ ...s, now: s.retryAt })).toBe(true);
  });

  it("fetches once on opening in manual mode and never again on its own", () => {
    const manual = { ...base, intervalMs: null };
    expect(isFetchDue(manual)).toBe(true);
    expect(isFetchDue({ ...manual, fetchedThisSession: true })).toBe(false);
    expect(isFetchDue({ ...manual, lastSuccessAt: base.now - 86_400_000 })).toBe(false);
  });
});

describe("isReturnRefreshDue", () => {
  it("refreshes on return, but not after a glance away", () => {
    expect(isReturnRefreshDue({ ...base, lastSuccessAt: base.now - 30_000 })).toBe(true);
    expect(isReturnRefreshDue({ ...base, lastSuccessAt: base.now - 3_000 })).toBe(false);
  });

  it("does not jump a backoff or a manual setting", () => {
    expect(
      isReturnRefreshDue({ ...base, lastSuccessAt: 0, retryAt: base.now + 1_000 }),
    ).toBe(false);
    expect(isReturnRefreshDue({ ...base, lastSuccessAt: 0, intervalMs: null })).toBe(false);
  });
});

describe("isPriceStale", () => {
  it("tolerates a missed refresh and flags a few", () => {
    expect(isPriceStale(90_000, 60_000)).toBe(false);
    expect(isPriceStale(181_000, 60_000)).toBe(true);
  });

  it("never calls a price stale under two minutes, even at 15 s", () => {
    expect(isPriceStale(60_000, 15_000)).toBe(false);
    expect(isPriceStale(121_000, 15_000)).toBe(true);
  });

  it("gives manual mode a fixed limit", () => {
    expect(isPriceStale(10 * 60_000, null)).toBe(false);
    expect(isPriceStale(16 * 60_000, null)).toBe(true);
  });
});

describe("priceDirection", () => {
  it("says which way, and nothing for no change or no previous price", () => {
    expect(priceDirection(100, 101)).toBe("up");
    expect(priceDirection(100, 99)).toBe("down");
    expect(priceDirection(100, 100)).toBeNull();
    expect(priceDirection(null, 100)).toBeNull();
  });
});
