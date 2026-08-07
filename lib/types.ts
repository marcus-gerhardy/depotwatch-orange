// Data model for the DepotWatch Orange portfolio file.
// All BTC/fiat amounts are decimal strings — never JS numbers (see CLAUDE.md §10).

import type { UserImportPreset } from "./importPresets";
import { DEFAULT_THEME, type ThemeId } from "./theme";

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
  /**
   * Interface colour theme (§5). Optional: files written before it existed
   * fall back to the default, and it is mirrored to a device preference like
   * the language, so the pages without an open file follow it too.
   */
  theme?: ThemeId;
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
  theme: DEFAULT_THEME,
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
 * The order the ledger has to be read in.
 *
 * Timestamps alone are not it: an arrival is regularly recorded *before* the
 * send it belongs to — a hardware wallet stamps the transaction when it sees
 * it, an exchange when the withdrawal completes, and two CSV exports need not
 * agree at all. Reading the arrival first means its lots have not left the
 * source account yet, so the coins arrive from nowhere and drop out of the
 * FIFO engine while the balance still counts them.
 *
 * So every entry is placed at the later of its own date and the dates of the
 * transactions it draws its lots from (an in-leg's out-leg, a disposal's
 * allocated lots), propagated along the chain; `depth` breaks ties within one
 * effective date, so legs sharing a timestamp still read out-leg first.
 */
function causalOrder(entries: LedgerEntry[]): {
  date: Map<string, string>;
  depth: Map<string, number>;
} {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const outByGroup = new Map<string, LedgerEntry>();
  for (const e of entries) {
    if (e.type === "transfer_out" && e.transferGroupId) {
      outByGroup.set(e.transferGroupId, e);
    }
  }

  /** What an entry takes its lots from. */
  function sources(e: LedgerEntry): LedgerEntry[] {
    if (e.type === "buy") return [];
    if (e.type === "transfer_in") {
      const out = e.transferGroupId ? outByGroup.get(e.transferGroupId) : undefined;
      return out ? [out] : [];
    }
    return (e.lotAllocations ?? [])
      .map((a) => byId.get(a.lotTransactionId))
      .filter((x): x is LedgerEntry => x !== undefined);
  }

  const date = new Map<string, string>();
  const depth = new Map<string, number>();
  function visit(e: LedgerEntry): void {
    if (date.has(e.id)) return;
    // Seeded before recursing, so a circular reference in corrupt data stops
    // here instead of looping.
    date.set(e.id, e.date);
    depth.set(e.id, 0);
    let effective = e.date;
    let d = e.type === "buy" || e.type === "transfer_in" ? 0 : 1;
    for (const src of sources(e)) {
      visit(src);
      const srcDate = date.get(src.id)!;
      if (srcDate > effective) effective = srcDate;
      d = Math.max(d, depth.get(src.id)! + 1);
    }
    date.set(e.id, effective);
    depth.set(e.id, d);
  }
  for (const e of entries) visit(e);
  return { date, depth };
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
  const order = causalOrder(entries);
  entries.sort(
    (x, y) =>
      order.date.get(x.id)!.localeCompare(order.date.get(y.id)!) ||
      order.depth.get(x.id)! - order.depth.get(y.id)! ||
      x.id.localeCompare(y.id),
  );
  return entries;
}
