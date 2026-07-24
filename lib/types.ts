// Data model for the DepotWatch Orange portfolio file.
// All BTC/fiat amounts are decimal strings — never JS numbers (see CLAUDE.md §10).

export type WalletType = "exchange" | "hardware" | "software" | "paper";

export type TransactionType =
  | "buy"
  | "sell"
  | "transfer_in"
  | "transfer_out"
  | "spend";

/**
 * Which lot (= buy/transfer_in transaction) a disposal took coins from.
 * Computed once when the sell/spend is created and persisted — it must never
 * be re-derived retroactively when other transactions are added later.
 */
export interface LotAllocation {
  lotTransactionId: string;
  amountBtc: string;
}

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
  /** sell/spend only: persisted lot assignment (FIFO or user-targeted). */
  lotAllocations?: LotAllocation[];
  /** Only for transfer_in/transfer_out: the account on the other side. */
  counterpartyAccountId?: string;
  /** Optional, purely informative reference to a watchlist entry. */
  watchedAddressId?: string;
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

export interface PortfolioFile {
  version: "1.0";
  settings: AppSettings;
  wallets: Wallet[];
  watchedAddresses: WatchedAddress[];
  explorerSettings: ExplorerSettings;
  utxoLabels: UtxoLabel[];
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
  };
}

/** A transaction joined with its wallet/account context, for tables and FIFO. */
export interface LedgerEntry extends Transaction {
  walletId: string;
  walletName: string;
  accountId: string;
  accountName: string;
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
  entries.sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id));
  return entries;
}
