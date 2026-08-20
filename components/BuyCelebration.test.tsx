/** @vitest-environment jsdom */
// The buy flash (CLAUDE.md §5.1).
//
// Two things are asserted here, and the second is the one that matters. That
// the effect obeys the switches every playful touch obeys — the file's easter
// eggs flag and the privacy mode. And that it is set off by *recording a
// purchase*, never by the ledger containing one: an import writes its rows
// through the same store action the dialog uses, so a check that only looked
// at the animation would pass while five hundred fireworks went off behind it.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import BuyCelebration from "./BuyCelebration";
import TransactionForm from "./TransactionForm";

function seed(eggs?: boolean): PortfolioFile {
  const p = emptyPortfolio();
  if (eggs !== undefined) p.settings.easterEggs = eggs;
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
              id: "buy1",
              type: "buy",
              date: "2024-01-01T00:00:00.000Z",
              amountBtc: "1",
              pricePerBtcEur: "40000",
              totalFiatEur: "40000",
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

const load = (p: PortfolioFile) =>
  useAppStore.setState({
    portfolio: p,
    fileMode: "fallback",
    privacyMode: false,
    readOnly: false,
    buyFlash: null,
    dirty: false,
  });

const field = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "common.save" }));

beforeEach(() => {
  load(seed());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the buy flash", () => {
  it("plays for a buy that was just recorded, and names what it added", () => {
    render(<BuyCelebration />);
    expect(screen.queryByText("celebration.buyTitle")).toBeNull();

    act(() => useAppStore.getState().celebrateBuy("0.05", "2500"));

    expect(screen.getByText("celebration.buyTitle")).toBeTruthy();
    expect(screen.getByText(/0,05000000 BTC/)).toBeTruthy();
  });

  it("stays long enough to be watched, and goes on its own", () => {
    vi.useFakeTimers();
    render(<BuyCelebration />);
    act(() => useAppStore.getState().celebrateBuy("0.05", "2500"));

    // Long enough to be worth looking at: it was a second and a half once,
    // which is gone before anyone has looked up from the save button.
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByText("celebration.buyTitle")).toBeTruthy();

    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.queryByText("celebration.buyTitle")).toBeNull();
    expect(useAppStore.getState().buyFlash).toBeNull();
  });

  it("times its CSS the same way it times itself", () => {
    // Tailwind only sees whole class names, so the duration is written out in
    // the animation utilities. Two places, one figure: a change to one of them
    // that missed the other would leave the coin fading out into a flash that
    // is still there, or the flash outliving a coin that has gone.
    const src = readFileSync(join(import.meta.dirname, "BuyCelebration.tsx"), "utf8");
    const duration = Number(src.match(/const DURATION_MS = (\d+);/)![1]);
    for (const cls of src.match(/animate-\[buy-\w+_(\d+)ms/g) ?? []) {
      expect(cls, cls).toContain(`_${duration}ms`);
    }
    // And the keyframes those utilities name have to exist in the stylesheet.
    const css = readFileSync(join(import.meta.dirname, "..", "app", "globals.css"), "utf8");
    for (const name of ["buy-coin", "buy-label", "buy-spark-fly", "buy-ring-out"]) {
      expect(css, name).toContain(`@keyframes ${name} `);
    }
  });

  it("rains for as long as the coin stands there", () => {
    // The last piece starts at SPREAD and falls for FALL. If the two together
    // ran past the flash, the rain would be cut off in mid-air when the
    // overlay is removed; far short of it leaves a stretch of nothing.
    const src = readFileSync(join(import.meta.dirname, "BuyCelebration.tsx"), "utf8");
    const num = (name: string) => Number(src.match(new RegExp(`const ${name} = (\\d+);`))![1]);
    const last = num("CONFETTI_SPREAD_MS") + num("CONFETTI_FALL_MS");
    expect(last).toBeLessThanOrEqual(num("DURATION_MS"));
    expect(last).toBeGreaterThan(num("DURATION_MS") - 800);
  });

  it("rains confetti, and shares the one implementation with the whole coin", () => {
    const { container } = render(<BuyCelebration />);
    act(() => useAppStore.getState().celebrateBuy("0.05", "2500"));

    expect(container.querySelectorAll(".confetti-piece").length).toBeGreaterThan(20);
  });

  it("is off with the playful touches, and leaves nothing lying in the state", () => {
    vi.useFakeTimers();
    load(seed(false));
    render(<BuyCelebration />);
    act(() => useAppStore.getState().celebrateBuy("0.05", "2500"));

    expect(screen.queryByText("celebration.buyTitle")).toBeNull();
    // Not merely unrendered: a flash left behind would play on the next file.
    act(() => void vi.advanceTimersByTime(1));
    expect(useAppStore.getState().buyFlash).toBeNull();
  });

  it("shows no figure in privacy mode", () => {
    useAppStore.setState({ privacyMode: true });
    render(<BuyCelebration />);
    act(() => useAppStore.getState().celebrateBuy("0.05", "2500"));

    expect(screen.getByText("celebration.buyTitle")).toBeTruthy();
    expect(screen.queryByText(/0,05000000/)).toBeNull();
  });
});

describe("what sets it off", () => {
  it("is a buy entered in the dialog", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);
    field("tx.amountBtc", "0.25");
    field("tx.priceEur", "50000");
    save();

    // The transaction's own amount, as the ledger stores it (8 decimals).
    expect(useAppStore.getState().buyFlash?.amountBtc).toBe("0.25000000");
    expect(useAppStore.getState().buyFlash?.totalFiatEur).toBe("12500.00");
  });

  it("is not a sale, and not an edit of a buy that already existed", () => {
    render(<TransactionForm existing={null} onClose={() => {}} />);
    field("tx.type", "sell");
    field("tx.amountBtc", "0.25");
    field("tx.priceEur", "50000");
    save();
    expect(useAppStore.getState().buyFlash).toBeNull();
    cleanup();

    const existing = useAppStore
      .getState()
      .portfolio!.wallets[0].accounts[0].transactions.find(
        (t) => t.id === "buy1",
      )!;
    const entry = {
      ...existing,
      walletId: "w1",
      walletName: "Exchange",
      walletType: "exchange" as const,
      accountId: "a1",
      accountName: "Spot",
    };
    render(<TransactionForm existing={entry} onClose={() => {}} />);
    field("tx.amountBtc", "2");
    save();
    expect(useAppStore.getState().buyFlash).toBeNull();
  });

  it("is never the store action an import writes its rows through", () => {
    // The CSV import (§3.4) adds transactions like anything else. If the flash
    // hung off the ledger rather than off the dialog, an import of a savings
    // plan would set off one firework per row.
    act(() =>
      useAppStore.getState().addTransaction("a1", {
        id: "imported",
        type: "buy",
        date: "2025-02-02T00:00:00.000Z",
        amountBtc: "0.01",
        pricePerBtcEur: "60000",
        totalFiatEur: "600",
        note: "",
      }),
    );

    expect(useAppStore.getState().buyFlash).toBeNull();
  });
});
