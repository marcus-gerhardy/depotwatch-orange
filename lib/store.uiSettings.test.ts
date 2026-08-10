/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { deserializePortfolio, serializePortfolio, useAppStore } from "./store";
import { emptyPortfolio, type DashboardWidgetPlacement } from "./types";
import { DEFAULT_APPEARANCE } from "./appearance";

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
    appearance: DEFAULT_APPEARANCE,
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

describe("appearance in the store", () => {
  it("writes the choice to the file and to the device preference", () => {
    useAppStore.getState().setAppearance({ theme: "night" });

    expect(useAppStore.getState().appearance.theme).toBe("night");
    expect(useAppStore.getState().portfolio?.uiSettings?.theme).toBe("night");
    expect(JSON.parse(localStorage.getItem("depotwatch.appearance")!).theme).toBe("night");
    expect(useAppStore.getState().dirty).toBe(true);
  });

  it("keeps the colour-vision option with the rest of the appearance", () => {
    useAppStore.getState().setAppearance({ colorBlindSafe: true });

    expect(useAppStore.getState().appearance.colorBlindSafe).toBe(true);
    expect(useAppStore.getState().portfolio?.uiSettings?.colorBlindSafe).toBe(true);
    // Independent of the theme: the theme itself is untouched.
    expect(useAppStore.getState().appearance.theme).toBe("ocean");
  });

  it("adopts the appearance of a file that is opened", () => {
    const portfolio = emptyPortfolio();
    portfolio.uiSettings = {
      theme: "terminal",
      themeMode: "system",
      themeLight: "sunrise",
      themeDark: "mono",
      colorBlindSafe: true,
    };
    useAppStore.getState().openPortfolio({
      portfolio,
      handle: null,
      fileName: "test.dwp",
      password: null,
    });

    expect(useAppStore.getState().appearance).toEqual({
      mode: "system",
      theme: "terminal",
      light: "sunrise",
      dark: "mono",
      colorBlindSafe: true,
    });
    expect(JSON.parse(localStorage.getItem("depotwatch.appearance")!).mode).toBe("system");
  });

  it("still reads the theme of a file written before it moved to uiSettings", () => {
    const portfolio = emptyPortfolio();
    portfolio.settings.theme = "night";
    useAppStore.getState().openPortfolio({
      portfolio,
      handle: null,
      fileName: "old.dwp",
      password: null,
    });

    expect(useAppStore.getState().appearance.theme).toBe("night");
  });

  it("keeps the current look for a file that says nothing about it", () => {
    useAppStore.getState().setAppearance({ theme: "gold" });
    const portfolio = emptyPortfolio();
    delete portfolio.settings.theme;

    useAppStore.getState().openPortfolio({
      portfolio,
      handle: null,
      fileName: "plain.dwp",
      password: null,
    });

    expect(useAppStore.getState().appearance.theme).toBe("gold");
  });

  it("reads the remembered appearance on start, ignoring junk", () => {
    localStorage.setItem("depotwatch.appearance", '{"theme":"sepia","mode":"weird"}');
    useAppStore.getState().initAppearance();
    expect(useAppStore.getState().appearance.theme).toBe("ocean");
    expect(useAppStore.getState().appearance.mode).toBe("fixed");

    localStorage.setItem("depotwatch.appearance", '{"theme":"paper"}');
    useAppStore.getState().initAppearance();
    expect(useAppStore.getState().appearance.theme).toBe("paper");
  });

  it("still understands the key that only held a theme id", () => {
    localStorage.removeItem("depotwatch.appearance");
    localStorage.setItem("depotwatch.theme", "mempool");
    useAppStore.getState().initAppearance();
    expect(useAppStore.getState().appearance.theme).toBe("mempool");
  });
});
