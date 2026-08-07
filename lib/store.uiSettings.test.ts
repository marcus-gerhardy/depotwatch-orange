/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { deserializePortfolio, serializePortfolio, useAppStore } from "./store";
import { emptyPortfolio, type DashboardWidgetPlacement } from "./types";

const layout: DashboardWidgetPlacement[] = [
  { i: "pnl-1", widgetId: "pnl", x: 0, y: 0, w: 4, h: 4 },
];

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    portfolio: emptyPortfolio(),
    fileMode: "fallback",
    fileHandle: null,
    dirty: false,
    uiTheme: "ocean",
  });
});

describe("uiSettings in the store", () => {
  it("stores the dashboard layout in the portfolio file", () => {
    useAppStore.getState().saveDashboardLayout(layout);
    expect(useAppStore.getState().portfolio?.uiSettings?.dashboardLayout).toEqual(layout);
    expect(useAppStore.getState().dirty).toBe(true);
  });

  it("ignores a layout that equals the stored one", () => {
    useAppStore.getState().saveDashboardLayout(layout);
    const after = useAppStore.getState().portfolio;
    useAppStore.setState({ dirty: false });

    // A structurally equal but different array must not cause a save: the
    // dashboard commits its whole working copy whenever a session ends.
    useAppStore.getState().saveDashboardLayout([{ ...layout[0] }]);
    expect(useAppStore.getState().dirty).toBe(false);
    expect(useAppStore.getState().portfolio).toBe(after); // untouched object
  });

  it("keeps the two settings independent", () => {
    useAppStore.getState().saveDashboardLayout(layout);
    useAppStore.getState().saveTransactionColumns(["date", "amount"]);
    expect(useAppStore.getState().portfolio?.uiSettings).toEqual({
      dashboardLayout: layout,
      transactionColumns: ["date", "amount"],
    });
  });
});

describe("uiSettings in the file format", () => {
  it("survives a serialize/deserialize round trip", async () => {
    const p = emptyPortfolio();
    p.uiSettings = { dashboardLayout: layout, transactionColumns: ["date"] };
    const { portfolio } = await deserializePortfolio(serializePortfolio(p), null);
    expect(portfolio.uiSettings).toEqual(p.uiSettings);
  });

  it("accepts a file written before uiSettings existed", async () => {
    const p = emptyPortfolio();
    const json = JSON.parse(serializePortfolio(p)) as Record<string, unknown>;
    delete json.uiSettings;
    const { portfolio } = await deserializePortfolio(JSON.stringify(json), null);
    expect(portfolio.uiSettings).toBeUndefined();
    expect(portfolio.wallets).toEqual([]);
  });
});

describe("colour theme in the store", () => {
  it("writes the choice to the file and to the device preference", () => {
    useAppStore.getState().setUiTheme("night");

    expect(useAppStore.getState().uiTheme).toBe("night");
    expect(useAppStore.getState().portfolio?.settings.theme).toBe("night");
    expect(localStorage.getItem("depotwatch.theme")).toBe("night");
    expect(useAppStore.getState().dirty).toBe(true);
  });

  it("adopts the theme of a file that is opened", () => {
    const portfolio = emptyPortfolio();
    portfolio.settings.theme = "night";
    useAppStore.getState().openPortfolio({
      portfolio,
      handle: null,
      fileName: "test.dwp",
      password: null,
    });

    expect(useAppStore.getState().uiTheme).toBe("night");
    expect(localStorage.getItem("depotwatch.theme")).toBe("night");
  });

  it("keeps the current theme for a file written before themes existed", () => {
    useAppStore.getState().setUiTheme("night");
    const portfolio = emptyPortfolio();
    delete portfolio.settings.theme;

    useAppStore.getState().openPortfolio({
      portfolio,
      handle: null,
      fileName: "old.dwp",
      password: null,
    });

    expect(useAppStore.getState().uiTheme).toBe("night");
  });

  it("reads the remembered theme on start, ignoring junk", () => {
    localStorage.setItem("depotwatch.theme", "sepia");
    useAppStore.getState().initUiTheme();
    expect(useAppStore.getState().uiTheme).toBe("ocean");

    localStorage.setItem("depotwatch.theme", "night");
    useAppStore.getState().initUiTheme();
    expect(useAppStore.getState().uiTheme).toBe("night");
  });
});
