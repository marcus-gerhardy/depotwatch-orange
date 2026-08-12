"use client";

// The milestone notification (CLAUDE.md §5.2).
//
// Bottom right, small, gone on its own. Deliberately not a modal: a milestone
// is a remark, and interrupting somebody's bookkeeping to make them click "OK"
// would turn a small pleasure into an obstacle. Several at once (an import can
// earn a handful) are collected into one card rather than queued up as a
// sequence of pop-ups.
//
// The one exception is the whole coin, which keeps its confetti (§5.1) — that
// moment predates this system and was already the loudest thing the app does.

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useEasterEggs } from "@/lib/easterEggs";
import MilestoneIcon from "./MilestoneIcon";

const VISIBLE_MS = 6000;

export default function MilestoneToast() {
  const { t } = useI18n();
  const queue = useAppStore((s) => s.milestoneQueue);
  const clear = useAppStore((s) => s.clearMilestoneQueue);
  const eggs = useEasterEggs();

  // Off with the playful touches, the milestones stay recorded and the
  // overview stays reachable — only the interruption goes.
  const show = eggs && queue.length > 0;

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(clear, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [show, queue, clear]);

  // Nothing to show, but something to acknowledge: with the touches off the
  // queue would otherwise sit there and re-announce itself on the next load.
  useEffect(() => {
    if (!eggs && queue.length > 0) clear();
  }, [eggs, queue.length, clear]);

  if (!show) return null;

  const [first, ...rest] = queue;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] max-w-xs"
    >
      {/* The entrance is the only motion, and it is dropped for anyone who
          asked for less of it (motion-safe). */}
      <div className="motion-safe:animate-[milestone-in_240ms_ease-out] rounded-xl border border-accent/40 bg-surface/95 p-3 shadow-2xl">
        <p className="text-[0.65rem] tracking-wide text-muted uppercase">
          {t("milestones.reached")}
        </p>
        <p className="mt-1 flex items-start gap-2 text-sm font-semibold">
          <MilestoneIcon id={first.id} className="mt-px h-4.5 w-4.5 shrink-0 text-accent" />
          <span>{t(`milestones.catalog.${first.id}.title`)}</span>
        </p>
        <p className="mt-1 text-xs leading-snug text-muted">
          {t(`milestones.catalog.${first.id}.description`)}
        </p>
        {rest.length > 0 && (
          <p className="mt-2 border-t border-border-c/60 pt-2 text-xs text-muted">
            {t("milestones.andMore", { count: rest.length })}
          </p>
        )}
      </div>
    </div>
  );
}
