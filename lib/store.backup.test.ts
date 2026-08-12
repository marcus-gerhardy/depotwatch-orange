/** @vitest-environment jsdom */
// Backups end to end, against an in-memory folder: write, read back, verify,
// rotate, restore.
//
// The properties under test are the ones that make a backup worth having. A
// copy is only counted once it has been read back; a rotation only runs on the
// far side of that; and a restore writes a safety copy of what it is about to
// replace, so the most destructive button in the app is itself reversible.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./store";
import { backupTimeOf } from "./backup";
import { isEncryptedEnvelope } from "./crypto";
import { emptyPortfolio, type PortfolioFile, type Transaction } from "./types";

const PASSWORD = "correct horse battery staple";

/** A directory handle that lives in a Map. Enough of the API for the store. */
function fakeDirectory(name = "backups") {
  const files = new Map<string, string>();
  const handle = {
    name,
    kind: "directory" as const,
    files,
    async getFileHandle(fileName: string, options?: { create?: boolean }) {
      if (!files.has(fileName) && !options?.create) throw new Error("NotFoundError");
      return {
        name: fileName,
        kind: "file" as const,
        async createWritable() {
          let buffer = "";
          return {
            async write(chunk: string) {
              buffer += chunk;
            },
            async close() {
              files.set(fileName, buffer);
            },
          };
        },
        async getFile() {
          const content = files.get(fileName) ?? "";
          return {
            size: content.length,
            async text() {
              return content;
            },
          };
        },
      };
    },
    async removeEntry(fileName: string) {
      files.delete(fileName);
    },
    async *values() {
      for (const fileName of files.keys()) yield await handle.getFileHandle(fileName);
    },
  };
  return handle;
}

const tx = (id: string, amountBtc = "0.1"): Transaction => ({
  id,
  type: "buy",
  date: "2025-01-05T10:00:00.000Z",
  amountBtc,
  pricePerBtcEur: "50000",
  totalFiatEur: "5000",
  note: "",
});

function portfolio(ids: string[] = ["t1", "t2"]): PortfolioFile {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Kraken",
      type: "exchange",
      accounts: [{ id: "a1", name: "Spot", transactions: ids.map((id) => tx(id)) }],
    },
  ];
  return p;
}

async function connect(dir: ReturnType<typeof fakeDirectory>) {
  vi.stubGlobal("showDirectoryPicker", vi.fn(async () => dir));
  Object.defineProperty(window, "showDirectoryPicker", {
    value: async () => dir,
    configurable: true,
    writable: true,
  });
  return useAppStore.getState().connectBackupDirectory();
}

function open(p: PortfolioFile = portfolio()) {
  useAppStore.getState().openPortfolio({
    portfolio: p,
    handle: null,
    fileName: "portfolio.dwp",
    password: PASSWORD,
  });
}

beforeEach(async () => {
  localStorage.clear();
  useAppStore.getState().closePortfolio();
  await useAppStore.getState().forgetBackupDirectory();
  vi.unstubAllGlobals();
});

describe("writing a backup", () => {
  it("writes an encrypted copy and confirms it can be read back", async () => {
    const dir = fakeDirectory();
    open();
    expect(await connect(dir)).toBe(true);

    const result = await useAppStore.getState().runBackup({ manual: true });
    expect(result.ok).toBe(true);
    expect(dir.files.size).toBe(1);

    const [name, content] = [...dir.files.entries()][0];
    expect(backupTimeOf(name)).not.toBeNull();
    // Encrypted with the file's own password: no wallet name in the bytes.
    expect(isEncryptedEnvelope(content)).toBe(true);
    expect(content).not.toContain("Kraken");

    // And the file records that it verified, which is what the milestone and
    // the reminder read.
    const state = useAppStore.getState().portfolio!.backupState!;
    expect(state.lastVerified).toBe(true);
    expect(state.lastVerifiedAt).toBeTruthy();
    expect(state.lastFileName).toBe(name);
  });

  it("reports a copy it could not read back, and keeps it out of the record", async () => {
    const dir = fakeDirectory();
    open();
    await connect(dir);
    // Something writes the file but leaves it unreadable — a full disk, a sync
    // client, a truncated write.
    const original = dir.getFileHandle.bind(dir);
    dir.getFileHandle = (async (fileName: string, options?: { create?: boolean }) => {
      const handle = await original(fileName, options);
      return {
        ...handle,
        async getFile() {
          return { size: 10, async text() { return "{ truncated"; } };
        },
      };
    }) as typeof dir.getFileHandle;

    const result = await useAppStore.getState().runBackup({ manual: true });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("verifyFailed");
    const state = useAppStore.getState().portfolio!.backupState!;
    expect(state.lastVerified).toBe(false);
    expect(state.lastVerifiedAt).toBeUndefined();
  });

  it("earns the milestone only once a backup has verified", async () => {
    const dir = fakeDirectory();
    open();
    await connect(dir);
    expect(
      (useAppStore.getState().portfolio!.milestones ?? []).some((m) => m.id === "firstBackup"),
    ).toBe(false);

    await useAppStore.getState().runBackup({ manual: true });
    // The record is written by the next evaluation, which the next change runs.
    useAppStore.getState().addTransaction("a1", tx("t3"));
    expect(
      (useAppStore.getState().portfolio!.milestones ?? []).some((m) => m.id === "firstBackup"),
    ).toBe(true);
  });
});

describe("rotation", () => {
  it("only runs after a verified write, and keeps the newest", async () => {
    const dir = fakeDirectory();
    open();
    await connect(dir);
    useAppStore.getState().setBackupSettings({
      retention: { keepLatest: 2, keepDaily: 0, keepWeekly: 0, keepMonthly: 0 },
    });

    // Three backups a day apart, written by hand so the names differ.
    for (const day of [3, 2, 1]) {
      vi.setSystemTime(new Date(2026, 7, 12 - day, 10, 0, 0));
      await useAppStore.getState().runBackup({ manual: true });
    }
    vi.useRealTimers();
    expect(dir.files.size).toBe(2);
  });
});

describe("restoring", () => {
  it("swaps in the backup and saves a copy of what it replaced", async () => {
    const dir = fakeDirectory();
    open(portfolio(["t1", "t2"]));
    await connect(dir);
    await useAppStore.getState().runBackup({ manual: true });
    const backupName = [...dir.files.keys()][0];

    // The file moves on: two more transactions.
    useAppStore.getState().addTransaction("a1", tx("t3"));
    useAppStore.getState().addTransaction("a1", tx("t4"));
    expect(useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions).toHaveLength(4);

    const result = await useAppStore.getState().restoreBackup(backupName, PASSWORD);
    expect(result.ok).toBe(true);
    expect(
      useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions.map((t) => t.id),
    ).toEqual(["t1", "t2"]);

    // A safety copy of the four-transaction state exists, so the restore can
    // itself be undone.
    expect(dir.files.size).toBe(2);
    const safety = [...dir.files.keys()].find((n) => n !== backupName)!;
    const { meta } = await useAppStore.getState().readBackup(safety, PASSWORD);
    expect(meta.transactionCount).toBe(4);
  });

  it("refuses a wrong password without touching the open file", async () => {
    const dir = fakeDirectory();
    open(portfolio(["t1", "t2"]));
    await connect(dir);
    await useAppStore.getState().runBackup({ manual: true });
    const backupName = [...dir.files.keys()][0];

    const result = await useAppStore.getState().restoreBackup(backupName, "nope");
    expect(result).toEqual({ ok: false, error: "wrongPassword" });
    expect(useAppStore.getState().portfolio!.wallets[0].accounts[0].transactions).toHaveLength(2);
  });

  it("records the restore in the change log", async () => {
    const dir = fakeDirectory();
    open(portfolio(["t1", "t2"]));
    await connect(dir);
    await useAppStore.getState().runBackup({ manual: true });
    const backupName = [...dir.files.keys()][0];
    useAppStore.getState().addTransaction("a1", tx("t3"));

    await useAppStore.getState().restoreBackup(backupName, PASSWORD);
    const log = useAppStore.getState().portfolio!.changeLog ?? [];
    expect(log[0].kind).toBe("restore");
    expect(log[0].note).toBe(backupName);
  });
});
