/** @vitest-environment jsdom */
// Milestones as the app actually reaches them: evaluated when the portfolio
// changes and when a file is opened, never on a timer, and never announcing a
// history it merely discovered.

import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./store";
import { PENDING_TTL_MS, pendingMilestones, queuePendingMilestone } from "./milestoneEvents";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "./types";

const tx = (o: Partial<Transaction> & Pick<Transaction, "id">): Transaction => ({
  type: "buy",
  date: "2024-01-05T10:00:00.000Z",
  amountBtc: "0.02",
  pricePerBtcEur: "40000",
  totalFiatEur: "800",
  note: "",
  ...o,
});

function portfolio(transactions: Transaction[] = []): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions }],
    },
  ];
  return p;
}

const open = (
  p: PortfolioFile,
  password: string | null = null,
  opts: { isDemo?: boolean } = {},
) =>
  useAppStore.getState().openPortfolio({
    portfolio: p,
    handle: null,
    fileName: "test.dwp",
    password,
    ...opts,
  });

const ids = () => (useAppStore.getState().portfolio?.milestones ?? []).map((m) => m.id);
const queue = () => useAppStore.getState().milestoneQueue.map((m) => m.id);

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ portfolio: null, milestoneQueue: [], dirty: false });
});

describe("opening a file", () => {
  it("fills in a file that has no milestone history, silently", () => {
    // First contact with an existing portfolio: everything it fulfils was
    // *discovered*, not reached, so nothing is announced.
    open(portfolio([tx({ id: "b1" })]));

    expect(ids()).toContain("firstTransaction");
    expect(ids()).toContain("sats1m");
    expect(queue()).toEqual([]);
    expect(
      useAppStore.getState().portfolio!.milestones!.every((m) => m.acknowledged),
    ).toBe(true);
  });

  it("dates what it finds from the ledger, not from today", () => {
    open(portfolio([tx({ id: "b1", date: "2021-06-01T09:00:00.000Z" })]));

    const first = useAppStore
      .getState()
      .portfolio!.milestones!.find((m) => m.id === "firstTransaction")!;
    expect(first.achievedAt).toBe("2021-06-01T09:00:00.000Z");
  });

  it("announces what became true since the last session", () => {
    // A file that already carries records is a returning one: a milestone that
    // is new now genuinely happened while the user was away.
    const p = portfolio([tx({ id: "b1" })]);
    p.milestones = [
      { id: "firstTransaction", achievedAt: "2024-01-05T10:00:00.000Z", acknowledged: true },
    ];
    open(p);

    expect(queue()).toContain("sats1m");
    expect(queue()).not.toContain("firstTransaction");
  });

  it("reads encryption from the session, not from the file", () => {
    open(portfolio([tx({ id: "b1" })]), "hunter2");
    expect(ids()).toContain("encrypted");
  });
});

describe("while working", () => {
  it("reaches a milestone on the change that earned it and queues it once", () => {
    const p = portfolio([]);
    p.milestones = [];
    open(p);
    // Nothing is earned by merely opening an empty file: "first backup" now
    // means a verified copy in the backup folder (§6.5), not a saved file.
    expect(queue()).toEqual([]);

    useAppStore.getState().addTransaction("a1", tx({ id: "b1" }));

    expect(queue()).toContain("firstTransaction");
    expect(queue()).toContain("sats1m");

    // A second change does not report them again.
    useAppStore.setState({ milestoneQueue: [] });
    useAppStore.getState().addTransaction("a1", tx({ id: "b2" }));
    expect(queue()).not.toContain("firstTransaction");
  });

  it("keeps a milestone and its date when the holding falls back", () => {
    const p = portfolio([]);
    p.milestones = [];
    open(p);
    useAppStore.getState().addTransaction("a1", tx({ id: "b1", amountBtc: "1.5" }));
    const reached = useAppStore
      .getState()
      .portfolio!.milestones!.find((m) => m.id === "btc1")!;

    useAppStore.getState().deleteTransaction("b1");

    const after = useAppStore
      .getState()
      .portfolio!.milestones!.find((m) => m.id === "btc1")!;
    expect(after.achievedAt).toBe(reached.achievedAt);
  });

  it("records an event milestone once", () => {
    const p = portfolio([]);
    p.milestones = [];
    open(p);
    useAppStore.setState({ milestoneQueue: [] });

    useAppStore.getState().achieveMilestone("whitepaperOpened");
    expect(queue()).toEqual(["whitepaperOpened"]);

    useAppStore.setState({ milestoneQueue: [] });
    useAppStore.getState().achieveMilestone("whitepaperOpened");
    expect(queue()).toEqual([]);
  });
});

describe("acknowledging", () => {
  it("marks the shown records and does not dirty the file when there is nothing to mark", () => {
    const p = portfolio([]);
    p.milestones = [];
    open(p);
    useAppStore.getState().addTransaction("a1", tx({ id: "b1" }));

    useAppStore.getState().clearMilestoneQueue();
    expect(queue()).toEqual([]);
    expect(
      useAppStore.getState().portfolio!.milestones!.every((m) => m.acknowledged),
    ).toBe(true);

    // Nothing left to acknowledge: seeing a toast must not keep the file dirty.
    useAppStore.setState({ dirty: false });
    useAppStore.getState().clearMilestoneQueue();
    expect(useAppStore.getState().dirty).toBe(false);
  });
});

describe("an event raised before any file was open", () => {
  // The whitepaper is reached from "how it works", a page one reads *before*
  // opening a portfolio — so the click used to land in a store with no file
  // and was dropped, which made the milestone unreachable in practice.
  const WHEN = new Date("2026-08-18T09:00:00.000Z");
  const recordOf = (id: string) =>
    (useAppStore.getState().portfolio?.milestones ?? []).find((m) => m.id === id);

  it("waits instead of being lost, and keeps the time it happened", () => {
    useAppStore.getState().achieveMilestone("whitepaperOpened");
    expect(pendingMilestones().map((e) => e.id)).toEqual(["whitepaperOpened"]);
  });

  it("is written into the next file, dated when it happened", () => {
    queuePendingMilestone("whitepaperOpened", WHEN);
    const p = portfolio([]);
    p.milestones = [];

    open(p);

    // The date is the event's, not the moment the file was opened.
    expect(recordOf("whitepaperOpened")?.achievedAt).toBe(WHEN.toISOString());
    // Announced rather than swallowed: it was reached, not discovered.
    expect(queue()).toEqual(["whitepaperOpened"]);
    // The file now differs from the one on disk, so it has to be saved.
    expect(useAppStore.getState().dirty).toBe(true);
    // And it is gone from the waiting room.
    expect(pendingMilestones()).toEqual([]);
  });

  it("is not handed to a second file as well", () => {
    queuePendingMilestone("whitepaperOpened", WHEN);
    const first = portfolio([]);
    first.milestones = [];
    open(first);

    const second = portfolio([]);
    second.milestones = [];
    open(second);

    expect(recordOf("whitepaperOpened")).toBeUndefined();
  });

  it("expires after a day rather than surfacing in a file opened much later", () => {
    queuePendingMilestone(
      "whitepaperOpened",
      new Date(Date.now() - PENDING_TTL_MS - 1000),
    );
    const p = portfolio([]);
    p.milestones = [];

    open(p);

    expect(recordOf("whitepaperOpened")).toBeUndefined();
    expect(queue()).toEqual([]);
    expect(useAppStore.getState().dirty).toBe(false);
  });

  it("is left waiting when the demo is opened, which has nowhere to save it", () => {
    queuePendingMilestone("whitepaperOpened", WHEN);
    const p = portfolio([]);
    p.milestones = [];

    open(p, null, { isDemo: true });

    expect(recordOf("whitepaperOpened")).toBeUndefined();
    expect(pendingMilestones().map((e) => e.id)).toEqual(["whitepaperOpened"]);
  });

  it("collects several into one notification rather than a sequence", () => {
    queuePendingMilestone("whitepaperOpened", WHEN);
    queuePendingMilestone("taxExported", new Date(WHEN.getTime() + 60_000));
    const p = portfolio([]);
    p.milestones = [];

    open(p);

    expect(queue()).toEqual(["whitepaperOpened", "taxExported"]);
  });
});
