"use client";

import { create } from "zustand";
import type {
  Account,
  DashboardWidgetPlacement,
  Locale,
  PortfolioFile,
  Transaction,
  UtxoLabel,
  Wallet,
  WatchedAddress,
} from "./types";
import type { UserImportPreset } from "./importPresets";
import { emptyPortfolio } from "./types";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "./theme";
import { deleteAndRelease } from "./deletion";
import { Decimal, dec, ZERO } from "./decimal";
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
  /**
   * True after loading a portfolio with no real backing destination (e.g.
   * the demo portfolio) — the file has never been saved anywhere, so it
   * needs the "choose location + set password" step before it can persist.
   */
  needsFileSetup: boolean;

  // UI state (not persisted)
  privacyMode: boolean;

  /**
   * Interface language. Device preference (localStorage), because the start
   * screen and the legal pages are shown without any portfolio open — the
   * portfolio's own `settings.locale` is the source of truth while a file is
   * open and is mirrored here when it is opened or changed.
   */
  uiLocale: Locale;
  /** Read the remembered language; call from an effect (never during SSR). */
  initUiLocale: () => void;
  /** Switch the interface language, incl. the open portfolio's setting. */
  setUiLocale: (locale: Locale) => void;

  /**
   * Interface colour theme — the same arrangement as the language: it travels
   * with the portfolio (`settings.theme`) and is mirrored to a device
   * preference, so the start screen and the legal pages are themed too.
   */
  uiTheme: ThemeId;
  /** Read the remembered theme; call from an effect (never during SSR). */
  initUiTheme: () => void;
  /** Switch the theme, incl. the open portfolio's setting. */
  setUiTheme: (theme: ThemeId) => void;

  initFileMode: () => void;
  openPortfolio: (opts: {
    portfolio: PortfolioFile;
    handle: FileSystemFileHandle | null;
    fileName: string;
    password: string | null;
    /** Set when loading a portfolio with no real backing file yet (see needsFileSetup). */
    isDemo?: boolean;
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
  /**
   * Delete a transaction and release what referenced it: stale lot
   * allocations are dropped and a transfer leg without its counterpart
   * becomes external (see lib/deletion.ts).
   */
  deleteTransaction: (txId: string) => void;
  deleteTransactions: (txIds: string[]) => void;
  /**
   * Move several transactions into another account. Counterpart transfer
   * legs (linked via transferGroupId) that stay behind get their
   * counterpartyAccountId retargeted so the pair remains consistent.
   */
  moveTransactions: (txIds: string[], targetAccountId: string) => void;
  addWatchedAddress: (a: WatchedAddress) => void;
  deleteWatchedAddress: (id: string) => void;
  setUtxoLabel: (label: UtxoLabel) => void;
  /** Insert, or overwrite by id if it already exists. */
  saveImportPreset: (preset: UserImportPreset) => void;
  deleteImportPreset: (id: string) => void;

  /**
   * Interface arrangement (CLAUDE.md §3.5). Both setters are called with the
   * complete new value once an editing session ends, not per interaction, and
   * both ignore a value that equals what is already stored — committing an
   * unchanged arrangement (e.g. when leaving the dashboard) must not dirty the
   * file or trigger a re-encryption.
   */
  saveDashboardLayout: (layout: DashboardWidgetPlacement[]) => void;
  saveTransactionColumns: (columns: string[]) => void;
}

/** Structural comparison for values that are plain JSON (see the UI settings). */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function serializePortfolio(p: PortfolioFile): string {
  return JSON.stringify(p, null, 2);
}

/**
 * Files written before the fee convention was unified (CLAUDE.md §3.2) stored
 * an internal transfer_out *including* its network fee: `amountBtc` was the
 * gross amount that left the account and the lot allocations summed to exactly
 * that, while the in-leg recorded `amountBtc − feeBtc`. Now `amountBtc` is what
 * arrives and `feeBtc` sits on top (allocations sum to `amountBtc + feeBtc`),
 * so such a leg has to give up the fee from its amount — otherwise the fee
 * would be charged twice.
 *
 * Detection is exact: a leg written under the current convention has
 * allocations summing to `amountBtc + feeBtc`, never to `amountBtc`. Legs
 * without allocations are only touched when their in-leg confirms the old
 * shape. The in-leg itself already holds the right value either way.
 */
export function migrateTransferFeeConvention(p: PortfolioFile): PortfolioFile {
  const inLegByGroup = new Map<string, Decimal>();
  for (const w of p.wallets) {
    for (const a of w.accounts) {
      for (const t of a.transactions) {
        if (t.type === "transfer_in" && t.transferGroupId) {
          inLegByGroup.set(
            t.transferGroupId,
            (inLegByGroup.get(t.transferGroupId) ?? ZERO).plus(dec(t.amountBtc)),
          );
        }
      }
    }
  }

  const isLegacyGross = (t: Transaction): boolean => {
    if (t.type !== "transfer_out" || !t.counterpartyAccountId) return false;
    const fee = dec(t.feeBtc);
    if (!fee.gt(0)) return false;
    const amount = dec(t.amountBtc);
    if (t.lotAllocations?.length) {
      const allocated = t.lotAllocations.reduce(
        (s, a) => s.plus(dec(a.amountBtc)),
        ZERO,
      );
      return allocated.eq(amount);
    }
    const arrived = t.transferGroupId
      ? inLegByGroup.get(t.transferGroupId)
      : undefined;
    return arrived !== undefined && arrived.eq(amount.minus(fee));
  };

  let changed = false;
  const wallets = p.wallets.map((w) => ({
    ...w,
    accounts: w.accounts.map((a) => ({
      ...a,
      transactions: a.transactions.map((t) => {
        if (!isLegacyGross(t)) return t;
        changed = true;
        return { ...t, amountBtc: dec(t.amountBtc).minus(dec(t.feeBtc)).toString() };
      }),
    })),
  }));
  return changed ? { ...p, wallets } : p;
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
    portfolio: migrateTransferFeeConvention({
      ...base,
      ...parsed,
      settings: { ...base.settings, ...parsed.settings },
      explorerSettings: { ...base.explorerSettings, ...parsed.explorerSettings },
    }),
    wasEncrypted,
  };
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

const UI_LOCALE_KEY = "depotwatch.locale";
const UI_THEME_KEY = "depotwatch.theme";

function readStoredUiLocale(): Locale | null {
  try {
    const v = localStorage.getItem(UI_LOCALE_KEY);
    return v === "de" || v === "en" ? v : null;
  } catch {
    return null; // storage unavailable (private mode) — stay on the default
  }
}

function storeUiLocale(locale: Locale): void {
  try {
    localStorage.setItem(UI_LOCALE_KEY, locale);
  } catch {
    // The language just won't survive a reload.
  }
}

function readStoredUiTheme(): ThemeId | null {
  try {
    const v = localStorage.getItem(UI_THEME_KEY);
    return isThemeId(v) ? v : null;
  } catch {
    return null; // storage unavailable (private mode) — stay on the default
  }
}

function storeUiTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(UI_THEME_KEY, theme);
  } catch {
    // The theme just won't survive a reload.
  }
}

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
    const next = fn(p);
    // An update that changed nothing must not mark the file dirty: the UI
    // settings are committed wholesale when an editing session ends, which
    // also happens when nothing was actually moved.
    if (next === p) return;
    set({ portfolio: next, dirty: true });
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
    needsFileSetup: false,
    privacyMode: false,
    uiLocale: "de",
    uiTheme: DEFAULT_THEME,

    initFileMode: () => set({ fileMode: detectFileMode() }),

    initUiLocale: () => {
      const stored = readStoredUiLocale();
      if (stored && stored !== get().uiLocale) set({ uiLocale: stored });
    },

    initUiTheme: () => {
      const stored = readStoredUiTheme();
      if (stored && stored !== get().uiTheme) set({ uiTheme: stored });
    },

    setUiTheme: (theme) => {
      storeUiTheme(theme);
      set({ uiTheme: theme });
      // Keep the open file in sync: its settings.theme is the value that
      // travels with the portfolio.
      if (get().portfolio?.settings.theme !== theme) {
        mutate((p) => ({ ...p, settings: { ...p.settings, theme } }));
      }
    },

    setUiLocale: (locale) => {
      storeUiLocale(locale);
      set({ uiLocale: locale });
      // Keep the open file in sync: its settings.locale stays the value that
      // travels with the portfolio.
      if (get().portfolio?.settings.locale !== locale) {
        mutate((p) => ({ ...p, settings: { ...p.settings, locale } }));
      }
    },

    openPortfolio: ({ portfolio, handle, fileName, password, isDemo }) => {
      // The file's own language and theme win on open and become the device
      // defaults; a file written before themes existed keeps the current one.
      storeUiLocale(portfolio.settings.locale);
      const theme = portfolio.settings.theme ?? get().uiTheme;
      storeUiTheme(theme);
      set({
        portfolio,
        fileHandle: handle,
        fileName,
        password,
        encryptionEnabled: password !== null,
        dirty: false,
        lastSavedAt: null,
        needsFileSetup: !!isDemo,
        uiLocale: portfolio.settings.locale,
        uiTheme: theme,
      });
    },

    closePortfolio: () => {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      set({
        portfolio: null,
        fileHandle: null,
        fileName: null,
        password: null,
        encryptionEnabled: true,
        dirty: false,
        needsFileSetup: false,
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
      mutate((p) => {
        // Where the transaction sat before this edit — an edit may move it.
        const previousAccountId = p.wallets
          .flatMap((w) => w.accounts)
          .find((a) => a.transactions.some((t) => t.id === txId))?.id;
        // A moved transfer leg drags its counterpart's reference along, the
        // same way the bulk move does; otherwise the pair would point at the
        // account the leg just left (CLAUDE.md §3.2).
        const retarget =
          tx.transferGroupId !== undefined &&
          previousAccountId !== undefined &&
          previousAccountId !== accountId;

        return mapWallets(p, (w) => ({
          ...w,
          accounts: w.accounts.map((a) => {
            // Remove from old account, insert into target (may be the same).
            const without = a.transactions.filter((t) => t.id !== txId);
            const adjusted = retarget
              ? without.map((t) =>
                  t.transferGroupId === tx.transferGroupId &&
                  t.counterpartyAccountId === previousAccountId
                    ? { ...t, counterpartyAccountId: accountId }
                    : t,
                )
              : without;
            return a.id === accountId
              ? { ...a, transactions: [...adjusted, tx] }
              : { ...a, transactions: adjusted };
          }),
        }));
      }),

    moveTransactions: (txIds, targetAccountId) =>
      mutate((p) => {
        const idSet = new Set(txIds);
        const moved: Transaction[] = [];
        const movedGroupIds = new Set<string>();
        let targetExists = false;
        // Pass 1: pull the selected transactions out of their accounts.
        const stripped = mapWallets(p, (w) => ({
          ...w,
          accounts: w.accounts.map((a) => {
            if (a.id === targetAccountId) targetExists = true;
            const kept = a.transactions.filter((t) => {
              if (!idSet.has(t.id) || a.id === targetAccountId) return true;
              moved.push(t);
              if (t.transferGroupId) movedGroupIds.add(t.transferGroupId);
              return false;
            });
            return kept.length === a.transactions.length
              ? a
              : { ...a, transactions: kept };
          }),
        }));
        if (!targetExists || moved.length === 0) return p;
        // Pass 2: insert into the target and retarget counterpart legs.
        return mapWallets(stripped, (w) => ({
          ...w,
          accounts: w.accounts.map((a) => {
            let txs = a.transactions;
            if (movedGroupIds.size > 0) {
              txs = txs.map((t) =>
                t.transferGroupId &&
                movedGroupIds.has(t.transferGroupId) &&
                t.counterpartyAccountId &&
                !idSet.has(t.id)
                  ? { ...t, counterpartyAccountId: targetAccountId }
                  : t,
              );
            }
            if (a.id === targetAccountId) txs = [...txs, ...moved];
            return txs === a.transactions ? a : { ...a, transactions: txs };
          }),
        }));
      }),

    deleteTransaction: (txId) =>
      mutate((p) => ({ ...p, wallets: deleteAndRelease(p.wallets, [txId]) })),

    deleteTransactions: (txIds) =>
      mutate((p) => ({ ...p, wallets: deleteAndRelease(p.wallets, txIds) })),

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

    saveImportPreset: (preset) =>
      mutate((p) => ({
        ...p,
        importPresets: [
          ...p.importPresets.filter((x) => x.id !== preset.id),
          preset,
        ],
      })),

    deleteImportPreset: (id) =>
      mutate((p) => ({
        ...p,
        importPresets: p.importPresets.filter((x) => x.id !== id),
      })),

    saveDashboardLayout: (layout) =>
      mutate((p) =>
        sameJson(p.uiSettings?.dashboardLayout, layout)
          ? p
          : { ...p, uiSettings: { ...p.uiSettings, dashboardLayout: layout } },
      ),

    saveTransactionColumns: (columns) =>
      mutate((p) =>
        sameJson(p.uiSettings?.transactionColumns, columns)
          ? p
          : { ...p, uiSettings: { ...p.uiSettings, transactionColumns: columns } },
      ),
  };
});
