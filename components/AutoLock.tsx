"use client";

// The auto-lock's automatic half (CLAUDE.md §6.4): watching for activity,
// deciding when the time is up, and the warning with its countdown. Locking on
// purpose — the header button and Ctrl/Cmd+L — is in AppShell, where the toast
// that reports a refusal already lives.
//
// **The decision is a timestamp comparison on an interval**, never a
// `setTimeout(15 min)`. Background tabs get their timers throttled — which is
// precisely the situation this feature exists for — so a timeout would fire
// late and unpredictably. An interval that compares `Date.now()` against the
// last activity gives the right answer however badly the tick itself is
// delayed: a tab that was throttled for an hour locks on its first tick back.
//
// The last-activity timestamp lives in a ref, not in the store: it changes on
// every scroll, and a store field would re-render everything subscribed to it
// several times a second for a value nothing renders.

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { pendingRequestCount } from "@/lib/marketData";
import { lockCountdown, lockTimeoutMs } from "@/lib/autoLock";
import type { LockOutcome } from "@/lib/store";
import { Button } from "./ui";

/** How often the clock is compared. Cheap, and one second of accuracy is plenty. */
const TICK_MS = 1_000;

/**
 * Activity events are not counted, they are debounced: a mousemove fires
 * dozens of times a second and every one of them would mean the same thing.
 */
const ACTIVITY_THROTTLE_MS = 2_000;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

export default function AutoLock() {
  const { t } = useI18n();
  const lockSettings = useAppStore((s) => s.lockSettings);
  const encryptionEnabled = useAppStore((s) => s.encryptionEnabled);
  const portfolio = useAppStore((s) => s.portfolio);
  const lock = useAppStore((s) => s.lock);

  /** Milliseconds left, while inside the warning window; null otherwise. */
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  /** The time is up but something long-running is still in flight. */
  const [deferred, setDeferred] = useState(false);

  // Seeded by the clock effect below rather than here: reading the clock while
  // rendering is exactly the impurity `lib/clock.ts` exists to avoid.
  const lastActivity = useRef(0);
  /** A lock in progress: it encrypts, which takes long enough to overlap ticks. */
  const locking = useRef(false);

  const resetTimer = useCallback(() => {
    lastActivity.current = Date.now();
    setRemainingMs(null);
    setDeferred(false);
  }, []);

  // Only a file that can actually be locked arms the timer: without a password
  // there is nothing to lock it with, and the settings say so rather than this
  // silently trying once a second (§6.4).
  const armed = portfolio !== null && encryptionEnabled;
  const timeoutMs = lockTimeoutMs(lockSettings);

  const lockNow = useCallback(async () => {
    if (locking.current) return;
    locking.current = true;
    try {
      const outcome: LockOutcome = await lock();
      // "busy" keeps the countdown at zero and tries again on the next tick;
      // everything else that did not lock gets a fresh cycle rather than a
      // retry every second (a wizard is open, or the file cannot be locked).
      if (outcome === "busy") {
        setDeferred(true);
      } else if (outcome !== "locked") {
        resetTimer();
      }
    } finally {
      locking.current = false;
    }
  }, [lock, resetTimer]);

  // Activity: throttled, passive, and on the capture phase so a click that is
  // swallowed somewhere inside the app still counts as somebody being there.
  useEffect(() => {
    if (!armed) return;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivity.current < ACTIVITY_THROTTLE_MS) return;
      lastActivity.current = now;
      // Only touch React state when something is actually on screen.
      setRemainingMs((r) => (r === null ? r : null));
      setDeferred((d) => (d ? false : d));
    };
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true, capture: true });
    }
    return () => {
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, { capture: true });
      }
    };
  }, [armed]);

  // The clock. Nothing is set from the effect body itself — a disarmed timer
  // simply stops ticking, and the countdown it leaves behind is ignored by the
  // render below rather than cleared from here.
  useEffect(() => {
    if (!armed || timeoutMs === null) return;
    lastActivity.current = Date.now();
    const id = setInterval(() => {
      const { phase, remainingMs } = lockCountdown(
        Date.now(),
        lastActivity.current,
        timeoutMs,
      );
      if (phase === "expired") {
        setRemainingMs(0);
        // A price series halfway in is a long-running operation too.
        if (useAppStore.getState().busyCount > 0 || pendingRequestCount() > 0) {
          setDeferred(true);
          return;
        }
        void lockNow();
        return;
      }
      setRemainingMs(phase === "warning" ? remainingMs : null);
      setDeferred(false);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [armed, timeoutMs, lockNow]);

  // "Lock when the tab goes away", off by default. Deliberately not tied to
  // the countdown: it is a different intent (somebody left the screen), so it
  // does not wait and does not warn.
  useEffect(() => {
    if (!armed || !lockSettings.onHide) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void lockNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [armed, lockSettings.onHide, lockNow]);

  if (!armed || timeoutMs === null || remainingMs === null) return null;

  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <div
      role="alert"
      className="pointer-events-auto fixed right-4 bottom-4 z-[70] max-w-xs rounded-xl border border-warning/50 bg-surface/95 p-3 shadow-2xl motion-safe:animate-[milestone-in_240ms_ease-out]"
    >
      <p className="text-sm font-semibold text-warning">
        {t("lock.warningTitle")}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {deferred
          ? t("lock.warningDeferred")
          : t("lock.warningBody", { seconds })}
      </p>
      <div className="mt-2 flex gap-2">
        <Button variant="primary" onClick={resetTimer}>
          {t("lock.stayUnlocked")}
        </Button>
        <Button onClick={() => void lockNow()}>{t("lock.lockNow")}</Button>
      </div>
    </div>
  );
}
