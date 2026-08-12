/** @vitest-environment jsdom */
// The year in review as a view: that it steps, that a year without data says
// so instead of showing zeroes, and above all that the share export cannot be
// talked into naming somebody's holding by accident.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "@/lib/types";
import { I18nProvider } from "@/lib/i18n";
import Dashboard from "./Dashboard";
import YearInReview from "./YearInReview";

const tx = (
  id: string,
  date: string,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id,
  type: "buy",
  date,
  amountBtc: "0.05",
  pricePerBtcEur: "50000",
  totalFiatEur: "2500",
  note: "",
  ...extra,
});

function load(patch: (p: PortfolioFile) => void = () => {}) {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Kraken",
      type: "exchange",
      accounts: [
        {
          id: "a1",
          name: "Spot",
          transactions: [
            tx("b1", "2025-02-03T10:00:00.000Z"),
            tx("b2", "2025-02-10T10:00:00.000Z", { pricePerBtcEur: "60000", totalFiatEur: "3000" }),
            tx("b3", "2025-02-17T10:00:00.000Z"),
          ],
        },
      ],
    },
  ];
  patch(p);
  useAppStore.setState({ portfolio: p, privacyMode: false, dirty: false });
  return p;
}

const view = (node: React.ReactNode) =>
  render(<I18nProvider locale="de">{node}</I18nProvider>);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-03-05T12:00:00.000Z"));
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the review", () => {
  it("opens on the first card and steps to the summary", () => {
    load();
    view(<YearInReview initialYear={2025} />);

    expect(screen.getByText("Netto gestapelt")).toBeTruthy();
    // Step to the end; the last station is the summary, whatever the year filled.
    for (let i = 0; i < 20; i++) {
      const next = screen.getByRole("button", { name: /Weiter/ });
      if (next.hasAttribute("disabled")) break;
      fireEvent.click(next);
    }
    expect(screen.getByText("Gesamtübersicht")).toBeTruthy();
  });

  it("offers completed years only, never the running one", () => {
    load();
    view(<YearInReview initialYear={2025} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    // Today is in 2026, so 2026 is not on offer (§4.2).
    expect([...select.options].map((o) => o.value)).toEqual(["2025"]);
  });

  it("says there is nothing to review while the first year is still running", () => {
    vi.setSystemTime(new Date("2025-06-05T12:00:00.000Z"));
    load();
    view(<YearInReview />);
    expect(screen.getByText(/Noch kein Jahr zum Zurückblicken/)).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("falls back to the newest completed year when asked for the running one", () => {
    load();
    view(<YearInReview initialYear={2026} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("2025");
  });
});

describe("sharing", () => {
  /** Walk to the summary, which is where the share block lives. */
  function openSummary() {
    for (let i = 0; i < 20; i++) {
      const next = screen.getByRole("button", { name: /Weiter/ });
      if (next.hasAttribute("disabled")) break;
      fireEvent.click(next);
    }
  }

  it("hides absolute amounts until they are switched on, with a warning", () => {
    load();
    view(<YearInReview initialYear={2025} />);
    openSummary();

    const toggle = screen.getByLabelText("Absolute Beträge einblenden") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.getByText(/sind ausgeblendet/)).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.getByText(/Sicherheitsrisiko/)).toBeTruthy();
  });

  it("cannot be switched on while the privacy mode blurs amounts", () => {
    load();
    useAppStore.setState({ privacyMode: true });
    view(<YearInReview initialYear={2025} />);
    openSummary();

    const toggle = screen.getByLabelText("Absolute Beträge einblenden") as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText(/Privacy-Modus ist aktiv/)).toBeTruthy();
  });

  it("blurs the absolute figures on screen while the privacy mode is on", () => {
    load();
    useAppStore.setState({ privacyMode: true });
    const { container } = view(<YearInReview initialYear={2025} />);
    // The first card leads with a holding, which is exactly what the blur is
    // for; the relative figures next to it stay readable.
    expect(container.querySelectorAll(".privacy-blur").length).toBeGreaterThan(0);
  });

  it("says that the image is made locally", () => {
    load();
    view(<YearInReview initialYear={2025} />);
    openSummary();
    expect(screen.getByText(/Nichts wird hochgeladen/)).toBeTruthy();
  });
});

describe("the turn-of-the-year hint on the dashboard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (String(url).includes("ticker/price") ? { price: "50000" } : []),
      })),
    );
  });

  it("appears once the year is over and stays away after being dismissed", () => {
    vi.setSystemTime(new Date("2027-01-14T10:00:00.000Z"));
    load((p) => {
      p.wallets[0].accounts[0].transactions.push(tx("b4", "2026-05-05T10:00:00.000Z"));
    });

    // No I18nProvider here: `t` falls back to the key, which is enough to see
    // whether the hint is rendered at all.
    const { unmount } = render(<Dashboard />);
    expect(screen.getByText("yearInReview.hint.open")).toBeTruthy();

    fireEvent.click(screen.getByTitle("yearInReview.hint.dismiss"));
    expect(screen.queryByText("yearInReview.hint.open")).toBeNull();
    expect(
      useAppStore.getState().portfolio!.uiSettings!.yearInReviewDismissed,
    ).toEqual([2026]);

    // And it stays dismissed across a fresh mount, because the file says so.
    unmount();
    render(<Dashboard />);
    expect(screen.queryByText("yearInReview.hint.open")).toBeNull();
  });

  it("stays away while the year it would announce is still running", () => {
    vi.setSystemTime(new Date("2026-12-30T10:00:00.000Z"));
    load((p) => {
      p.wallets[0].accounts[0].transactions.push(tx("b4", "2026-05-05T10:00:00.000Z"));
    });
    render(<Dashboard />);
    expect(screen.queryByText("yearInReview.hint.open")).toBeNull();
  });

  it("stays away once the season has passed", () => {
    // Still reachable from the milestones page and its widget; just not as a
    // banner in June.
    vi.setSystemTime(new Date("2027-06-04T10:00:00.000Z"));
    load((p) => {
      p.wallets[0].accounts[0].transactions.push(tx("b4", "2026-05-05T10:00:00.000Z"));
    });
    render(<Dashboard />);
    expect(screen.queryByText("yearInReview.hint.open")).toBeNull();
  });
});
