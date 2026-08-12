/** @vitest-environment jsdom */
// Locking, as a security property rather than as a screen.
//
// The point of every test here is the same: after a lock there must be no way
// back to the data except the password. Not a hidden component, not a flag the
// UI reads — the plaintext and the password are gone from the store, and only
// the ciphertext is left.

import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";
import { isEncryptedEnvelope, WrongPasswordError } from "./crypto";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "./types";

const PASSWORD = "correct horse battery staple";

const tx: Transaction = {
  id: "b1",
  type: "buy",
  date: "2025-01-05T10:00:00.000Z",
  amountBtc: "0.25",
  pricePerBtcEur: "40000",
  totalFiatEur: "10000",
  note: "",
};

function portfolio(): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Kraken",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions: [tx] }],
    },
  ];
  return p;
}

/** Open a file the way the start screen does, encrypted unless told otherwise. */
function open(o: { password?: string | null; isDemo?: boolean } = {}) {
  useAppStore.getState().openPortfolio({
    portfolio: portfolio(),
    handle: null,
    fileName: "portfolio.dwp",
    password: o.password === undefined ? PASSWORD : o.password,
    isDemo: o.isDemo,
  });
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.getState().closePortfolio();
  useAppStore.setState({ lockSettings: { minutes: 15, onHide: false, showFileName: true } });
});

describe("locking", () => {
  it("removes the plaintext and the password, leaving only ciphertext", async () => {
    open();
    expect(await useAppStore.getState().lock()).toBe("locked");

    const s = useAppStore.getState();
    expect(s.locked).toBe(true);
    expect(s.portfolio).toBeNull();
    expect(s.password).toBeNull();
    expect(s.lockedPayload).not.toBeNull();
    // What is left is what is on disk: an envelope, not the wallet names.
    expect(isEncryptedEnvelope(s.lockedPayload!)).toBe(true);
    expect(s.lockedPayload).not.toContain("Kraken");
    expect(s.lockedPayload).not.toContain("0.25");
  });

  it("comes back with the right password and nothing else", async () => {
    open();
    await useAppStore.getState().lock();

    await expect(useAppStore.getState().unlock("wrong")).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
    expect(useAppStore.getState().locked).toBe(true);
    expect(useAppStore.getState().portfolio).toBeNull();

    await useAppStore.getState().unlock(PASSWORD);
    const s = useAppStore.getState();
    expect(s.locked).toBe(false);
    expect(s.lockedPayload).toBeNull();
    expect(s.password).toBe(PASSWORD);
    expect(s.portfolio?.wallets[0].name).toBe("Kraken");
    expect(s.portfolio?.wallets[0].accounts[0].transactions[0].amountBtc).toBe("0.25");
  });

  it("keeps the session around it, so unlocking resumes rather than re-opens", async () => {
    open();
    useAppStore.getState().addWallet({ id: "w2", name: "Ledger", type: "hardware" });
    expect(useAppStore.getState().dirty).toBe(true);

    await useAppStore.getState().lock();
    // No destination to write to in this test (no handle), so the change lives
    // in the ciphertext — and the file is still known to be unsaved.
    expect(useAppStore.getState().fileName).toBe("portfolio.dwp");
    expect(useAppStore.getState().dirty).toBe(true);

    await useAppStore.getState().unlock(PASSWORD);
    expect(useAppStore.getState().portfolio?.wallets).toHaveLength(2);
  });

  it("refuses an unencrypted file instead of pretending", async () => {
    open({ password: null });
    expect(await useAppStore.getState().lock()).toBe("unencrypted");
    // Still open, still readable: nothing was hidden behind a curtain.
    expect(useAppStore.getState().portfolio).not.toBeNull();
    expect(useAppStore.getState().locked).toBe(false);
  });

  it("asks for a destination before locking a file that has none", async () => {
    open({ isDemo: true });
    expect(await useAppStore.getState().lock()).toBe("needsSetup");
    expect(useAppStore.getState().locked).toBe(false);
    expect(useAppStore.getState().portfolio).not.toBeNull();
    // Which is what opens the "choose a location" step in the shell.
    expect(useAppStore.getState().fileSetupRequested).toBe(true);
  });

  it("waits for a long-running operation", async () => {
    open();
    useAppStore.getState().beginBusy();
    expect(await useAppStore.getState().lock()).toBe("busy");
    expect(useAppStore.getState().locked).toBe(false);

    useAppStore.getState().endBusy();
    expect(await useAppStore.getState().lock()).toBe("locked");
  });

  it("counts overlapping operations rather than flagging them", async () => {
    open();
    const { beginBusy, endBusy } = useAppStore.getState();
    beginBusy();
    beginBusy();
    endBusy();
    expect(await useAppStore.getState().lock()).toBe("busy");
    endBusy();
    expect(await useAppStore.getState().lock()).toBe("locked");
  });

  it("drops the ciphertext when the file is closed from the lock screen", async () => {
    open();
    await useAppStore.getState().lock();
    useAppStore.getState().closePortfolio();

    const s = useAppStore.getState();
    expect(s.locked).toBe(false);
    expect(s.lockedPayload).toBeNull();
    expect(s.lockedFileName).toBeNull();
    expect(s.portfolio).toBeNull();
  });
});

describe("the backoff", () => {
  it("starts after the third wrong password and resets on success", async () => {
    open();
    await useAppStore.getState().lock();

    for (let i = 0; i < 2; i++) useAppStore.getState().noteUnlockFailure();
    expect(useAppStore.getState().unlockBlockedUntil).toBeLessThanOrEqual(Date.now());

    useAppStore.getState().noteUnlockFailure();
    expect(useAppStore.getState().unlockFailures).toBe(3);
    expect(useAppStore.getState().unlockBlockedUntil).toBeGreaterThan(Date.now());

    await useAppStore.getState().unlock(PASSWORD);
    expect(useAppStore.getState().unlockFailures).toBe(0);
    expect(useAppStore.getState().unlockBlockedUntil).toBe(0);
  });
});

describe("the settings", () => {
  it("travel with the file and are mirrored to the device", () => {
    open();
    useAppStore.getState().setLockSettings({ minutes: 5, onHide: true });

    expect(useAppStore.getState().portfolio?.uiSettings?.autoLockMinutes).toBe(5);
    expect(useAppStore.getState().portfolio?.uiSettings?.lockOnHide).toBe(true);
    expect(JSON.parse(localStorage.getItem("depotwatch.lock.v1")!)).toMatchObject({
      autoLockMinutes: 5,
      lockOnHide: true,
    });
  });

  it("are adopted from the file when it is opened", () => {
    const p = portfolio();
    p.uiSettings = { autoLockMinutes: 1, lockOnHide: true, lockShowFileName: false };
    useAppStore.getState().openPortfolio({
      portfolio: p,
      handle: null,
      fileName: "other.dwp",
      password: PASSWORD,
    });
    expect(useAppStore.getState().lockSettings).toEqual({
      minutes: 1,
      onHide: true,
      showFileName: false,
    });
  });
});
