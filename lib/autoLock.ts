// Auto-lock on inactivity (CLAUDE.md §6.4).
//
// The rules of this module, and the reasons they are rules:
//
// **Locking has to be real.** Hiding the interface behind an overlay protects
// against a glance over the shoulder and against nothing else: the plaintext
// portfolio would still be in memory, in the DOM and in a screenshot of the
// tab. So locking drops the decrypted portfolio *and* the password, keeps only
// the ciphertext, and unlocking is a genuine decryption with a password typed
// in again. What that costs is that an **unencrypted file cannot be locked at
// all** — there is no secret to lock it with, and pretending otherwise would be
// the dishonest version of this feature.
//
// **Expiry is a timestamp comparison, not a timeout.** Browsers throttle timers
// in background tabs, sometimes to once a minute, so a `setTimeout(15 min)`
// fires late and unpredictably — exactly in the situation the feature exists
// for. An interval that compares `Date.now()` against the last activity is
// immune to that: however badly the tick is throttled, the *decision* is made
// on wall-clock time.
//
// Pure functions here, effects in `components/AutoLock.tsx`.

const MINUTE = 60_000;

/** How long before the lock the warning appears, with its countdown. */
export const LOCK_WARNING_MS = 30_000;

/** The choices the settings offer, in minutes. "Never" is `null`. */
export const AUTO_LOCK_CHOICES: (number | null)[] = [1, 5, 15, 30, null];

export const DEFAULT_AUTO_LOCK_MINUTES = 15;

export interface LockSettings {
  /** Minutes of inactivity before locking; null switches it off. */
  minutes: number | null;
  /** Lock the moment the tab is hidden or minimised (Visibility API). */
  onHide: boolean;
  /** Show the file name on the lock screen. Off keeps even that private. */
  showFileName: boolean;
}

export const DEFAULT_LOCK_SETTINGS: LockSettings = {
  minutes: DEFAULT_AUTO_LOCK_MINUTES,
  onHide: false,
  showFileName: true,
};

/** Milliseconds of inactivity before the lock, or null when it is off. */
export function lockTimeoutMs(settings: LockSettings): number | null {
  return settings.minutes === null ? null : settings.minutes * MINUTE;
}

export type LockPhase =
  /** Plenty of time left; nothing is shown. */
  | "idle"
  /** Inside the warning window: the countdown is up. */
  | "warning"
  /** The time is up. */
  | "expired";

export interface LockCountdown {
  phase: LockPhase;
  /** Milliseconds until the lock, floored at 0. */
  remainingMs: number;
}

/**
 * Where we are between the last activity and the lock, decided on wall-clock
 * time (see the note at the top of this file).
 */
export function lockCountdown(
  now: number,
  lastActivityAt: number,
  timeoutMs: number | null,
): LockCountdown {
  if (timeoutMs === null) return { phase: "idle", remainingMs: Infinity };
  const remainingMs = Math.max(0, lastActivityAt + timeoutMs - now);
  if (remainingMs === 0) return { phase: "expired", remainingMs: 0 };
  return {
    phase: remainingMs <= LOCK_WARNING_MS ? "warning" : "idle",
    remainingMs,
  };
}

/**
 * How long the lock screen refuses the next attempt after `failed` wrong
 * passwords. Two tries are free (a typo is not an attack); after that the wait
 * doubles up to a minute, which turns an online guessing run into something
 * that costs days without ever locking the owner out for long.
 *
 * The key derivation itself already costs ~600 000 PBKDF2 iterations per try;
 * this sits on top so the cost is visible rather than merely present.
 */
export function unlockDelayMs(failed: number): number {
  if (failed < 3) return 0;
  return Math.min(60_000, 5_000 * 2 ** (failed - 3));
}

/** Read a stored/persisted lock configuration, falling back field by field. */
export function parseLockSettings(raw: unknown, fallback: LockSettings): LockSettings {
  if (typeof raw !== "object" || raw === null) return fallback;
  const o = raw as Record<string, unknown>;
  const minutes = o.autoLockMinutes;
  return {
    minutes:
      minutes === null
        ? null
        : typeof minutes === "number" && AUTO_LOCK_CHOICES.includes(minutes)
          ? minutes
          : fallback.minutes,
    onHide: typeof o.lockOnHide === "boolean" ? o.lockOnHide : fallback.onHide,
    showFileName:
      typeof o.lockShowFileName === "boolean"
        ? o.lockShowFileName
        : fallback.showFileName,
  };
}

/**
 * The lock configuration a portfolio file carries. Read through the same
 * parser as the device preference, so a hand-edited file cannot put a value
 * into the settings that the picker has no entry for.
 */
export function lockSettingsOf(
  portfolio: { uiSettings?: unknown },
  fallback: LockSettings,
): LockSettings {
  return parseLockSettings(portfolio.uiSettings ?? {}, fallback);
}

/** The shape the portfolio file and the device preference both store. */
export function lockSettingsToFields(s: LockSettings): {
  autoLockMinutes: number | null;
  lockOnHide: boolean;
  lockShowFileName: boolean;
} {
  return {
    autoLockMinutes: s.minutes,
    lockOnHide: s.onHide,
    lockShowFileName: s.showFileName,
  };
}
