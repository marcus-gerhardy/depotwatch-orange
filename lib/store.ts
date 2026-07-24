"use client";

import { create } from "zustand";
import type {
  Account,
  PortfolioFile,
  Transaction,
  UtxoLabel,
  Wallet,
  WatchedAddress,
} from "./types";
import { emptyPortfolio } from "./types";
import {
  decryptPortfolio,
  encryptPortfolio,
  isEncryptedEnvelope,
} from "./crypto";
import {
  detectFileMode,
  downloadAsFile,
  writeToHandle,
  type FileMode,
} from "./fileStorage";

interface AppState {
  // File session
  fileMode: FileMode;
  fileHandle: FileSystemFileHandle | null;
  fileName: string | null;
  /** In-memory only; never persisted anywhere. */
  password: string | null;
  encryptionEnabled: boolean;
  portfolio: PortfolioFile | null;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;

  // UI state (not persisted)
  privacyMode: boolean;

  initFileMode: () => void;
  openPortfolio: (opts: {
    portfolio: PortfolioFile;
    handle: FileSystemFileHandle | null;
    fileName: string;
    password: string | null;
  }) => void;
  closePortfolio: () => void;
  togglePrivacyMode: () => void;
  setPassword: (password: string | null) => void;
  saveNow: () => Promise<void>;

  /** Apply an immutable update to the portfolio and trigger autosave. */
  update: (fn: (p: PortfolioFile) => PortfolioFile) => void;

  addWallet: (w: Omit<Wallet, "accounts"> & { accounts?: Account[] }) => void;
  renameWallet: (walletId: string, name: string) => void;
  deleteWallet: (walletId: string) => void;
  addAccount: (walletId: string, account: Account) => void;
  renameAccount: (walletId: string, accountId: string, name: string) => void;
  deleteAccount: (walletId: string, accountId: string) => void;
  addTransaction: (accountId: string, tx: Transaction) => void;
  updateTransaction: (txId: string, tx: Transaction, accountId: string) => void;
  deleteTransaction: (txId: string) => void;
  addWatchedAddress: (a: WatchedAddress) => void;
  deleteWatchedAddress: (id: string) => void;
  setUtxoLabel: (label: UtxoLabel) => void;
}

export function serializePortfolio(p: PortfolioFile): string {
  return JSON.stringify(p, null, 2);
}

export async function deserializePortfolio(
  text: string,
  password: string | null,
): Promise<{ portfolio: PortfolioFile; wasEncrypted: boolean }> {
  let json = text;
  let wasEncrypted = false;
  if (isEncryptedEnvelope(text)) {
    if (password === null) throw new Error("password required");
    json = await decryptPortfolio(text, password);
    wasEncrypted = true;
  }
  const parsed = JSON.parse(json) as PortfolioFile;
  if (parsed.version !== "1.0" || !Array.isArray(parsed.wallets)) {
    throw new Error("invalid portfolio file");
  }
  // Merge with defaults so files from older minor versions keep working.
  const base = emptyPortfolio();
  return {
    portfolio: {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...parsed.settings },
      explorerSettings: { ...base.explorerSettings, ...parsed.explorerSettings },
    },
    wasEncrypted,
  };
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set, get) => {
  async function persist(): Promise<void> {
    const { portfolio, password, encryptionEnabled, fileHandle, fileMode } = get();
    if (!portfolio) return;
    const json = serializePortfolio(portfolio);
    const content =
      encryptionEnabled && password
        ? await encryptPortfolio(json, password)
        : json;
    if (fileMode === "fsa" && fileHandle) {
      set({ saving: true });
      try {
        await writeToHandle(fileHandle, content);
        set({ dirty: false, lastSavedAt: Date.now() });
      } finally {
        set({ saving: false });
      }
    } else {
      downloadAsFile(content, get().fileName ?? "portfolio.dwp");
      set({ dirty: false, lastSavedAt: Date.now() });
    }
  }

  function scheduleAutosave() {
    const { fileMode, fileHandle, portfolio } = get();
    if (fileMode !== "fsa" || !fileHandle || !portfolio) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      persist().catch((e) => console.error("autosave failed", e));
    }, portfolio.settings.autosaveDebounceMs);
  }

  const mutate = (fn: (p: PortfolioFile) => PortfolioFile) => {
    const p = get().portfolio;
    if (!p) return;
    set({ portfolio: fn(p), dirty: true });
    scheduleAutosave();
  };

  const mapWallets = (
    p: PortfolioFile,
    fn: (w: Wallet) => Wallet | null,
  ): PortfolioFile => ({
    ...p,
    wallets: p.wallets.map(fn).filter((w): w is Wallet => w !== null),
  });

  return {
    fileMode: "fallback",
    fileHandle: null,
    fileName: null,
    password: null,
    encryptionEnabled: true,
    portfolio: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
    privacyMode: false,

    initFileMode: () => set({ fileMode: detectFileMode() }),

    openPortfolio: ({ portfolio, handle, fileName, password }) =>
      set({
        portfolio,
        fileHandle: handle,
        fileName,
        password,
        encryptionEnabled: password !== null,
        dirty: false,
        lastSavedAt: null,
      }),

    closePortfolio: () => {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      set({
        portfolio: null,
        fileHandle: null,
        fileName: null,
        password: null,
        encryptionEnabled: true,
        dirty: false,
        privacyMode: false,
      });
    },

    togglePrivacyMode: () => set((s) => ({ privacyMode: !s.privacyMode })),

    setPassword: (password) => {
      set({ password, encryptionEnabled: password !== null, dirty: true });
      scheduleAutosave();
    },

    saveNow: persist,

    update: mutate,

    addWallet: (w) =>
      mutate((p) => ({
        ...p,
        wallets: [...p.wallets, { ...w, accounts: w.accounts ?? [] }],
      })),

    renameWallet: (walletId, name) =>
      mutate((p) =>
        mapWallets(p, (w) => (w.id === walletId ? { ...w, name } : w)),
      ),

    deleteWallet: (walletId) =>
      mutate((p) => mapWallets(p, (w) => (w.id === walletId ? null : w))),

    addAccount: (walletId, account) =>
      mutate((p) =>
        mapWallets(p, (w) =>
          w.id === walletId ? { ...w, accounts: [...w.accounts, account] } : w,
        ),
      ),

    renameAccount: (walletId, accountId, name) =>
      mutate((p) =>
        mapWallets(p, (w) =>
          w.id === walletId
            ? {
                ...w,
                accounts: w.accounts.map((a) =>
                  a.id === accountId ? { ...a, name } : a,
                ),
              }
            : w,
        ),
      ),

    deleteAccount: (walletId, accountId) =>
      mutate((p) =>
        mapWallets(p, (w) =>
          w.id === walletId
            ? { ...w, accounts: w.accounts.filter((a) => a.id !== accountId) }
            : w,
        ),
      ),

    addTransaction: (accountId, tx) =>
      mutate((p) =>
        mapWallets(p, (w) => ({
          ...w,
          accounts: w.accounts.map((a) =>
            a.id === accountId
              ? { ...a, transactions: [...a.transactions, tx] }
              : a,
          ),
        })),
      ),

    updateTransaction: (txId, tx, accountId) =>
      mutate((p) =>
        mapWallets(p, (w) => ({
          ...w,
          accounts: w.accounts.map((a) => {
            // Remove from old account, insert into target (may be the same).
            const without = a.transactions.filter((t) => t.id !== txId);
            return a.id === accountId
              ? { ...a, transactions: [...without, tx] }
              : { ...a, transactions: without };
          }),
        })),
      ),

    deleteTransaction: (txId) =>
      mutate((p) =>
        mapWallets(p, (w) => ({
          ...w,
          accounts: w.accounts.map((a) => ({
            ...a,
            transactions: a.transactions.filter((t) => t.id !== txId),
          })),
        })),
      ),

    addWatchedAddress: (a) =>
      mutate((p) => ({ ...p, watchedAddresses: [...p.watchedAddresses, a] })),

    deleteWatchedAddress: (id) =>
      mutate((p) => ({
        ...p,
        watchedAddresses: p.watchedAddresses.filter((a) => a.id !== id),
      })),

    setUtxoLabel: (label) =>
      mutate((p) => ({
        ...p,
        utxoLabels: [
          ...p.utxoLabels.filter((l) => l.outpoint !== label.outpoint),
          ...(label.label || label.tags.length ? [label] : []),
        ],
      })),
  };
});
