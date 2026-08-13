/** @vitest-environment jsdom */
// The two screens of the auto-lock (§6.4): the warning that appears before it
// happens, and the screen that is left afterwards.
//
// The lock screen's most important property is what it does *not* contain, so
// that is what is asserted: with the portfolio gone from the store there is no
// wallet name, no amount and no date anywhere in the document.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppStore } from "@/lib/store";
import { I18nProvider } from "@/lib/i18n";
import { emptyPortfolio, type PortfolioFile } from "@/lib/types";
import AutoLock from "./AutoLock";
import LockScreen from "./LockScreen";

const PASSWORD = "correct horse battery staple";

function portfolio(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange-Konto",
      type: "exchange",
      accounts: [
        {
          id: "a1",
          name: "Spot",
          transactions: [
            {
              id: "b1",
              type: "buy",
              date: "2025-01-05T10:00:00.000Z",
              amountBtc: "0.25",
              pricePerBtcEur: "40000",
              totalFiatEur: "10000",
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

function open(password: string | null = PASSWORD) {
  act(() => {
    useAppStore.getState().openPortfolio({
      portfolio: portfolio(),
      handle: null,
      fileName: "mein-depot.dwp",
      password,
    });
  });
}

const view = (node: React.ReactNode) =>
  render(<I18nProvider locale="de">{node}</I18nProvider>);

beforeEach(() => {
  localStorage.clear();
  useAppStore.getState().closePortfolio();
  useAppStore.setState({ lockSettings: { minutes: 1, onHide: false, showFileName: true } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the lock screen", () => {
  it("shows nothing but the app, the file name and a password field", async () => {
    open();
    await act(async () => {
      await useAppStore.getState().lock();
    });
    const { container } = view(<LockScreen />);

    expect(screen.getByText("mein-depot.dwp")).toBeTruthy();
    expect(screen.getByLabelText("Passwort")).toBeTruthy();
    // Nothing from the portfolio, in any form.
    expect(container.textContent).not.toContain("Exchange");
    expect(container.textContent).not.toContain("Spot");
    expect(container.textContent).not.toMatch(/0[.,]25/);
    expect(container.textContent).not.toContain("40.000");
  });

  it("leaves the file name out when the settings say so", async () => {
    open();
    useAppStore.setState({
      lockSettings: { minutes: 1, onHide: false, showFileName: false },
    });
    await act(async () => {
      await useAppStore.getState().lock();
    });
    view(<LockScreen />);
    expect(screen.queryByText("mein-depot.dwp")).toBeNull();
  });

  it("says so on a wrong password and lets the next attempt through", async () => {
    open();
    await act(async () => {
      await useAppStore.getState().lock();
    });
    view(<LockScreen />);

    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Entsperren" }));
    // The derivation is 600 000 PBKDF2 rounds, so this genuinely takes a while.
    expect(await screen.findByText(/Falsches Passwort/)).toBeTruthy();
    expect(useAppStore.getState().locked).toBe(true);

    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "Entsperren" }));
    await vi.waitFor(() => expect(useAppStore.getState().locked).toBe(false));
    expect(useAppStore.getState().portfolio?.wallets[0].name).toBe("Exchange-Konto");
  });

  it("offers to close the file for anyone without the password", async () => {
    open();
    await act(async () => {
      await useAppStore.getState().lock();
    });
    view(<LockScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Datei schließen" }));
    expect(useAppStore.getState().lockedPayload).toBeNull();
    expect(useAppStore.getState().locked).toBe(false);
  });
});

describe("the warning before it happens", () => {
  it("appears in the last 30 seconds and can be waved off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    view(<AutoLock />);

    // 40 seconds into a one-minute timeout: still quiet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.queryByText("Gleich wird gesperrt")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByText("Gleich wird gesperrt")).toBeTruthy();

    // "Stay unlocked" puts the full minute back.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Entsperrt bleiben" }));
    });
    expect(screen.queryByText("Gleich wird gesperrt")).toBeNull();
    expect(useAppStore.getState().locked).toBe(false);
  });

  it("locks when the time is up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    view(<AutoLock />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    // Encrypting the file is real work on a real clock, so the assertion waits
    // for it rather than for the tick that started it.
    vi.useRealTimers();
    await vi.waitFor(() => expect(useAppStore.getState().locked).toBe(true));
    expect(useAppStore.getState().portfolio).toBeNull();
  });

  it("never arms itself for a file that has no password", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open(null);
    view(<AutoLock />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(screen.queryByText("Gleich wird gesperrt")).toBeNull();
    expect(useAppStore.getState().locked).toBe(false);
    expect(useAppStore.getState().portfolio).not.toBeNull();
  });

  it("holds off while a long-running operation is in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    useAppStore.getState().beginBusy();
    view(<AutoLock />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(70_000);
    });
    expect(useAppStore.getState().locked).toBe(false);
    expect(screen.getByText(/laufender Vorgang/)).toBeTruthy();

    // And locks as soon as it is done, without needing another full minute.
    act(() => useAppStore.getState().endBusy());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    vi.useRealTimers();
    await vi.waitFor(() => expect(useAppStore.getState().locked).toBe(true));
  });
});
