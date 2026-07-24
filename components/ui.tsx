"use client";

// Small shared UI primitives, dark-theme styled.

import { useEffect } from "react";
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    default:
      "border border-border-c bg-surface-2 hover:border-accent-dim text-foreground",
    primary:
      "bg-accent text-black font-semibold hover:bg-accent-dim",
    danger:
      "border border-loss/50 text-loss hover:bg-loss/10",
    ghost: "text-muted hover:text-foreground",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export const inputCls =
  "w-full rounded-lg border border-border-c bg-surface-2 px-3 py-1.5 text-sm text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none";

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
