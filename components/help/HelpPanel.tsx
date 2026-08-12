"use client";

// The help as a panel beside the app (CLAUDE.md §8).
//
// A panel rather than a page, because the question somebody has is almost
// always about what is on screen right now: "which lot do I pick here?" is
// asked *while* the dialog is open, and navigating away to answer it loses the
// context the question was about.
//
// It is a dialog, but deliberately **not** `aria-modal`: the app behind stays
// usable, which is the whole point of reading help next to your work rather
// than on top of it. What it does take from a modal is the keyboard contract —
// focus moves in when it opens, Escape closes it, and focus goes back where it
// came from.

import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import HelpBrowser from "./HelpBrowser";

export default function HelpPanel() {
  const { t, locale } = useI18n();
  const target = useAppStore((s) => s.helpTarget);
  const closeHelp = useAppStore((s) => s.closeHelp);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = target !== null;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, closeHelp]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("help.title")}
      tabIndex={-1}
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border-c bg-surface shadow-2xl focus:outline-none sm:w-[26rem] motion-safe:animate-[help-in_180ms_ease-out]"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-c px-4 py-3">
        <h2 className="font-heading text-base font-bold">{t("help.title")}</h2>
        <div className="flex items-center gap-1">
          <a
            href={t("help.path")}
            target="_blank"
            rel="noreferrer"
            title={t("help.openFull")}
            className="rounded-md px-2 py-1 text-xs text-muted hover:text-foreground"
          >
            {t("help.openFull")} ↗
          </a>
          <button
            type="button"
            onClick={closeHelp}
            aria-label={t("common.close")}
            title={`${t("common.close")} (Esc)`}
            className="rounded-md px-2 py-1 text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <HelpBrowser
          key={target}
          t={t}
          locale={locale}
          target={target === "" ? null : target}
          compact
        />
      </div>
    </div>
  );
}
