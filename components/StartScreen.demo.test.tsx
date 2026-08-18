/** @vitest-environment jsdom */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import StartScreen from "./StartScreen";

const demoJson = readFileSync(
  path.resolve(__dirname, "../public/demo-portfolio.json"),
  "utf8",
);
const demoJsonEn = readFileSync(
  path.resolve(__dirname, "../public/demo-portfolio.en.json"),
  "utf8",
);

beforeEach(() => {
  useAppStore.setState({
    portfolio: null,
    fileMode: "fallback",
    fileHandle: null,
    fileName: null,
    password: null,
    encryptionEnabled: true,
    dirty: false,
    saving: false,
    lastSavedAt: null,
    needsFileSetup: false,
    privacyMode: false,
    uiLocale: "de",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => demoJson })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StartScreen: load demo portfolio", () => {
  it("loads the demo data without a file handle and flags it as needing setup", async () => {
    render(<StartScreen />);

    fireEvent.click(screen.getByRole("button", { name: "start.loadDemo" }));

    await waitFor(() => expect(useAppStore.getState().portfolio).not.toBeNull());

    const state = useAppStore.getState();
    expect(state.fileHandle).toBeNull();
    expect(state.needsFileSetup).toBe(true);
    expect(state.dirty).toBe(false);
    expect(state.portfolio!.wallets.length).toBeGreaterThanOrEqual(4);
    expect(fetch).toHaveBeenCalledWith("/demo-portfolio.json");
  });

  it("loads the English demo file when the interface language is English", async () => {
    render(
      <I18nProvider locale="en">
        <StartScreen />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load demo portfolio" }));

    await waitFor(() => expect(useAppStore.getState().portfolio).not.toBeNull());
    expect(fetch).toHaveBeenCalledWith("/demo-portfolio.en.json");
  });

  it("ships an English demo file with the same structure and no German leftovers", () => {
    const de = JSON.parse(demoJson);
    const en = JSON.parse(demoJsonEn);
    expect(en.settings.locale).toBe("en");
    expect(en.wallets.map((w: { id: string }) => w.id)).toEqual(
      de.wallets.map((w: { id: string }) => w.id),
    );
    // Notes, watchlist labels, and preset names are user-facing text.
    const texts = [
      ...en.wallets.flatMap((w: { accounts: { transactions: { note?: string }[] }[] }) =>
        w.accounts.flatMap((a) => a.transactions.map((tx) => tx.note ?? "")),
      ),
      ...en.watchedAddresses.map((a: { label: string }) => a.label),
      ...en.importPresets.map((p: { name: string }) => p.name),
    ];
    expect(texts.join(" ")).not.toMatch(/[äöüßÄÖÜ]|Beispiel|Kauf|Sammel/);
  });
});

describe("StartScreen: layout", () => {
  it("puts the drawn mark in front of the product name, like the app header", () => {
    // Drawn, not the bitcoin sign: none of the bundled fonts carries U+20BF, so the
    // character was a box on any device whose fallback lacks it too
    // (components/BrandMark.tsx). The heading's *text* is the name alone.
    render(<StartScreen />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("DepotWatch Orange");
    expect(heading.querySelector("svg")).not.toBeNull();
  });

  it("offers 'how it works' as a button-styled link", () => {
    render(<StartScreen />);
    const link = screen.getByRole("link", { name: /start\.howItWorks/ });
    expect(link.className).toContain("rounded-lg");
    expect(link.querySelector("svg")).toBeTruthy();
  });

  it("explains the demo via the button's tooltip and drops the file-access note", () => {
    render(<StartScreen />);
    const demo = screen.getByRole("button", { name: "start.loadDemo" });
    expect(demo.getAttribute("title")).toBe("start.demoHint");
    // The paragraph versions are gone from the page.
    expect(screen.queryByText("start.demoHint")).toBeNull();
    expect(screen.queryByText("start.fsaHint")).toBeNull();
    expect(screen.queryByText("start.fallbackHint")).toBeNull();
  });

  it("shows both languages in the header, with the active one marked", () => {
    render(<StartScreen />);

    const de = screen.getByRole("button", { name: "Deutsch" });
    const en = screen.getByRole("button", { name: "English" });
    expect(de.textContent).toBe("de");
    expect(en.textContent).toBe("en");
    expect(de.getAttribute("aria-pressed")).toBe("true");
    expect(en.getAttribute("aria-pressed")).toBe("false");
    // Both sit in the fixed header, not in the card.
    expect(de.closest("header")).toBeTruthy();
  });
});
