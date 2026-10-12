"use client";

// Renders the navigation declared in lib/navigation.ts: the main row, the
// icon row at the right, and the mobile menu — all three from the same lists,
// so they cannot drift apart.

import { useEffect, useId, useRef, useState } from "react";
import type { TranslateFn } from "@/lib/i18n";
import {
  badgeOf,
  isActive,
  type NavBadge,
  type NavContext,
  type NavEntry,
  type NavIconId,
  type ViewId,
} from "@/lib/navigation";
import { GearIcon, HelpIcon } from "../icons";

export interface NavHandlers {
  onNavigate: (view: ViewId) => void;
  onAction: (action: "help") => void;
}

function EntryIcon({ id }: { id: NavIconId }) {
  return id === "settings" ? <GearIcon /> : <HelpIcon />;
}

/**
 * A counter as a small pill, a marker as a dot — beside the label, or in the
 * corner of an icon button. The number is visible; the sentence it stands for
 * is what a screen reader hears ("3 open items").
 */
function Badge({
  badge,
  t,
  corner = false,
}: {
  badge: NavBadge;
  t: TranslateFn;
  corner?: boolean;
}) {
  const label = t(badge.labelKey, badge.kind === "count" ? { count: badge.value } : undefined);
  const visual =
    badge.kind === "dot" || corner ? (
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full bg-warning ${
          corner ? "absolute top-1 right-1 ring-2 ring-background" : "ml-1.5 inline-block"
        }`}
      />
    ) : (
      <span
        aria-hidden
        className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-warning/15 px-1.5 text-[0.65rem] leading-4 font-semibold text-warning tabular-nums"
      >
        {badge.value > 99 ? "99+" : badge.value}
      </span>
    );
  return (
    <>
      {visual}
      <span className="sr-only">, {label}</span>
    </>
  );
}

const itemCls = (active: boolean, panel: boolean) =>
  `flex w-full items-center whitespace-nowrap rounded-lg px-3 text-sm transition-colors ${
    panel ? "py-2.5 text-left" : "py-1.5"
  } ${active ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`;

/** A group: a button that opens its entries (a dropdown in the bar, nested in the panel). */
function GroupItem({
  entry,
  ctx,
  view,
  t,
  handlers,
  panel,
}: {
  entry: Extract<NavEntry, { kind: "group" }>;
  ctx: NavContext;
  view: ViewId | null;
  t: TranslateFn;
  handlers: NavHandlers;
  panel: boolean;
}) {
  const [open, setOpen] = useState(panel);
  const listId = useId();
  const ref = useRef<HTMLLIElement>(null);
  const active = isActive(entry, view);
  const badge = badgeOf(entry, ctx);

  useEffect(() => {
    if (!open || panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, panel]);

  return (
    <li ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={itemCls(active, panel)}
      >
        {t(entry.labelKey)}
        {badge && <Badge badge={badge} t={t} />}
        <span aria-hidden className={`ml-1 text-xs transition-transform ${open ? "rotate-90" : ""}`}>
          ▸
        </span>
      </button>
      {open && (
        <ul
          id={listId}
          className={
            panel
              ? "mt-1 ml-3 flex flex-col gap-1 border-l border-border-c/60 pl-2"
              : "absolute top-full left-0 z-50 mt-1 min-w-48 rounded-lg border border-border-c bg-surface p-1 shadow-xl"
          }
        >
          {entry.children.map((child) => (
            <ViewItem
              key={child.id}
              entry={child}
              ctx={ctx}
              view={view}
              t={t}
              panel
              onSelect={() => {
                if (!panel) setOpen(false);
                handlers.onNavigate(child.view);
              }}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ViewItem({
  entry,
  ctx,
  view,
  t,
  panel,
  onSelect,
}: {
  entry: NavEntry;
  ctx: NavContext;
  view: ViewId | null;
  t: TranslateFn;
  panel: boolean;
  onSelect: () => void;
}) {
  const active = isActive(entry, view);
  const badge = badgeOf(entry, ctx);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        className={itemCls(active, panel)}
      >
        {panel && entry.icon && (
          <span className="mr-2 inline-flex">
            <EntryIcon id={entry.icon} />
          </span>
        )}
        {t(entry.labelKey)}
        {badge && <Badge badge={badge} t={t} />}
      </button>
    </li>
  );
}

/**
 * The main entries as a list: a row in the header from `md` up, a column in
 * the mobile menu (`panel`), where the icon row's entries follow with labels.
 */
export function MainNav({
  entries,
  ctx,
  view,
  t,
  handlers,
  panel = false,
  label,
}: {
  entries: NavEntry[];
  ctx: NavContext;
  view: ViewId | null;
  t: TranslateFn;
  handlers: NavHandlers;
  panel?: boolean;
  label: string;
}) {
  return (
    <ul
      aria-label={label}
      className={panel ? "flex flex-col gap-1" : "flex items-center gap-1"}
    >
      {entries.map((entry) =>
        entry.kind === "group" ? (
          <GroupItem
            key={entry.id}
            entry={entry}
            ctx={ctx}
            view={view}
            t={t}
            handlers={handlers}
            panel={panel}
          />
        ) : (
          <ViewItem
            key={entry.id}
            entry={entry}
            ctx={ctx}
            view={view}
            t={t}
            panel={panel}
            onSelect={() =>
              entry.kind === "view" ? handlers.onNavigate(entry.view) : handlers.onAction(entry.action)
            }
          />
        ),
      )}
    </ul>
  );
}

/** The icon buttons at the right of the header. */
export function UtilityNav({
  entries,
  ctx,
  view,
  t,
  handlers,
}: {
  entries: NavEntry[];
  ctx: NavContext;
  view: ViewId | null;
  t: TranslateFn;
  handlers: NavHandlers;
}) {
  return (
    <>
      {entries.map((entry) => {
        if (entry.kind === "group") return null;
        const active = isActive(entry, view);
        const badge = badgeOf(entry, ctx);
        const label = t(entry.labelKey);
        return (
          <button
            key={entry.id}
            type="button"
            title={label}
            aria-current={active ? "page" : undefined}
            onClick={() =>
              entry.kind === "view" ? handlers.onNavigate(entry.view) : handlers.onAction(entry.action)
            }
            className={`relative shrink-0 rounded-lg p-2 transition-colors ${
              active ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {entry.icon && <EntryIcon id={entry.icon} />}
            <span className="sr-only">{label}</span>
            {badge && <Badge badge={badge} t={t} corner />}
          </button>
        );
      })}
    </>
  );
}
