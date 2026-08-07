// Data model for the DepotWatch Orange portfolio file.
// All BTC/fiat amounts are decimal strings — never JS numbers (see CLAUDE.md §10).

import type { UserImportPreset } from "./importPresets";

export type WalletType = "exchange" | "hardware" | "software" | "paper";

export type TransactionType =
  | "buy"
  | "sell"
  | "transfer_in"
  | "transfer_out"
  | "spend";

/**
 * Which lot (= buy/transfer_in transaction) a sell/spend/transfer_out took
 * coins from. Computed once when the transaction is created and persisted —
 * it must never be re-derived retroactively when other transactions are
 * added later.
 */
export interface LotAllocation {
  lotTransactionId: string;
  amountBtc: string;
}

/** Provenance of a transaction's EUR value, so estimates stay recognizable. */
export type EurValuationSource = "manual" | "binance-klines";

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string; // ISO-8601
  amountBtc: string;
  /** EUR price per BTC at transaction time; null for transfers. */
  pricePerBtcEur: string | null;
  /**
   * EUR actually paid/received for the whole transaction, excluding fees
   * (= pricePerBtcEur × amountBtc); null for transfers. Absent in files
   * written before this field existed.
   */
  totalFiatEur?: string | null;
  /** Optional — most brokers only report a fiat fee. */
  feeBtc?: string;
  feeFiatEur?: string;
  /**
   * sell/spend/transfer_out: persisted lot assignment (FIFO or
   * user-targeted). For a transfer_out these are the source-account lots the
   * transfer closes; their sum must equal `amountBtc + feeBtc`, i.e. what
   * actually left the account under the fee convention (§3.2) and what the
   * FIFO engine consumes. `allocationTargetBtc()` in lib/transferLink.ts is
   * that rule.
   */
  lotAllocations?: LotAllocation[];
  /** Only for transfer_in/transfer_out: the account on the other side. */
  counterpartyAccountId?: string;
  /**
   * Shared id linking the out-leg and in-leg(s) of one internal transfer.
   * The FIFO engine re-creates the out-leg's allocated lots (original
   * acquisition date + cost basis) in the receiving account; the in-leg's
   * `date` is only the arrival time for display purposes.
   */
  transferGroupId?: string;
  /** Optional, purely informative reference to a watchlist entry. */
  watchedAddressId?: string;
  /**
   * transfer_in/transfer_out only: the on-chain transaction id (64 hex chars,
   * lower case). Optional — transactions written before this field existed
   * stay valid.
   */
  txid?: string;
  /**
   * transfer_in/transfer_out only: the Bitcoin address this leg refers to —
   * the destination for a transfer_out, the receiving address for a
   * transfer_in. One on-chain transaction can pay several outputs, so the
   * address pins down which one is meant.
   *
   * Matching aid only (pairing an out-leg with its in-leg). The security and
   * privacy features deliberately never read it: they operate exclusively on
   * the separate address watchlist (CLAUDE.md §3.1/§3.3).
   */
  address?: string;
  /**
   * Settled in another currency or asset than EUR (e.g. a BTC buy against USDT
   * on Bitget): the currency/asset code, the amount paid/received in it, and
   * the price per BTC in it.
   *
   * Documentation only (CLAUDE.md §3.2). EUR stays the one valuation currency:
   * every calculation — FIFO, holding periods, P&L, dashboard — reads
   * `pricePerBtcEur`/`totalFiatEur` and never these fields.
   */
  originalCurrency?: string;
  originalAmount?: string;
  originalPricePerBtc?: string;
  /**
   * Where the EUR valuation came from: entered by hand or derived from the
   * historical Binance BTC/EUR close of the transaction day. Absent means
   * "manual" (every transaction written before this field existed).
   */
  eurValuationSource?: EurValuationSource;
  note: string;
}

export interface Account {
  id: string;
  name: string;
  transactions: Transaction[];
}

export interface Wallet {
  id: string;
  name: string;
  type: WalletType;
  accounts: Account[];
}

export type WatchedAddressType = "address" | "xpub" | "ypub" | "zpub";

export interface WatchedAddress {
  id: string;
  type: WatchedAddressType;
  value: string;
  label: string;
  tags: string[];
}

export type ExplorerProvider = "mempool.space" | "blockstream" | "custom-electrum";

export interface ExplorerSettings {
  provider: ExplorerProvider;
  /** Optional, e.g. an own Esplora-compatible endpoint. */
  customEndpoint?: string;
}

/** User label attached to a live UTXO (coin control). Keyed by "txid:vout". */
export interface UtxoLabel {
  outpoint: string;
  label: string;
  tags: string[]; // e.g. "kyc", "non-kyc"
}

export type Currency = "EUR" | "USD";
export type Locale = "de" | "en";

export interface AppSettings {
  locale: Locale;
  currencyDisplay: Currency;
  /** German rule: holdings become tax-free after this many days (default 365). */
  holdingPeriodDays: number;
  costBasisMethod: "FIFO";
  /** Debounce for autosave in File System Access mode, ms. */
  autosaveDebounceMs: number;
}

/** One widget placed on the dashboard grid, in grid units (CLAUDE.md §4.1). */
export interface DashboardWidgetPlacement {
  /** Instance id; unique per placement and used as the grid item key. */
  i: string;
  /** Registry id of the widget rendered here. */
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How the user arranged the interface. Part of the portfolio file rather than
 * a device preference (CLAUDE.md §3.5), so the arrangement travels with the
 * file instead of being tied to one browser.
 *
 * Every field is optional and so is `uiSettings` itself: a file written before
 * this existed stays valid and simply falls back to the defaults.
 */
export interface UiSettings {
  /** Position, size and choice of dashboard widgets. */
  dashboardLayout?: DashboardWidgetPlacement[];
  /** Visible transaction-table columns, in display order. */
  transactionColumns?: string[];
}

export interface PortfolioFile {
  version: "1.0";
  settings: AppSettings;
  wallets: Wallet[];
  watchedAddresses: WatchedAddress[];
  explorerSettings: ExplorerSettings;
  utxoLabels: UtxoLabel[];
  /** User-defined CSV import presets, portable with the file (see CLAUDE.md §3.4). */
  importPresets: UserImportPreset[];
  /** Interface arrangement; absent in files written before it existed. */
  uiSettings?: UiSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  locale: "de",
  currencyDisplay: "EUR",
  holdingPeriodDays: 365,
  costBasisMethod: "FIFO",
  autosaveDebounceMs: 1500,
};

export function emptyPortfolio(): PortfolioFile {
  return {
    version: "1.0",
    settings: { ...DEFAULT_SETTINGS },
    wallets: [],
    watchedAddresses: [],
    explorerSettings: { provider: "mempool.space" },
    utxoLabels: [],
    importPresets: [],
  };
}

/** A transaction joined with its wallet/account context, for tables and FIFO. */
export interface LedgerEntry extends Transaction {
  walletId: string;
  walletName: string;
  accountId: string;
  accountName: string;
}

/**
 * Causal depth derived from persisted lot references: lot-creating entries
 * (buy, external transfer_in) are 0, every consuming/receiving step is one
 * deeper. Used purely as a same-date tie-break so the FIFO engine sees an
 * out-leg before its in-leg and multi-hop transfers in recording order even
 * when all legs share one timestamp.
 */
function causalDepths(entries: LedgerEntry[]): Map<string, number> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const outByGroup = new Map<string, LedgerEntry>();
  for (const e of entries) {
    if (e.type === "transfer_out" && e.transferGroupId) {
      outByGroup.set(e.transferGroupId, e);
    }
  }
  const depths = new Map<string, number>();
  function depthOf(e: LedgerEntry): number {
    const known = depths.get(e.id);
    if (known !== undefined) return known;
    depths.set(e.id, 0); // guards against cyclic references in corrupt data
    let d = 0;
    if (e.type === "transfer_in") {
      const out = e.transferGroupId ? outByGroup.get(e.transferGroupId) : undefined;
      if (out) d = depthOf(out) + 1;
    } else if (e.type !== "buy") {
      d = 1;
      for (const a of e.lotAllocations ?? []) {
        const lotTx = byId.get(a.lotTransactionId);
        if (lotTx) d = Math.max(d, depthOf(lotTx) + 1);
      }
    }
    depths.set(e.id, d);
    return d;
  }
  for (const e of entries) depthOf(e);
  return depths;
}

export function flattenLedger(wallets: Wallet[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const w of wallets) {
    for (const a of w.accounts) {
      for (const t of a.transactions) {
        entries.push({
          ...t,
          walletId: w.id,
          walletName: w.name,
          accountId: a.id,
          accountName: a.name,
        });
      }
    }
  }
  const depths = causalDepths(entries);
  entries.sort(
    (x, y) =>
      x.date.localeCompare(y.date) ||
      depths.get(x.id)! - depths.get(y.id)! ||
      x.id.localeCompare(y.id),
  );
  return entries;
}
