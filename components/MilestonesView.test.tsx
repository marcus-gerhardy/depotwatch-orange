/** @vitest-environment jsdom */
// The overview. It has to work with the playful touches switched off, because
// what that switch turns off is the interruption, not the record.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import { I18nProvider } from "@/lib/i18n";
import de from "@/lib/i18n/de";
import { MILESTONES } from "@/lib/milestones";
import MilestonesView from "./MilestonesView";
import MilestoneToast from "./MilestoneToast";

function load(patch: (p: PortfolioFile) => void = () => {}) {
  const p = emptyPortfolio();
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
              date: "2024-03-01T10:00:00.000Z",
              amountBtc: "0.00743",
              pricePerBtcEur: "40000",
              totalFiatEur: "297.20",
              note: "",
            },
          ],
        },
      ],
    },
  ];
  patch(p);
  useAppStore.setState({ portfolio: p, milestoneQueue: [], dirty: false });
  return p;
}

const view = (node: React.ReactNode) =>
  render(<I18nProvider locale="de">{node}</I18nProvider>);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the overview", () => {
  it("shows a reached milestone with its date and an open one with its description", () => {
    load((p) => {
      p.milestones = [
        { id: "firstTransaction", achievedAt: "2024-03-01T10:00:00.000Z", acknowledged: true },
      ];
    });
    view(<MilestonesView />);

    expect(screen.getByText(de.milestones.catalog.firstTransaction.title)).toBeTruthy();
    expect(screen.getByText(/1\.3\.2024|01\.03\.2024/)).toBeTruthy();
    // Not reached yet, but explained rather than hidden.
    expect(screen.getByText(de.milestones.catalog.btc1.description)).toBeTruthy();
    expect(screen.getAllByText(de.milestones.open).length).toBeGreaterThan(0);
  });

  it("shows how far a quantitative milestone has come", () => {
    load();
    view(<MilestonesView />);

    // 0.00743 BTC of the million sats.
    expect(screen.getByText("743.000 / 1.000.000 sats")).toBeTruthy();
  });

  it("counts every category and the catalogue as a whole", () => {
    load((p) => {
      p.milestones = [
        { id: "firstTransaction", achievedAt: "2024-03-01T10:00:00.000Z", acknowledged: true },
      ];
    });
    view(<MilestonesView />);

    expect(screen.getByText(`1 / ${MILESTONES.length}`)).toBeTruthy();
  });
});

describe("the notification", () => {
  it("collects several into one card instead of a queue of pop-ups", () => {
    load((p) => {
      p.milestones = [];
    });
    useAppStore.setState({
      milestoneQueue: [
        { id: "btc1", achievedAt: "2026-01-01T00:00:00.000Z", acknowledged: false },
        { id: "sats1m", achievedAt: "2026-01-01T00:00:00.000Z", acknowledged: false },
        { id: "firstTransaction", achievedAt: "2026-01-01T00:00:00.000Z", acknowledged: false },
      ],
    });
    view(<MilestoneToast />);

    expect(screen.getByText(de.milestones.catalog.btc1.title)).toBeTruthy();
    expect(screen.getByText(de.milestones.andMore.replace("{count}", "2"))).toBeTruthy();
    // Not three cards.
    expect(screen.queryByText(de.milestones.catalog.sats1m.title)).toBeNull();
  });

  it("stays silent with the playful touches off, and clears the queue", () => {
    load((p) => {
      p.settings.easterEggs = false;
      p.milestones = [];
    });
    useAppStore.setState({
      milestoneQueue: [
        { id: "btc1", achievedAt: "2026-01-01T00:00:00.000Z", acknowledged: false },
      ],
    });
    view(<MilestoneToast />);

    expect(screen.queryByText(de.milestones.reached)).toBeNull();
    // …and does not sit there waiting to announce itself on the next load.
    expect(useAppStore.getState().milestoneQueue).toEqual([]);
  });

  it("keeps the overview reachable with the touches off", () => {
    load((p) => {
      p.settings.easterEggs = false;
      p.milestones = [
        { id: "firstTransaction", achievedAt: "2024-03-01T10:00:00.000Z", acknowledged: true },
      ];
    });
    view(<MilestonesView />);

    expect(screen.getByText(de.milestones.catalog.firstTransaction.title)).toBeTruthy();
  });
});
