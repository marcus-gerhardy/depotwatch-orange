/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import { defaultDashboard, type WidgetPlacement } from "@/lib/dashboardLayout";
import { clearMarketDataCache } from "@/lib/marketData";
import Dashboard from "./Dashboard";
import { isWidgetAvailable } from "./widgets/registry";

// The grid path (react-grid-layout, loaded through next/dynamic) only runs on a
// wide viewport and only with a measured container, neither of which jsdom
// offers on its own — both are faked here so the drag layer, the size limits
// and the free-cell overlay are actually exercised.

const GRID_WIDTH = 1200;

function fakeWideViewport() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const real = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (el: Element, pseudo?: string | null) => {
    const style = real(el, pseudo ?? undefined);
    return new Proxy(style, {
      get: (target, key) =>
        key === "width" ? `${GRID_WIDTH}px` : Reflect.get(target, key),
    });
  });
}

const layout: WidgetPlacement[] = [
  { i: "satsStack-1", widgetId: "satsStack", x: 0, y: 0, w: 4, h: 4 },
  { i: "dataQuality-1", widgetId: "dataQuality", x: 4, y: 0, w: 4, h: 4 },
];

beforeEach(() => {
  localStorage.clear();
  clearMarketDataCache();
  fakeWideViewport();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      text: async () => "900000",
      json: async () => ({ price: "100000" }),
    })),
  );
  const p = emptyPortfolio();
  p.uiSettings = { dashboardLayout: layout };
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "a1",
          name: "Spot",
          transactions: [
            {
              id: "b1",
              type: "buy",
              date: "2026-01-01T00:00:00Z",
              amountBtc: "1",
              pricePerBtcEur: "50000",
              totalFiatEur: null,
              note: "",
            },
          ],
        },
      ],
    },
  ];
  useAppStore.setState({ portfolio: p, privacyMode: false, dirty: false });
});

/** The layout as it is stored in the open portfolio file. */
function storedLayout() {
  return useAppStore.getState().portfolio?.uiSettings?.dashboardLayout;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DashboardGrid", () => {
  it("renders every placement as a grid item", async () => {
    const { container } = render(<Dashboard />);
    await waitFor(() =>
      expect(container.querySelectorAll(".react-grid-item")).toHaveLength(2),
    );
  });

  it("offers a '+' placeholder for the free space only while editing", async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/common\.edit/)).toBeTruthy());

    expect(screen.queryAllByTitle("dashboard.widgets.addHere")).toHaveLength(0);

    fireEvent.click(screen.getByText(/common\.edit/));
    // The layout leaves columns 8..11 free next to the two widgets, plus the
    // spare rows below them, so there is something to add into.
    const placeholders = await screen.findAllByTitle("dashboard.widgets.addHere");
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it("adds a widget at the clicked cell, writing it back once on leaving edit mode", async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/common\.edit/)).toBeTruthy());
    fireEvent.click(screen.getByText(/common\.edit/));

    const placeholders = await screen.findAllByTitle("dashboard.widgets.addHere");
    fireEvent.click(placeholders[0]);
    fireEvent.click(screen.getByText("dashboard.widgets.halving.title"));

    // Nothing written while the editing session is still running.
    expect(storedLayout()).toEqual(layout);
    expect(useAppStore.getState().dirty).toBe(false);

    fireEvent.click(screen.getByText(/dashboard\.widgets\.doneEditing/));
    await waitFor(() =>
      expect(storedLayout()?.map((p) => p.widgetId)).toContain("halving"),
    );
    expect(useAppStore.getState().dirty).toBe(true);
  });

  it("removes a widget from the layout and from the file", async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/common\.edit/)).toBeTruthy());
    fireEvent.click(screen.getByText(/common\.edit/));

    const remove = await screen.findAllByLabelText("dashboard.widgets.remove");
    fireEvent.click(remove[0]);
    fireEvent.click(screen.getByText(/dashboard\.widgets\.doneEditing/));

    await waitFor(() =>
      expect(storedLayout()?.map((p) => p.i)).toEqual(["dataQuality-1"]),
    );
  });

  it("leaves the demo portfolio's layout alone for the same reason", async () => {
    // The demo file ships its own arrangement; if the grid compacted it on
    // mount, simply looking at the dashboard would mark the demo as edited.
    const demo = JSON.parse(readFileSync("public/demo-portfolio.json", "utf8")) as {
      settings: PortfolioFile["settings"];
      uiSettings: { dashboardLayout: WidgetPlacement[] };
    };
    const p = useAppStore.getState().portfolio!;
    useAppStore.setState({
      portfolio: {
        ...p,
        // Its settings come along: a tile the file cannot fill (the savings
        // goal, §4.4) would be filtered out and leave the hole this test is
        // about.
        settings: { ...p.settings, savingsGoal: demo.settings.savingsGoal },
        uiSettings: { dashboardLayout: demo.uiSettings.dashboardLayout },
      },
      dirty: false,
    });

    const { unmount } = render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/common\.edit/)).toBeTruthy());
    unmount();

    expect(useAppStore.getState().dirty).toBe(false);
  });

  it("leaves the default layout alone: the grid's own compaction changes nothing", async () => {
    // react-grid-layout compacts on mount and reports the result. If that
    // differed from what was stored, merely opening the dashboard would dirty
    // the file, so the shipped default has to be a compaction fixed point.
    // This portfolio has no savings goal, so what is checked here is the
    // variant with that band's `fallback` in it (§4.4) — the one nearly every
    // file gets.
    const p = useAppStore.getState().portfolio!;
    const stored = defaultDashboard((id) => isWidgetAvailable(id, p));
    expect(stored.some((w) => w.widgetId === "savingsGoal")).toBe(false);
    useAppStore.setState({
      portfolio: { ...p, uiSettings: { dashboardLayout: stored } },
      dirty: false,
    });

    const { unmount } = render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/common\.edit/)).toBeTruthy());
    unmount();

    expect(useAppStore.getState().dirty).toBe(false);
    expect(storedLayout()).toEqual(stored);
  });

  it("does not touch the file when a session ends without changes", async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/common\.edit/)).toBeTruthy());
    fireEvent.click(screen.getByText(/common\.edit/));
    fireEvent.click(screen.getByText(/dashboard\.widgets\.doneEditing/));

    expect(useAppStore.getState().dirty).toBe(false);
    expect(storedLayout()).toEqual(layout);
  });
});
