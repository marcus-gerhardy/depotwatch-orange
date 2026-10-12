/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio } from "@/lib/types";
import { I18nProvider } from "@/lib/i18n";
import { clearPriceCache } from "@/lib/dca/prices";
import DcaView from "./DcaView";

// The chart needs a real canvas; what it is given is tested in lib/dca.
vi.mock("./DcaChart", () => ({ default: () => <div data-testid="chart" /> }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function Chart() {
      return <div data-testid="chart" />;
    },
}));

const DAY = 86_400_000;

function binance(url: string): Response {
  const u = new URL(url);
  if (u.hostname === "api.frankfurter.dev") return new Response(JSON.stringify({ rates: {} }));
  if (u.searchParams.get("symbol") === "BTCUSDT") return new Response("[]");
  // BTC/EUR: 600 closed days up to yesterday, all at 50 000.
  const today = Math.floor(Date.now() / DAY) * DAY;
  const start = Math.max(Number(u.searchParams.get("startTime")), today - 600 * DAY);
  const rows = [];
  for (let t = start; t < today && rows.length < 1000; t += DAY) {
    rows.push([t, "1", "1", "1", "50000", "0", t + DAY - 1]);
  }
  return new Response(JSON.stringify(rows));
}

function renderView() {
  return render(
    <I18nProvider locale="de">
      <DcaView />
    </I18nProvider>,
  );
}

function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
}

beforeEach(() => {
  localStorage.clear();
  clearPriceCache();
  useAppStore.setState({ portfolio: emptyPortfolio(), dirty: false, privacyMode: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("savings plan calculator", () => {
  it("calculates without touching the portfolio file and remembers its inputs", async () => {
    const fetchMock = vi.fn(async (url: string) => binance(url));
    vi.stubGlobal("fetch", fetchMock);
    const before = useAppStore.getState().portfolio;
    renderView();

    const today = new Date();
    const iso = (ms: number) => {
      const d = new Date(ms);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    };
    setDate("Start", iso(today.getTime() - 300 * DAY));
    setDate("Ende", iso(today.getTime() + 400 * DAY));
    await act(async () => {
      fireEvent.click(screen.getByText("Berechnen"));
    });

    expect(await screen.findByText("Endwert")).toBeTruthy();
    // Partly estimated: the range is in the figures, with the note beside them.
    expect(screen.getAllByText(/^Spanne /).length).toBeGreaterThan(0);
    expect(screen.getByText(/niemand weiß, ob es so weitergeht/)).toBeTruthy();
    // Plain words on the surface; the model's name lives in the dialog only.
    expect(document.body.textContent).not.toMatch(/Kerze|Kline|Kurvenfit|Log-Log|Power-Law|IRR|Projektion/i);
    // No list of single purchases any more.
    expect(screen.queryByText(/CSV/)).toBeNull();

    // The details are behind the link at the top, in plain words.
    fireEvent.click(screen.getByText("Kursquellen"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/Bitcoin in Euro, direkt von Binance/);
    expect(dialog.textContent).toMatch(/keine Prognose und keine Finanzberatung/);
    expect(dialog.textContent).not.toMatch(/Kerze|Kline|Kurvenfit|Log-Log/i);

    expect(useAppStore.getState().portfolio).toBe(before);
    expect(useAppStore.getState().dirty).toBe(false);
    expect(JSON.parse(localStorage.getItem("depotwatch.dcaCalculator.v1")!).recurringEur).toBe(
      "100",
    );

    // A second calculation is answered from the cache.
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByText("Berechnen"));
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("refuses a start date before the price data and fetches nothing", async () => {
    const fetchMock = vi.fn(async (url: string) => binance(url));
    vi.stubGlobal("fetch", fetchMock);
    renderView();
    setDate("Start", "2015-01-01");
    await act(async () => {
      fireEvent.click(screen.getByText("Berechnen"));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/17\.08\.2017/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failed load in place", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    renderView();
    await act(async () => {
      fireEvent.click(screen.getByText("Berechnen"));
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/nicht geladen/);
    expect(useAppStore.getState().dirty).toBe(false);
  });
});
