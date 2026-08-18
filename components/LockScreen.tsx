"use client";

// The lock screen (CLAUDE.md §6.4).
//
// It is not an overlay over the app: while it is up there *is* no app. The
// store has dropped the decrypted portfolio and the password, so nothing below
// this screen could render a balance even if something tried — which is the
// difference between a lock and a curtain, and it is what makes the screen
// safe to leave on a shared desk or in a screen recording.
//
// What it shows is therefore everything the app still knows: its own name, and
// (unless the settings say otherwise) the name of the file. No balance, no
// wallet, no date, not even whether anything is unsaved.

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { WrongPasswordError } from "@/lib/crypto";
import { Button, inputCls } from "./ui";
import BrandMark from "./BrandMark";

export default function LockScreen() {
  const { t } = useI18n();
  const unlock = useAppStore((s) => s.unlock);
  const noteUnlockFailure = useAppStore((s) => s.noteUnlockFailure);
  const closePortfolio = useAppStore((s) => s.closePortfolio);
  const fileName = useAppStore((s) => s.lockedFileName);
  const showFileName = useAppStore((s) => s.lockSettings.showFileName);
  const failures = useAppStore((s) => s.unlockFailures);
  const blockedUntil = useAppStore((s) => s.unlockBlockedUntil);

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Seconds the backoff still refuses an attempt; 0 while it does not. */
  const [blockedFor, setBlockedFor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // The backoff counts down on the clock, for the same reason the lock itself
  // does: a throttled tab must not be able to shorten it.
  useEffect(() => {
    const tick = () =>
      setBlockedFor(Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000)));
    tick();
    if (blockedUntil <= Date.now()) return;
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [blockedUntil]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || blockedFor > 0 || password === "") return;
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
      setPassword("");
    } catch (err) {
      noteUnlockFailure();
      setPassword("");
      setError(
        err instanceof WrongPasswordError ? t("lock.wrongPassword") : t("lock.failed"),
      );
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div>
          <div className="font-heading text-3xl font-bold tracking-tight">
            <BrandMark className="inline-block text-accent" /> DepotWatch{" "}
            <span className="text-accent">Orange</span>
          </div>
          <p className="mt-2 text-sm text-muted">{t("lock.title")}</p>
          {showFileName && fileName && (
            <p className="mt-1 font-mono text-xs text-muted">{fileName}</p>
          )}
        </div>

        <form onSubmit={submit} className="space-y-2">
          <input
            ref={inputRef}
            type="password"
            className={inputCls}
            autoComplete="current-password"
            placeholder={t("lock.passwordPlaceholder")}
            aria-label={t("lock.passwordPlaceholder")}
            value={password}
            disabled={busy || blockedFor > 0}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={busy || blockedFor > 0 || password === ""}
          >
            {busy ? t("lock.unlocking") : t("lock.unlock")}
          </Button>
        </form>

        {error && blockedFor === 0 && (
          <p className="text-sm text-loss" role="alert">
            {error}
          </p>
        )}
        {blockedFor > 0 && (
          <p className="text-sm text-warning" role="alert">
            {t("lock.blocked", { seconds: blockedFor, attempts: failures })}
          </p>
        )}

        <div className="border-t border-border-c/60 pt-4">
          <p className="text-xs leading-relaxed text-muted">{t("lock.hint")}</p>
          <Button variant="ghost" className="mt-2" onClick={closePortfolio}>
            {t("lock.closeFile")}
          </Button>
        </div>
      </div>
    </div>
  );
}
