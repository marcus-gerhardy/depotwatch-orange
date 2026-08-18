/** @vitest-environment jsdom */
import { readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "@/lib/types";
import {
  DASHBOARD_COLS,
  defaultDashboard,
  sanitizeDashboard,
} from "@/lib/dashboardLayout";
import { clearMarketDataCache } from "@/lib/marketData";
import Dashboard from "./Dashboard";
import { WIDGETS, WIDGETS_BY_ID } from "./widgets/registry";

// jsdom has no matchMedia, so the dashboard renders its single-column stack.
// That keeps these tests on the widgets themselves rather than on the drag
// layer, which needs a measured DOM to do anything at all.

function load(
  transactions: Transaction[] = [],
  uiSettings?: PortfolioFile["uiSettings"],
): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions }],
    },
  ];
  p.uiSettings = uiSettings;
  // A widget that only exists once its subject is configured (`available`)
  // needs that subject here, or it would be filtered out and this test would
  // assert nothing about it. Rendering it is the whole point.
  p.settings = { ...p.settings, savingsGoal: { targetBtc: "1" } };
  useAppStore.setState({ portfolio: p, privacyMode: false, dirty: false });
  return p;
}

/** The layout as it is stored in the open portfolio file. */
function storedLayout() {
  return useAppStore.getState().portfolio?.uiSettings?.dashboardLayout;
}

const tx = (
  type: Transaction["type"],
  date: string,
  amountBtc: string,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id: `${type}-${date}-${amountBtc}`,
  type,
  date,
  amountBtc,
  pricePerBtcEur: "50000",
  totalFiatEur: null,
  note: "",
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  clearMarketDataCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      text: async () => "900000",
      json: async () =>
        url.includes("ticker/price") ? { price: "100000" } : [],
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("widget registry", () => {
  it("only places widgets that exist, within their own size limits", () => {
    for (const p of defaultDashboard()) {
      const def = WIDGETS_BY_ID.get(p.widgetId);
      expect(def, `unknown widget "${p.widgetId}" in the default layout`).toBeDefined();
      expect(p.w).toBeGreaterThanOrEqual(def!.minSize.w);
      expect(p.h).toBeGreaterThanOrEqual(def!.minSize.h);
      if (def!.maxSize) {
        expect(p.w).toBeLessThanOrEqual(def!.maxSize.w);
        expect(p.h).toBeLessThanOrEqual(def!.maxSize.h);
      }
    }
  });

  it("places every registered widget in the default layout, exactly once", () => {
    // The default dashboard is meant to show all of them, so a new registry
    // entry that nobody added to a band fails here rather than going
    // unnoticed. The exception is a widget that only exists once the user has
    // configured its subject (`available`): putting a "no target set" tile on
    // everybody's dashboard is exactly what that flag exists to avoid.
    const placed = defaultDashboard().map((p) => p.widgetId);
    const expected = WIDGETS.filter((w) => !w.available).map((w) => w.id);
    expect([...placed].sort()).toEqual(expected.sort());
  });

  it("has a unique id per entry", () => {
    const ids = WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("every registry widget renders", () => {
  // One tile per registry entry, mounted for real. A widget is one entry plus
  // one component, and nothing else in the app knows it by name — so nothing
  // else would notice if a new one threw on an empty portfolio, on a portfolio
  // with data, or on the very first frame before its data arrives.
  const portfolios: [string, () => void][] = [
    ["an empty portfolio", () => load([])],
    [
      "a portfolio with history",
      () =>
        load([
          tx("buy", "2024-01-01T00:00:00Z", "1", { feeFiatEur: "10" }),
          tx("buy", "2026-02-01T00:00:00Z", "0.5", { totalFiatEur: "25000" }),
          tx("transfer_out", "2026-03-01T00:00:00Z", "0.2", { feeBtc: "0.0001" }),
          tx("sell", "2026-04-01T00:00:00Z", "0.1", {
            lotAllocations: [
              { lotTransactionId: "buy-2024-01-01T00:00:00Z-1", amountBtc: "0.1" },
            ],
          }),
        ]),
    ],
  ];

  for (const [label, setup] of portfolios) {
    for (const def of WIDGETS) {
      it(`${def.id} on ${label}`, () => {
        setup();
        // A tile is on the dashboard only if the layout places it, so place
        // exactly this one instead of relying on the default layout.
        useAppStore.setState({
          portfolio: {
            ...useAppStore.getState().portfolio!,
            uiSettings: {
              dashboardLayout: [
                {
                  i: `${def.id}-1`,
                  widgetId: def.id,
                  x: 0,
                  y: 0,
                  w: def.defaultSize.w,
                  h: def.defaultSize.h,
                },
              ],
            },
          },
        });
        render(<Dashboard />);
        expect(screen.getAllByText(def.titleKey).length).toBeGreaterThan(0);
        // A widget that threw is replaced by the boundary's message. Matched
        // as a pattern: the boundary renders it behind a warning icon, and an
        // exact string would quietly match nothing and assert nothing.
        expect(screen.queryByText(/dashboard\.widgets\.crashed/)).toBeNull();
      });
    }
  }
});

describe("Dashboard: the watchlist widgets without a single address", () => {
  const place = (widgetId: string) => {
    load([]);
    useAppStore.setState({
      portfolio: {
        ...useAppStore.getState().portfolio!,
        uiSettings: {
          dashboardLayout: [{ i: `${widgetId}-1`, widgetId, x: 0, y: 0, w: 4, h: 6 }],
        },
      },
    });
  };

  for (const widgetId of ["utxoOverview", "watchlistStatus"]) {
    it(`${widgetId} offers to add one instead of only naming the gap`, () => {
      place(widgetId);
      const onOpenWatchlist = vi.fn();
      render(<Dashboard onOpenWatchlist={onOpenWatchlist} />);

      expect(screen.getByText("dashboard.widgets.watchlistEmpty")).toBeTruthy();
      fireEvent.click(screen.getByText(/watchlist\.add/));
      // Not just the tab: the form the button promises has to be open on
      // arrival, otherwise the label is a lie.
      expect(onOpenWatchlist).toHaveBeenCalledWith({ add: true });
    });
  }
});

describe("Dashboard: default layout", () => {
  it("renders the widgets of the default layout", () => {
    load([tx("buy", "2026-01-01T00:00:00Z", "1")]);
    render(<Dashboard />);
    for (const p of defaultDashboard()) {
      const def = WIDGETS_BY_ID.get(p.widgetId)!;
      expect(screen.getAllByText(def.titleKey).length).toBeGreaterThan(0);
    }
  });
});

describe("Dashboard: adding and removing widgets", () => {
  it("adds a picked widget and writes it back only when the session ends", () => {
    load([], { dashboardLayout: [] });
    const { unmount } = render(<Dashboard />);

    expect(screen.getByText("dashboard.widgets.emptyDashboard")).toBeTruthy();
    fireEvent.click(screen.getByText(/dashboard\.widgets\.addWidget/));

    // Picker lists every registry entry; pick the sats stack.
    fireEvent.click(screen.getByText("dashboard.widgets.satsStack.title"));
    expect(screen.getByText("dashboard.widgets.satsStack.title")).toBeTruthy();

    // Still unwritten: picking a widget alone must not touch the file.
    expect(storedLayout()).toEqual([]);
    expect(useAppStore.getState().dirty).toBe(false);

    // Leaving the dashboard ends the editing session and commits once.
    unmount();
    expect(storedLayout()?.map((p) => p.widgetId)).toEqual(["satsStack"]);
    expect(useAppStore.getState().dirty).toBe(true);
  });

  it("leaves the file untouched when nothing was changed", () => {
    const layout = [
      { i: "satsStack-1", widgetId: "satsStack", x: 0, y: 0, w: 4, h: 4 },
    ];
    load([], { dashboardLayout: layout });
    const { unmount } = render(<Dashboard />);
    unmount();

    expect(useAppStore.getState().dirty).toBe(false);
    expect(storedLayout()).toEqual(layout);
  });

  it("falls back to the default layout without writing it into an older file", () => {
    load([tx("buy", "2026-01-01T00:00:00Z", "1")]);
    const { unmount } = render(<Dashboard />);
    const def = WIDGETS_BY_ID.get(defaultDashboard()[0].widgetId)!;
    expect(screen.getAllByText(def.titleKey).length).toBeGreaterThan(0);

    // Just looking at the dashboard must not add uiSettings to a file that
    // never had them, and must not mark it as changed.
    unmount();
    expect(useAppStore.getState().portfolio?.uiSettings).toBeUndefined();
    expect(useAppStore.getState().dirty).toBe(false);
  });
});

describe("Dashboard: data quality widget", () => {
  it("counts open issues and jumps into the filtered table", () => {
    load(
      [
        // A transfer leg without a counterpart and without a txid.
        tx("transfer_out", "2026-01-02T00:00:00Z", "0.5"),
        // A buy with no EUR figure at all.
        tx("buy", "2026-01-01T00:00:00Z", "1", {
          pricePerBtcEur: null,
          totalFiatEur: null,
        }),
      ],
      {
        dashboardLayout: [
          { i: "dataQuality-1", widgetId: "dataQuality", x: 0, y: 0, w: 4, h: 3 },
        ],
      },
    );
    const onOpenTransactions = vi.fn();
    render(<Dashboard onOpenTransactions={onOpenTransactions} />);

    const unlinked = screen.getByText("dashboard.widgets.issues.unlinkedTransfer");
    const missingEur = screen.getByText("dashboard.widgets.issues.missingEurValue");
    expect(unlinked.parentElement?.textContent).toContain("1");
    expect(missingEur.parentElement?.textContent).toContain("1");

    fireEvent.click(unlinked);
    expect(onOpenTransactions).toHaveBeenCalledWith({ issue: "unlinkedTransfer" });
  });
});

describe("shipped demo portfolios", () => {
  // The demo file is what a new user sees first, so its uiSettings has to be
  // renderable as written: every widget id known, nothing overlapping, and no
  // widget hanging over the right edge of the grid.
  for (const file of ["demo-portfolio.json", "demo-portfolio.en.json"]) {
    it(`ships a usable dashboard layout in ${file}`, () => {
      const demo = JSON.parse(
        readFileSync(path.resolve(__dirname, "../public", file), "utf-8"),
      ) as PortfolioFile;
      const stored = demo.uiSettings?.dashboardLayout;
      expect(stored, "demo file has no dashboard layout").toBeDefined();

      const known = new Set(WIDGETS.map((w) => w.id));
      expect(sanitizeDashboard(stored, known)).toEqual(stored);

      const seen = new Set<string>();
      for (const p of stored!) {
        expect(p.x + p.w).toBeLessThanOrEqual(DASHBOARD_COLS);
        const def = WIDGETS_BY_ID.get(p.widgetId)!;
        expect(p.w).toBeGreaterThanOrEqual(def.minSize.w);
        expect(p.h).toBeGreaterThanOrEqual(def.minSize.h);
        for (let y = p.y; y < p.y + p.h; y++) {
          for (let x = p.x; x < p.x + p.w; x++) {
            expect(seen.has(`${x}:${y}`)).toBe(false);
            seen.add(`${x}:${y}`);
          }
        }
      }
    });
  }
});

describe("the single-column layout of a narrow screen", () => {
  // A tile there is as tall as its content: the grid height is a desktop
  // figure, chosen so the tiles beside it in its row line up, and imposing it
  // on a stacked column leaves four lines of text on a tile of empty space.
  // The exception is content with no height of its own — a chart fills what it
  // is given and collapses to nothing when that is "as tall as the content" —
  // so those widgets, and only those, name a height in the registry.
  it("gives a height to exactly the widgets whose content is a chart", () => {
    const withHeight = WIDGETS.filter((w) => w.mobileHeight !== undefined).map(
      (w) => w.id,
    );
    expect(withHeight.sort()).toEqual(
      ["dca", "portfolioChart", "priceEntries", "stackHistory"].sort(),
    );
  });

  it("keeps those heights readable rather than a token gesture", () => {
    for (const w of WIDGETS) {
      if (w.mobileHeight === undefined) continue;
      expect(w.mobileHeight, w.id).toBeGreaterThanOrEqual(240);
    }
  });
});
