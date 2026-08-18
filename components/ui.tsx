"use client";

// Small shared UI primitives, dark-theme styled.

import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import HelpButton from "./help/HelpButton";
import { CloseIcon } from "./icons";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border-c bg-surface p-4 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The small uppercase heading above a view or a card.
 *
 * `level` is the heading rank, not the look: a view's own title is the page's
 * `h1` (the app shell has none — its brand is a logo, not a heading), and the
 * cards inside it are `h2`/`h3`. Screen readers navigate by that outline, so it
 * has to nest properly even though every level looks the same.
 */
export function SectionTitle({
  children,
  level = 2,
}: {
  children: React.ReactNode;
  level?: 1 | 2 | 3;
}) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return (
    <Tag className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">
      {children}
    </Tag>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  type = "button",
  disabled,
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "dangerSolid" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  /** Tooltip, e.g. to explain an action without spending a paragraph on it. */
  title?: string;
}) {
  const styles = {
    default:
      "border border-border-c bg-surface-2 hover:border-accent-dim text-foreground",
    primary:
      // The text on a filled accent button is a token too: on a light theme's
      // accent, black would be the wrong answer (CLAUDE.md §5).
      "bg-accent text-accent-contrast font-semibold hover:bg-accent-dim",
    danger:
      "border border-loss/50 text-loss hover:bg-loss/10",
    dangerSolid: "bg-loss text-background font-semibold hover:bg-loss/90",
    ghost: "text-muted hover:text-foreground",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      // Taller on touch screens, unchanged on the desktop layout the app is
      // designed for — 30 px is a small target for a finger.
      className={`rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none sm:py-1.5 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Enter in a filter field of a dialog that is nested inside a form (the lot and
 * out-leg pickers live inside the transaction form) would implicitly submit
 * that form — saving the transaction from a search box. Put this on such
 * inputs; buttons keep their own Enter handling.
 */
export function stopEnterSubmit(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.preventDefault();
}

export const inputCls =
  "w-full rounded-lg border border-border-c bg-surface-2 px-3 py-1.5 text-sm text-foreground placeholder:text-muted/60 focus:border-accent";

/**
 * Toggle-switch look for on/off checkboxes (bulk-select rows, CSV import row
 * include) — still a real <input type="checkbox"> for semantics/keyboard
 * support, just visually hidden and replaced by a styled track+thumb driven by
 * :checked.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  indeterminate,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  indeterminate?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <label
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      }`}
    >
      <input
        ref={inputRef}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        title={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={`absolute inset-0 rounded-full border transition-colors ${
          checked || indeterminate
            ? "border-accent bg-accent/70"
            : "border-border-c bg-surface-2"
        }`}
      />
      {/* The knob is a flex child rather than an absolutely positioned one, so
          the label's `items-center` centres it vertically. Positioned by hand
          it sat 2 px below the top edge and 4 px above the bottom of the 20 px
          track — a one-pixel error, but a visible one on a round shape.
          Horizontally it keeps 3 px on both sides: 3 + 14 + 16 (translate-x-4)
          + 3 = 36 = the track's width. */}
      <span
        className={`relative ml-[3px] h-3.5 w-3.5 rounded-full bg-foreground transition-transform ${
          checked ? "translate-x-4" : indeterminate ? "translate-x-2" : "translate-x-0"
        }`}
      />
    </label>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

/**
 * A collapsible group of form fields (disclosure pattern).
 *
 * Dialogs that grew field by field — the transaction detail view above all —
 * become unreadable as one flat column. Everything that is not part of the
 * common case lives in one of these instead: closed by default, but opened
 * automatically when it *has* content (`defaultOpen`) or when something in it
 * needs attention (`forceOpen`), so nothing is ever hidden away silently. The
 * collapsed header carries a `summary`, so the section can be judged without
 * opening it.
 */
export function Section({
  title,
  summary,
  tone = "default",
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  title: string;
  /** Shown in the header — what is inside, when it is closed. */
  summary?: React.ReactNode;
  /** "warning" flags a section the user should look at. */
  tone?: "default" | "warning" | "success";
  defaultOpen?: boolean;
  /** Opens the section when it turns true (e.g. a validation error inside). */
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const bodyId = useId();
  // A problem inside must not be hidden behind a closed header — neither when
  // it appears nor by collapsing the section afterwards, so the flag wins over
  // the toggle for as long as it lasts.
  const open = expanded || forceOpen;

  const border =
    tone === "warning"
      ? "border-warning/40"
      : tone === "success"
        ? "border-gain/30"
        : "border-border-c/60";

  return (
    <section className={`rounded-lg border ${border}`}>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2/40"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setExpanded(!open)}
      >
        <span
          aria-hidden
          className={`text-muted transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
        <span className="text-xs font-medium">{title}</span>
        {summary !== undefined && (
          <span className="ml-auto truncate text-xs text-muted">{summary}</span>
        )}
      </button>
      {open && (
        <div id={bodyId} className="space-y-3 border-t border-border-c/50 p-3">
          {children}
        </div>
      )}
    </section>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  size,
  help,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Deprecated alias for size="xl". */
  wide?: boolean;
  /** Dialog width: md (default), lg for form dialogs with tables, xl for wizards. */
  size?: "md" | "lg" | "xl";
  /**
   * Help section this dialog is about (§8). A dialog is where questions are
   * asked, so the question mark belongs in its header rather than somewhere
   * the reader would have to close the dialog to find.
   */
  help?: string;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keyboard focus follows the dialog and comes back where it was: without
  // this, tabbing after opening one walks the page behind it, and closing
  // drops focus on <body>. The page behind also must not scroll away under
  // the overlay while it is open.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      // Mobile first: a dialog uses the width it is given and starts near the
      // top of the screen, because a phone has no room to spare on either
      // side. The generous inset is a desktop luxury.
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-2 pt-4 sm:p-4 sm:pt-16"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${
          { md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[
            size ?? (wide ? "xl" : "md")
          ]
        } rounded-xl border border-border-c bg-surface p-4 shadow-2xl focus:outline-none sm:p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id={titleId} className="flex items-center gap-2 text-base font-semibold">
            {title}
            {help && <HelpButton anchor={help} label={title} />}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md px-1 text-muted hover:text-foreground"
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Amount display that respects the global privacy mode (blur). */
export function Amount({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const privacyMode = useAppStore((s) => s.privacyMode);
  return (
    <span className={`${privacyMode ? "privacy-blur" : ""} ${className}`}>
      {children}
    </span>
  );
}

export function PnlValue({
  value,
  children,
  /** Set where the sign is already part of the text (a "+1,2 %" chip). */
  showArrow = true,
}: {
  value: number;
  children: React.ReactNode;
  showArrow?: boolean;
}) {
  const color = value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-muted";
  // Direction is never carried by colour alone: an arrow says the same thing
  // to anyone who cannot tell the two colours apart, and it survives a
  // greyscale printout (CLAUDE.md §5).
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "•";
  return (
    <Amount className={color}>
      {showArrow && (
        <span aria-hidden className="mr-0.5">
          {arrow}
        </span>
      )}
      {children}
    </Amount>
  );
}
