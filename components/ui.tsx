"use client";

// Small shared UI primitives, dark-theme styled.

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";

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

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">
      {children}
    </h2>
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
      "bg-accent text-black font-semibold hover:bg-accent-dim",
    danger:
      "border border-loss/50 text-loss hover:bg-loss/10",
    dangerSolid: "bg-loss text-white font-semibold hover:bg-loss/90",
    ghost: "text-muted hover:text-foreground",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export const inputCls =
  "w-full rounded-lg border border-border-c bg-surface-2 px-3 py-1.5 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none";

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
      <span
        className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${
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

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-4xl" : "max-w-lg"} rounded-xl border border-border-c bg-surface p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
            aria-label="close"
          >
            ✕
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
}: {
  value: number;
  children: React.ReactNode;
}) {
  const color = value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-muted";
  return <Amount className={color}>{children}</Amount>;
}
