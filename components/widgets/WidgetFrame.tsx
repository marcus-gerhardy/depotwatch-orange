"use client";

// The chrome every widget sits in, plus the small building blocks the widgets
// share (loading skeleton, error state, meter bar, delta chip).
//
// Isolation is the point of the boundary below: a widget that throws, or an
// explorer that cannot be reached, may only take down its own tile — the rest
// of the dashboard keeps working.

import { Component, type ReactNode } from "react";
import { Amount } from "../ui";
import WidgetIcon from "./WidgetIcon";

/** Drag handle selector; react-grid-layout only starts a drag from here. */
export const WIDGET_DRAG_HANDLE = "widget-drag-handle";

export function WidgetShell({
  title,
  widgetId,
  editing,
  onRemove,
  removeLabel,
  children,
}: {
  title: string;
  /** Which widget this is — the header icon is drawn from it (§4.1). */
  widgetId: string;
  /** Edit mode: header becomes the drag handle and a remove button appears. */
  editing?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border-c bg-surface">
      <div
        className={`flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-1.5 ${
          editing ? `${WIDGET_DRAG_HANDLE} cursor-move select-none` : ""
        }`}
      >
        <WidgetIcon id={widgetId} className="h-4 w-4 shrink-0 text-muted" />
        <h3 className="truncate text-xs font-semibold uppercase tracking-wider text-muted">
          {title}
        </h3>
        <div className="ml-auto flex items-center gap-1">
          {editing && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              title={removeLabel}
              aria-label={removeLabel}
              className="rounded px-1.5 text-sm leading-none text-muted transition-colors hover:bg-loss/10 hover:text-loss"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pt-1 pb-3">{children}</div>
    </div>
  );
}

/** Placeholder while a widget waits for external data. */
export function WidgetSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 py-1" role="status" aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-surface-2"
          style={{ width: `${100 - i * 15}%` }}
        />
      ))}
    </div>
  );
}

export function WidgetError({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 text-xs text-loss">
      <p className="leading-relaxed">⚠ {message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-border-c px-2 py-1 text-muted transition-colors hover:text-foreground"
        >
          ↻ {retryLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Nothing to show yet. `action` is for the cases where the tile knows exactly
 * what is missing — a watchlist widget without a single address should offer
 * to add one rather than only stating that there is none.
 */
export function WidgetEmpty({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-xs text-muted">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-lg border border-accent/40 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/10"
        >
          + {action.label}
        </button>
      )}
    </div>
  );
}

/** Big headline figure, blurred in privacy mode like every other amount. */
export function StatValue({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-2xl leading-tight font-bold ${className}`}>
      <Amount>{children}</Amount>
    </div>
  );
}

export function StatLabel({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted">{children}</div>;
}

/** Horizontal progress/share bar, 0…1. */
export function Meter({
  value,
  color = "bg-accent",
  className = "",
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ${className}`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface BoundaryProps {
  /** Shown instead of the widget when it throws. */
  fallback: (reset: () => void) => ReactNode;
  children: ReactNode;
}

/**
 * Per-widget error boundary. React only offers this as a class component, and
 * it is deliberately per widget rather than per dashboard: one broken tile must
 * not blank the page.
 */
export class WidgetBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("dashboard widget failed", error);
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback(() => this.setState({ failed: false }));
    }
    return this.props.children;
  }
}
