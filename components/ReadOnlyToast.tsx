"use client";

// What a refused change says (CLAUDE.md §6.7).
//
// The store rejects every write in read-only mode, which is the actual lock.
// This is what makes a rejection legible: an action that got past a disabled
// control — a keyboard shortcut, a dialog that was already open — would
// otherwise appear to do nothing at all, and an app that swallows a click
// looks broken rather than locked. So it says what happened, and offers the
// one thing that would have made it work.

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useLeaveReadOnly } from "@/lib/readOnly";
import { LockIcon } from "./icons";

const VISIBLE_MS = 6000;

export default function ReadOnlyToast() {
  const { t } = useI18n();
  const blockedAt = useAppStore((s) => s.readOnlyBlockedAt);
  const leave = useLeaveReadOnly();
  /**
   * Which refusal has been seen. Derived rather than mirrored: the store's
   * timestamp is the source, and a second refusal is a different number, so a
   * toast that was dismissed cannot swallow the next one.
   */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const visible = blockedAt !== null && blockedAt !== dismissed;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setDismissed(blockedAt), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [visible, blockedAt]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[60] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2"
    >
      <div className="motion-safe:animate-[milestone-in_240ms_ease-out] flex flex-wrap items-center gap-2 rounded-xl border border-warning/50 bg-surface/95 p-3 text-sm shadow-2xl">
        <p className="flex min-w-0 items-center gap-2 text-warning">
          <LockIcon className="shrink-0" />
          <span>{t("readOnly.blocked")}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setDismissed(blockedAt);
            leave();
          }}
          className="ml-auto shrink-0 rounded-lg border border-accent/40 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/10"
        >
          {t("readOnly.disable")}
        </button>
      </div>
    </div>
  );
}
