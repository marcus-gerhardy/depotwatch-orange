// The auto-lock's pure half: when the time is up, how long a wrong password
// costs, and that a hand-edited setting cannot smuggle a value into the app
// that the settings screen has no entry for.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCK_SETTINGS,
  LOCK_WARNING_MS,
  lockCountdown,
  lockSettingsOf,
  lockTimeoutMs,
  parseLockSettings,
  unlockDelayMs,
} from "./autoLock";

const MINUTE = 60_000;

describe("the countdown", () => {
  const timeout = 15 * MINUTE;
  const start = 1_700_000_000_000;

  it("stays quiet, then warns, then expires", () => {
    expect(lockCountdown(start, start, timeout).phase).toBe("idle");
    expect(lockCountdown(start + 14 * MINUTE, start, timeout).phase).toBe("idle");
    // The warning window is the last 30 seconds.
    expect(lockCountdown(start + timeout - LOCK_WARNING_MS, start, timeout).phase).toBe(
      "warning",
    );
    expect(lockCountdown(start + timeout, start, timeout).phase).toBe("expired");
  });

  it("reports the remaining time so the countdown can be shown", () => {
    const { remainingMs } = lockCountdown(start + timeout - 10_000, start, timeout);
    expect(remainingMs).toBe(10_000);
  });

  it("expires however long the tick itself was throttled for", () => {
    // The reason this is a timestamp comparison and not a setTimeout: a
    // background tab may not tick for an hour, and the first tick back has to
    // give the right answer rather than a fresh 15 minutes.
    expect(lockCountdown(start + 60 * MINUTE, start, timeout)).toEqual({
      phase: "expired",
      remainingMs: 0,
    });
  });

  it("never expires when the lock is switched off", () => {
    expect(lockCountdown(start + 1_000 * MINUTE, start, null).phase).toBe("idle");
    expect(lockTimeoutMs({ ...DEFAULT_LOCK_SETTINGS, minutes: null })).toBeNull();
    expect(lockTimeoutMs(DEFAULT_LOCK_SETTINGS)).toBe(15 * MINUTE);
  });
});

describe("the backoff after a wrong password", () => {
  it("lets a typo through and then grows", () => {
    expect(unlockDelayMs(0)).toBe(0);
    expect(unlockDelayMs(1)).toBe(0);
    expect(unlockDelayMs(2)).toBe(0);
    expect(unlockDelayMs(3)).toBe(5_000);
    expect(unlockDelayMs(4)).toBe(10_000);
    expect(unlockDelayMs(5)).toBe(20_000);
  });

  it("caps, so the owner is never locked out for long", () => {
    expect(unlockDelayMs(20)).toBe(60_000);
    expect(unlockDelayMs(500)).toBe(60_000);
  });
});

describe("reading the settings", () => {
  it("takes what a file says, field by field", () => {
    expect(
      lockSettingsOf(
        { uiSettings: { autoLockMinutes: 5, lockOnHide: true, lockShowFileName: false } },
        DEFAULT_LOCK_SETTINGS,
      ),
    ).toEqual({ minutes: 5, onHide: true, showFileName: false });
  });

  it("keeps 'never' apart from 'not configured'", () => {
    expect(parseLockSettings({ autoLockMinutes: null }, DEFAULT_LOCK_SETTINGS).minutes).toBeNull();
    expect(parseLockSettings({}, DEFAULT_LOCK_SETTINGS).minutes).toBe(15);
  });

  it("refuses an interval the settings screen does not offer", () => {
    // A hand-edited 0 would mean "lock instantly, forever" — the file must not
    // be able to configure a state the UI cannot get out of.
    expect(parseLockSettings({ autoLockMinutes: 0 }, DEFAULT_LOCK_SETTINGS).minutes).toBe(15);
    expect(parseLockSettings({ autoLockMinutes: "5" }, DEFAULT_LOCK_SETTINGS).minutes).toBe(15);
    expect(parseLockSettings(null, DEFAULT_LOCK_SETTINGS)).toEqual(DEFAULT_LOCK_SETTINGS);
  });

  it("defaults to 15 minutes, no lock on hide, file name shown", () => {
    expect(DEFAULT_LOCK_SETTINGS).toEqual({
      minutes: 15,
      onHide: false,
      showFileName: true,
    });
  });
});
