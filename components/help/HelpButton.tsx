"use client";

// The small "?" that opens the help at the right place (CLAUDE.md §8).
//
// One component, used everywhere a screen has something worth explaining. It
// takes a section anchor rather than a topic, because a question mark next to a
// field means "explain *this*", not "here is the manual".
//
// Deliberately quiet: muted until hovered or focused, never a coloured badge
// competing with the actual controls. Help that shouts is help that gets in the
// way of the people who do not need it.

import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export default function HelpButton({
  anchor,
  label,
  className = "",
}: {
  /** Section id (or topic id) in the help — see content/help/. */
  anchor: string;
  /** What this explains; goes into the accessible name. */
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const openHelp = useAppStore((s) => s.openHelp);
  const name = label ? t("help.aboutLabel", { what: label }) : t("help.about");

  return (
    <button
      type="button"
      onClick={(e) => {
        // Inside a dialog header or a table header this button sits on top of
        // something clickable often enough to be worth stopping here.
        e.preventDefault();
        e.stopPropagation();
        openHelp(anchor);
      }}
      aria-label={name}
      title={name}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-c text-[0.7rem] leading-none text-muted transition-colors hover:border-accent-dim hover:text-accent ${className}`}
    >
      ?
    </button>
  );
}
