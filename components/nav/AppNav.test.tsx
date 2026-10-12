/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import type { NavEntry } from "@/lib/navigation";
import AppShell from "../AppShell";
import StartShell from "../StartShell";
import { MainNav } from "./AppNav";

// The calculator's chart needs a canvas; it is not what is tested here.
vi.mock("../dca/DcaChart", () => ({ default: () => null }));

function portfolio(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w",
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "a",
          name: "Spot",
          transactions: [
            {
              id: "t1",
              type: "buy",
              date: "2024-01-01T00:00:00.000Z",
              amountBtc: "0.1",
              pricePerBtcEur: null,
              totalFiatEur: null,
              note: "",
            },
            {
              id: "t2",
              type: "transfer_out",
              date: "2024-02-01T00:00:00.000Z",
              amountBtc: "0.05",
              pricePerBtcEur: null,
              totalFiatEur: null,
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

const inGerman = (ui: React.ReactNode) => render(<I18nProvider locale="de">{ui}</I18nProvider>);

/** The desktop row of the main navigation. */
const mainRow = () => screen.getAllByRole("list", { name: "Hauptnavigation" })[0];

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    portfolio: portfolio(),
    fileMode: "fallback",
    fileName: "test.dwp",
    encryptionEnabled: false,
    dirty: false,
    needsFileSetup: false,
    readOnly: false,
    privacyMode: false,
    milestoneQueue: [],
    lastSavedAt: null,
  });
});

afterEach(cleanup);

describe("main navigation with a file open", () => {
  it("lists the five entries in order, and nothing else", () => {
    inGerman(<AppShell />);
    const labels = within(mainRow())
      .getAllByRole("button")
      .map((b) => b.textContent?.replace(/\d+/g, "").replace(/,.*$/, "").trim());
    expect(labels).toEqual([
      "Dashboard",
      "Transaktionen",
      "Wallets & Konten",
      "Steuer",
      "Sparplanrechner",
    ]);
  });

  it("marks the active entry and counts open items at Transaktionen", () => {
    inGerman(<AppShell />);
    const row = within(mainRow());
    expect(row.getByRole("button", { name: /^Dashboard/ }).getAttribute("aria-current")).toBe(
      "page",
    );
    // One buy without a EUR value, one transfer without its counterpart.
    expect(row.getByRole("button", { name: /^Transaktionen\s*, 2 offene Punkte$/ })).toBeTruthy();
  });

  it("opens the settings from the icon, keeping it highlighted on the milestones", () => {
    inGerman(<AppShell />);
    const gear = screen.getAllByRole("button", { name: /^Einstellungen/ })[0];
    fireEvent.click(gear);
    expect(gear.getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: /Meilensteine/ }));
    expect(screen.getAllByText("Meilensteine").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /^Einstellungen/ })[0].getAttribute("aria-current"),
    ).toBe("page");
  });

  it("shows the watched addresses as a tab of Wallets & Konten", () => {
    inGerman(<AppShell />);
    fireEvent.click(within(mainRow()).getByRole("button", { name: "Wallets & Konten" }));
    const tabs = screen.getByRole("tablist", { name: "Wallets & Konten" });
    const addresses = within(tabs).getByRole("tab", { name: "Adressen" });
    expect(addresses.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(addresses);
    expect(addresses.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toMatch(/Adresse/);
    // The wallets entry stays the active one.
    expect(
      within(mainRow()).getByRole("button", { name: "Wallets & Konten" }).getAttribute("aria-current"),
    ).toBe("page");

    // Arrow keys move between the tabs.
    fireEvent.keyDown(tabs, { key: "ArrowLeft" });
    expect(within(tabs).getByRole("tab", { name: "Übersicht" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("keeps every entry reachable in read-only mode", () => {
    useAppStore.setState({ readOnly: true });
    inGerman(<AppShell />);
    expect(within(mainRow()).getAllByRole("button")).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: /^Einstellungen/ }).length).toBeGreaterThan(0);
  });
});

describe("without a file", () => {
  beforeEach(() => {
    useAppStore.setState({ portfolio: null, fileName: null });
  });

  it("offers only what works without one, hidden rather than greyed out", () => {
    inGerman(<StartShell />);
    const row = within(mainRow());
    expect(row.getAllByRole("button").map((b) => b.textContent)).toEqual(["Sparplanrechner"]);
    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.queryByRole("button", { name: /Transaktionen/ })).toBeNull();
  });

  it("opens the calculator and the device settings, and comes back to the start", () => {
    inGerman(<StartShell />);
    fireEvent.click(within(mainRow()).getByRole("button", { name: "Sparplanrechner" }));
    expect(screen.getByRole("button", { name: "Berechnen" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /^Einstellungen/ })[0]);
    expect(screen.getByText(/Ohne geöffnete Datei/)).toBeTruthy();
    expect(screen.getByText("Farbschema")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Startseite/ }));
    expect(screen.getByText("Portfolio-Datei öffnen")).toBeTruthy();
  });
});

describe("a group entry", () => {
  it("opens as a menu and navigates from its children", () => {
    const onNavigate = vi.fn();
    const entries: NavEntry[] = [
      {
        kind: "group",
        id: "tools",
        labelKey: "Werkzeuge",
        children: [
          { kind: "view", id: "dca", labelKey: "Sparplanrechner", view: "dca" },
          { kind: "view", id: "pit", labelKey: "Stichtag", view: "pointInTime" },
        ],
      },
    ];
    render(
      <MainNav
        entries={entries}
        ctx={{ hasFile: true, taxEnabled: true, openItems: 0, backupDue: false }}
        view="pointInTime"
        t={(k) => k}
        handlers={{ onNavigate, onAction: vi.fn() }}
        label="nav"
      />,
    );
    const group = screen.getByRole("button", { name: /Werkzeuge/ });
    expect(group.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(group);
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Stichtag" }).getAttribute("aria-current")).toBe(
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "Sparplanrechner" }));
    expect(onNavigate).toHaveBeenCalledWith("dca");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Stichtag" })).toBeNull();
  });
});
