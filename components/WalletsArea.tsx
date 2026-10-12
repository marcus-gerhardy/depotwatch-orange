"use client";

// "Wallets & accounts" with its two tabs: the wallets and accounts of the
// ledger, and the watched addresses.
//
// Only the navigation is shared. The ledger and the address watchlist stay
// two separate layers (CLAUDE.md, invariant 7): neither tab reads the other's
// data, and nothing here links a wallet to an address.

import { useId, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import type { WalletsTab } from "@/lib/navigation";
import { SectionTitle } from "./ui";

const TABS: WalletsTab[] = ["overview", "addresses"];

export default function WalletsArea({
  tab,
  onTabChange,
  overview,
  addresses,
}: {
  tab: WalletsTab;
  onTabChange: (tab: WalletsTab) => void;
  overview: React.ReactNode;
  addresses: React.ReactNode;
}) {
  const { t } = useI18n();
  const base = useId();
  const refs = useRef<Partial<Record<WalletsTab, HTMLButtonElement | null>>>({});

  // Arrow keys move between the tabs (WAI-ARIA tabs pattern, automatic
  // activation): the tab list is one stop in the tab order.
  function onKeyDown(e: React.KeyboardEvent) {
    const i = TABS.indexOf(tab);
    let next: WalletsTab | null = null;
    if (e.key === "ArrowRight") next = TABS[(i + 1) % TABS.length];
    if (e.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length];
    if (e.key === "Home") next = TABS[0];
    if (e.key === "End") next = TABS[TABS.length - 1];
    if (next === null) return;
    e.preventDefault();
    onTabChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="space-y-4">
      <SectionTitle level={1}>{t("wallets.title")}</SectionTitle>
      <div
        role="tablist"
        aria-label={t("wallets.title")}
        onKeyDown={onKeyDown}
        className="-mt-1 flex gap-1 border-b border-border-c/60"
      >
        {TABS.map((id) => {
          const selected = id === tab;
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                selected
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t(`wallets.tabs.${id}`)}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${tab}`}>
        {tab === "overview" ? overview : addresses}
      </div>
    </div>
  );
}
