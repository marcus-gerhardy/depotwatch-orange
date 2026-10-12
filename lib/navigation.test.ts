import { describe, expect, it } from "vitest";
import {
  MAIN_NAV,
  UTILITY_NAV,
  badgeOf,
  isActive,
  openItemCount,
  visibleNav,
  type NavContext,
  type NavEntry,
} from "./navigation";
import { flattenLedger, type Transaction, type Wallet } from "./types";

const ctx = (patch: Partial<NavContext> = {}): NavContext => ({
  hasFile: true,
  taxEnabled: true,
  openItems: 0,
  backupDue: false,
  ...patch,
});

const ids = (entries: NavEntry[]) => entries.map((e) => e.id);
const entry = (entries: NavEntry[], id: string) => entries.find((e) => e.id === id)!;

describe("main navigation", () => {
  it("has exactly the five entries, in order", () => {
    expect(ids(visibleNav(MAIN_NAV, ctx()))).toEqual([
      "dashboard",
      "transactions",
      "wallets",
      "tax",
      "dca",
    ]);
  });

  it("offers nothing a file is needed for when none is open", () => {
    expect(ids(visibleNav(MAIN_NAV, ctx({ hasFile: false })))).toEqual(["dca"]);
    expect(ids(visibleNav(UTILITY_NAV, ctx({ hasFile: false })))).toEqual(["settings", "help"]);
  });

  it("drops the tax entry with the tax features", () => {
    expect(ids(visibleNav(MAIN_NAV, ctx({ taxEnabled: false })))).not.toContain("tax");
  });

  it("keeps sub-pages and tabs highlighted on their entry", () => {
    expect(isActive(entry(MAIN_NAV, "wallets"), "walletDetail")).toBe(true);
    expect(isActive(entry(MAIN_NAV, "tax"), "pointInTime")).toBe(true);
    expect(isActive(entry(UTILITY_NAV, "settings"), "milestones")).toBe(true);
    expect(isActive(entry(UTILITY_NAV, "settings"), "yearInReview")).toBe(true);
    expect(isActive(entry(MAIN_NAV, "dashboard"), "milestones")).toBe(false);
    expect(isActive(entry(MAIN_NAV, "dca"), null)).toBe(false);
  });
});

describe("counters", () => {
  it("appear only when there is something open", () => {
    const tx = entry(MAIN_NAV, "transactions");
    expect(badgeOf(tx, ctx())).toBeNull();
    expect(badgeOf(tx, ctx({ openItems: 3 }))).toEqual({
      kind: "count",
      value: 3,
      labelKey: "nav.openItems",
    });
  });

  it("mark the settings when a backup is due, and only with a file", () => {
    const settings = entry(UTILITY_NAV, "settings");
    expect(badgeOf(settings, ctx())).toBeNull();
    expect(badgeOf(settings, ctx({ backupDue: true }))?.kind).toBe("dot");
    expect(badgeOf(settings, ctx({ hasFile: false, backupDue: true }))).toBeNull();
  });

  it("count unlinked transfers and transactions without a EUR value", () => {
    const t = (patch: Partial<Transaction>): Transaction => ({
      id: Math.random().toString(36),
      type: "buy",
      date: "2024-01-01T00:00:00.000Z",
      amountBtc: "0.1",
      pricePerBtcEur: "40000",
      totalFiatEur: "4000",
      note: "",
      ...patch,
    });
    const wallets: Wallet[] = [
      {
        id: "w",
        name: "W",
        type: "exchange",
        accounts: [
          {
            id: "a",
            name: "A",
            transactions: [
              t({}),
              t({ pricePerBtcEur: null, totalFiatEur: null }),
              t({ type: "transfer_out", pricePerBtcEur: null, totalFiatEur: null }),
            ],
          },
        ],
      },
    ];
    expect(openItemCount(flattenLedger(wallets))).toBe(2);
  });
});

describe("groups (for a later 'Tools' entry)", () => {
  const tools: NavEntry = {
    kind: "group",
    id: "tools",
    labelKey: "nav.tools",
    children: [
      { kind: "view", id: "dca", labelKey: "nav.dca", view: "dca" },
      {
        kind: "view",
        id: "pointInTime",
        labelKey: "nav.pointInTime",
        view: "pointInTime",
        visible: (c) => c.hasFile,
        badge: () => ({ kind: "count", value: 2, labelKey: "nav.openItems" }),
      },
    ],
  };

  it("keeps only visible children and drops a group left empty", () => {
    const shown = visibleNav([tools], ctx({ hasFile: false }));
    expect(shown).toHaveLength(1);
    expect((shown[0] as Extract<NavEntry, { kind: "group" }>).children.map((c) => c.id)).toEqual([
      "dca",
    ]);
    const empty: NavEntry = { ...tools, children: [tools.children[1]] } as NavEntry;
    expect(visibleNav([empty], ctx({ hasFile: false }))).toEqual([]);
  });

  it("is active and counts through its children", () => {
    expect(isActive(tools, "pointInTime")).toBe(true);
    expect(isActive(tools, "dashboard")).toBe(false);
    expect(badgeOf(tools, ctx())).toEqual({ kind: "count", value: 2, labelKey: "nav.openItems" });
  });
});
