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
import { emptyPortfolio, flattenLedger } from "./types";
import { isThemeId } from "./theme";
import { APPEARANCE_KEY } from "./themeBoot";
import {
  DEFAULT_APPEARANCE,
  appearanceOf,
  parseAppearance,
  type Appearance,
} from "./appearance";
import { deleteAndRelease } from "./deletion";
import {
  DEFAULT_LOCK_SETTINGS,
  lockSettingsOf,
  lockSettingsToFields,
  parseLockSettings,
  unlockDelayMs,
  type LockSettings,
} from "./autoLock";
import { removeBatchTransactions } from "./importBatches";
import {
  achieveEvent,
  acknowledgeAll,
  evaluateMilestones,
  milestoneContext,
  type MilestoneRecord,
} from "./milestones";
import { computeFifo } from "./fifo";
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
  /**
   * The file-setup step was asked for from somewhere else (the auto-lock,
   * which refuses to lock a portfolio that has no destination yet, §6.4).
   */
  fileSetupRequested: boolean;

  // Auto-lock (§6.4)
  /**
   * Locked: the decrypted portfolio and the password are gone from memory and
   * only `lockedPayload` — the ciphertext, i.e. exactly what is on disk — is
   * left. Unlocking decrypts it again with a freshly typed password.
   */
  locked: boolean;
  lockedPayload: string | null;
  /** Kept separately, because `fileName` is what the lock screen may show. */
  lockedFileName: string | null;
  /** Wrong passwords in a row; drives the delay before the next attempt. */
  unlockFailures: number;
  /** Epoch ms until which the lock screen refuses the next attempt. */
  unlockBlockedUntil: number;
  /**
   * Long-running operations that must not be interrupted by a lock (an
   * import, an export, a bulk valuation). A count rather than a flag: two of
   * them can overlap, and the second finishing must not clear the first.
   */
  busyCount: number;
  lockSettings: LockSettings;

  /**
   * Milestones reached in this session and not yet shown (§5.2). Session
   * state, never persisted: what the file remembers is that they were reached,
   * not that a toast is pending.
   */
  milestoneQueue: MilestoneRecord[];

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
   * How the app looks (§5): theme, system-preference pairing and the colour
   * vision option. The same arrangement as the language — it travels with the
   * portfolio (`uiSettings`) and is mirrored to a device preference, so the
   * start screen and the legal pages are themed before a file is open.
   */
  appearance: Appearance;
  /** What the OS currently asks for; kept in sync by ThemeEffect. */
  systemPrefersDark: boolean;
  /** Read the remembered appearance; call from an effect (never during SSR). */
  initAppearance: () => void;
  setSystemPrefersDark: (dark: boolean) => void;
  /** Change part of the appearance, incl. the open portfolio's settings. */
  setAppearance: (patch: Partial<Appearance>) => void;

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

  /**
   * Record a milestone that nothing in the file could work out for itself:
   * the whitepaper was opened, a tax report was exported (§5.2).
   */
  achieveMilestone: (id: string) => void;
  /** The pending notification was shown; mark those records and clear it. */
  clearMilestoneQueue: () => void;

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
   * Undo a CSV import: drop the transactions it wrote (§3.4). `ids` is what
   * the caller decided to remove, normally `analyzeBatchRemoval().removableIds`
   * — a reference that would break is left alone rather than quietly severed.
   */
  undoImportBatch: (batchId: string, ids: string[]) => void;

  /**
   * Interface arrangement (CLAUDE.md §3.5). Both setters are called with the
   * complete new value once an editing session ends, not per interaction, and
   * both ignore a value that equals what is already stored — committing an
   * unchanged arrangement (e.g. when leaving the dashboard) must not dirty the
   * file or trigger a re-encryption.
   */
  saveDashboardLayout: (layout: DashboardWidgetPlacement[]) => void;
  saveTransactionColumns: (columns: string[]) => void;

  /**
   * The two flags the playful touches remember (CLAUDE.md §5.1): that the
   * one-off whole-coin celebration has been shown, and whether laser eyes are
   * on. Both live in the portfolio file, so they travel with it — and both are
   * written only when they actually change, like every other UI setting.
   */
  setWholecoinerCelebrated: () => void;
  setLaserEyes: (on: boolean) => void;

  /**
   * The December hint about the year in review has been dismissed for this
   * year (§4.2). Recorded per year, so it stays gone for that review and
   * reappears for the next one.
   */
  dismissYearInReview: (year: number) => void;

  // ------------------------------------------------------------ auto-lock
  /** Read the remembered lock settings; call from an effect (never in SSR). */
  initLockSettings: () => void;
  /** Change part of it, in the device preference and in the open file. */
  setLockSettings: (patch: Partial<LockSettings>) => void;
  /**
   * Lock now. Saves first where there is a destination, then drops the
   * plaintext and the password. The result says why nothing happened when
   * nothing did — the caller turns that into something the user can act on.
   */
  lock: () => Promise<LockOutcome>;
  /** Decrypt again. Throws WrongPasswordError, which the lock screen reports. */
  unlock: (password: string) => Promise<void>;
  /** Record a failed attempt and start the backoff (see unlockDelayMs). */
  noteUnlockFailure: () => void;
  /** Mark a long-running operation; always pair them (or use `runBusy`). */
  beginBusy: () => void;
  endBusy: () => void;
  /** Run something that must not be interrupted by a lock. */
  runBusy: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Ask for the "choose a location" step (the auto-lock does when it must). */
  requestFileSetup: (on: boolean) => void;
}

/** Why a lock attempt did or did not happen. */
export type LockOutcome =
  /** Locked; the plaintext is gone. */
  | "locked"
  /** No portfolio open — nothing to lock. */
  | "noFile"
  /** The file has no password, so there is nothing to lock it with (§6.4). */
  | "unencrypted"
  /** Never saved anywhere: the user has to pick a destination first. */
  | "needsSetup"
  /** A long-running operation is in flight; try again when it is done. */
  | "busy";

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
// The old key held a bare theme id; the new one holds the whole appearance.
const UI_THEME_KEY = "depotwatch.theme";
export { APPEARANCE_KEY } from "./themeBoot";

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

function readStoredAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw) return parseAppearance(JSON.parse(raw), DEFAULT_APPEARANCE);
    // The key this replaced held the theme id on its own.
    const legacy = localStorage.getItem(UI_THEME_KEY);
    return isThemeId(legacy)
      ? { ...DEFAULT_APPEARANCE, theme: legacy }
      : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE; // storage unavailable (private mode)
  }
}

function storeAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
  } catch {
    // The look just won't survive a reload.
  }
}

const LOCK_KEY = "depotwatch.lock.v1";

function readStoredLockSettings(): LockSettings {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    return raw
      ? parseLockSettings(JSON.parse(raw), DEFAULT_LOCK_SETTINGS)
      : DEFAULT_LOCK_SETTINGS;
  } catch {
    return DEFAULT_LOCK_SETTINGS; // storage unavailable (private mode)
  }
}

function storeLockSettings(settings: LockSettings): void {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(lockSettingsToFields(settings)));
  } catch {
    // The preference just won't survive a reload; the open file still has it.
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

  /**
   * Work out which milestones the portfolio has reached (§5.2).
   *
   * Event-driven by design: this runs when the portfolio actually changed and
   * when a file is opened, never on a timer. The FIFO pass it needs is the
   * same one the rest of the app does anyway, and it only runs on a change.
   *
   * `silent` is for the first contact with a file that has no milestone
   * history: everything it already fulfils is *discovered*, not reached, so it
   * is recorded acknowledged and nothing is announced. A file that already
   * carries records is a returning one, and what is new since then genuinely
   * happened while the user was away.
   */
  const withMilestones = (
    p: PortfolioFile,
    { silent }: { silent: boolean },
  ): { portfolio: PortfolioFile; newly: MilestoneRecord[] } => {
    const { encryptionEnabled, fileName, lastSavedAt } = get();
    const entries = flattenLedger(p.wallets);
    const ctx = milestoneContext(
      p,
      entries,
      computeFifo(entries, p.settings.holdingPeriodDays),
      {
        encrypted: encryptionEnabled,
        // A portfolio that lives in a file on disk *is* backed up; one that has
        // only ever existed in this tab is not.
        savedOnce: fileName !== null || lastSavedAt !== null,
      },
    );
    const { milestones, newlyAchieved } = evaluateMilestones(ctx, p.milestones ?? []);
    if (newlyAchieved.length === 0) return { portfolio: p, newly: [] };
    return {
      portfolio: {
        ...p,
        milestones: silent ? milestones.map((m) => ({ ...m, acknowledged: true })) : milestones,
      },
      newly: silent ? [] : newlyAchieved,
    };
  };

  const mutate = (fn: (p: PortfolioFile) => PortfolioFile) => {
    const p = get().portfolio;
    if (!p) return;
    const next = fn(p);
    // An update that changed nothing must not mark the file dirty: the UI
    // settings are committed wholesale when an editing session ends, which
    // also happens when nothing was actually moved.
    if (next === p) return;
    // Milestones are evaluated on the result, in the same commit: a change and
    // what it earned belong to one state, not to two renders.
    const { portfolio, newly } = withMilestones(next, { silent: false });
    set({
      portfolio,
      dirty: true,
      milestoneQueue: newly.length > 0 ? [...get().milestoneQueue, ...newly] : get().milestoneQueue,
    });
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
    milestoneQueue: [],
    dirty: false,
    saving: false,
    lastSavedAt: null,
    needsFileSetup: false,
    fileSetupRequested: false,
    locked: false,
    lockedPayload: null,
    lockedFileName: null,
    unlockFailures: 0,
    unlockBlockedUntil: 0,
    busyCount: 0,
    lockSettings: DEFAULT_LOCK_SETTINGS,
    privacyMode: false,
    uiLocale: "de",
    appearance: DEFAULT_APPEARANCE,
    systemPrefersDark: true,

    initFileMode: () => set({ fileMode: detectFileMode() }),

    initUiLocale: () => {
      const stored = readStoredUiLocale();
      if (stored && stored !== get().uiLocale) set({ uiLocale: stored });
    },

    initAppearance: () => set({ appearance: readStoredAppearance() }),

    setSystemPrefersDark: (dark) =>
      get().systemPrefersDark === dark ? undefined : set({ systemPrefersDark: dark }),

    setAppearance: (patch) => {
      const appearance = { ...get().appearance, ...patch };
      storeAppearance(appearance);
      set({ appearance });
      // Keep the open file in sync: uiSettings is what travels with it.
      if (!get().portfolio) return;
      mutate((p) => ({
        ...p,
        uiSettings: {
          ...p.uiSettings,
          theme: appearance.theme,
          themeMode: appearance.mode,
          themeLight: appearance.light,
          themeDark: appearance.dark,
          colorBlindSafe: appearance.colorBlindSafe,
        },
      }));
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
      // The file's own language and appearance win on open and become the
      // device defaults; whatever a file does not say keeps its current value,
      // so an older file simply carries less over.
      storeUiLocale(portfolio.settings.locale);
      const appearance = appearanceOf(portfolio, get().appearance);
      storeAppearance(appearance);
      // The file's own lock configuration wins on open and becomes the device
      // default, exactly like the language and the appearance.
      const lockSettings = lockSettingsOf(portfolio, get().lockSettings);
      storeLockSettings(lockSettings);
      set({
        // The runtime facts a milestone may read have to be in place first.
        encryptionEnabled: password !== null,
        fileName,
        lastSavedAt: null,
      });
      // Time-based milestones only ever become true by waiting, so opening a
      // file is the moment to look. A file that carries no history yet is
      // filled in silently (see withMilestones).
      const evaluated = withMilestones(portfolio, {
        silent: portfolio.milestones === undefined,
      });
      set({
        portfolio: evaluated.portfolio,
        milestoneQueue: evaluated.newly,
        fileHandle: handle,
        fileName,
        password,
        encryptionEnabled: password !== null,
        dirty: false,
        lastSavedAt: null,
        needsFileSetup: !!isDemo,
        uiLocale: portfolio.settings.locale,
        appearance,
        lockSettings,
        // A newly opened file is never a locked one.
        locked: false,
        lockedPayload: null,
        lockedFileName: null,
        unlockFailures: 0,
        unlockBlockedUntil: 0,
        fileSetupRequested: false,
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
        // Closing from the lock screen has to drop the ciphertext too, or the
        // next visitor could keep guessing at a file nobody opened.
        locked: false,
        lockedPayload: null,
        lockedFileName: null,
        unlockFailures: 0,
        unlockBlockedUntil: 0,
        fileSetupRequested: false,
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

    achieveMilestone: (id) => {
      const p = get().portfolio;
      if (!p) return;
      const { milestones, newlyAchieved } = achieveEvent(p.milestones ?? [], id);
      if (newlyAchieved.length === 0) return;
      set({
        portfolio: { ...p, milestones },
        dirty: true,
        milestoneQueue: [...get().milestoneQueue, ...newlyAchieved],
      });
      scheduleAutosave();
    },

    clearMilestoneQueue: () => {
      const p = get().portfolio;
      set({ milestoneQueue: [] });
      if (!p) return;
      const milestones = acknowledgeAll(p.milestones ?? []);
      // Same list back when there was nothing to acknowledge: seeing a toast
      // must not be able to dirty the file on its own.
      if (milestones === p.milestones) return;
      set({ portfolio: { ...p, milestones }, dirty: true });
      scheduleAutosave();
    },

    undoImportBatch: (batchId, ids) =>
      mutate((p) => removeBatchTransactions(p, batchId, ids)),

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

    setWholecoinerCelebrated: () =>
      mutate((p) =>
        p.uiSettings?.wholecoinerCelebrated
          ? p
          : { ...p, uiSettings: { ...p.uiSettings, wholecoinerCelebrated: true } },
      ),

    setLaserEyes: (on) =>
      mutate((p) =>
        (p.uiSettings?.laserEyes ?? false) === on
          ? p
          : { ...p, uiSettings: { ...p.uiSettings, laserEyes: on } },
      ),

    dismissYearInReview: (year) =>
      mutate((p) => {
        const seen = p.uiSettings?.yearInReviewDismissed ?? [];
        return seen.includes(year)
          ? p
          : {
              ...p,
              uiSettings: {
                ...p.uiSettings,
                yearInReviewDismissed: [...seen, year].sort((a, b) => a - b),
              },
            };
      }),
    // ---------------------------------------------------------- auto-lock

    initLockSettings: () => set({ lockSettings: readStoredLockSettings() }),

    setLockSettings: (patch) => {
      const lockSettings = { ...get().lockSettings, ...patch };
      storeLockSettings(lockSettings);
      set({ lockSettings });
      if (!get().portfolio) return;
      mutate((p) => ({
        ...p,
        uiSettings: { ...p.uiSettings, ...lockSettingsToFields(lockSettings) },
      }));
    },

    lock: async () => {
      const { portfolio, password, needsFileSetup, busyCount } = get();
      if (!portfolio) return "noFile";
      // An unencrypted file has no secret to be locked with. Hiding it behind
      // an overlay while the plaintext stays in memory would be the dishonest
      // version of this feature, so it is refused and said out loud (§6.4).
      if (password === null) return "unencrypted";
      // Loaded but never written anywhere: locking is safe (the ciphertext
      // below holds everything), but the user should pick a destination while
      // they are still here rather than after a reload.
      if (needsFileSetup) {
        set({ fileSetupRequested: true });
        return "needsSetup";
      }
      if (busyCount > 0) return "busy";

      // Never lose data to a lock: write what is pending, where there is
      // somewhere to write it. A failure is not fatal — the ciphertext keeps
      // the change and `dirty` stays true, so it can be saved after unlocking.
      if (get().dirty && get().fileMode === "fsa" && get().fileHandle) {
        try {
          await persist();
        } catch (e) {
          console.error("save before lock failed", e);
        }
      }

      const current = get().portfolio;
      if (!current) return "noFile";
      const payload = await encryptPortfolio(serializePortfolio(current), password);
      if (autosaveTimer) clearTimeout(autosaveTimer);
      set({
        locked: true,
        lockedPayload: payload,
        lockedFileName: get().fileName,
        // What the lock is actually about: no plaintext and no key material
        // left in memory. Everything else about the session stays, so
        // unlocking resumes rather than re-opens.
        portfolio: null,
        password: null,
        milestoneQueue: [],
        privacyMode: false,
        unlockFailures: 0,
        unlockBlockedUntil: 0,
      });
      return "locked";
    },

    unlock: async (password) => {
      const payload = get().lockedPayload;
      if (payload === null) return;
      // A real decryption, which is what makes the lock more than a curtain:
      // a wrong password cannot get past this line.
      const { portfolio } = await deserializePortfolio(payload, password);
      // Time passed while the file was locked, and time is what the patience
      // milestones are made of — so unlocking looks, like opening does.
      const evaluated = withMilestones(portfolio, { silent: false });
      set({
        portfolio: evaluated.portfolio,
        milestoneQueue: evaluated.newly,
        password,
        encryptionEnabled: true,
        locked: false,
        lockedPayload: null,
        lockedFileName: null,
        unlockFailures: 0,
        unlockBlockedUntil: 0,
      });
    },

    noteUnlockFailure: () =>
      set((s) => {
        const failures = s.unlockFailures + 1;
        return {
          unlockFailures: failures,
          unlockBlockedUntil: Date.now() + unlockDelayMs(failures),
        };
      }),

    beginBusy: () => set((s) => ({ busyCount: s.busyCount + 1 })),
    endBusy: () => set((s) => ({ busyCount: Math.max(0, s.busyCount - 1) })),
    runBusy: async (fn) => {
      get().beginBusy();
      try {
        return await fn();
      } finally {
        get().endBusy();
      }
    },

    requestFileSetup: (on) => set({ fileSetupRequested: on }),
  };
});
