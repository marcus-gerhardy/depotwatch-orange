@AGENTS.md

# DepotWatch Orange — Project Specification

> This file can be used directly as a prompt/context for Claude Code to set up the project.

**Project name:** DepotWatch Orange
**Domain:** depotwatch-orange.com (check availability/register)
**Languages:** German (default) and English, switchable

## 1. Project Overview

Web app for managing a Bitcoin portfolio. MVP: manual transaction entry. Later stages: CSV import and API integration with brokers/exchanges.

**Core principle:** No user data is stored on the server. All portfolio data lives in a single, password-encrypted file that the user opens locally, edits in the browser, and saves back.

## 2. Architecture Principle: Local-First, No Server Storage

- The app is a pure client application (SPA/PWA). The server serves static code only — no database, no backend storage for user data.
- **File handling:**
  - Primary: [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) (Chrome/Edge/Opera). The user opens the portfolio file once, the app keeps the file handle, and all changes are written straight back to the file — no manual re-save needed.
  - Fallback (Safari/Firefox): classic upload (`<input type="file">`) on startup, saving via Blob download through a "Save" button.
  - Feature detection at app start decides which mode is used.
- **Encryption:** Before writing, the file is encrypted with a user-chosen password (Web Crypto API: AES-GCM, key derivation via PBKDF2). On opening, the password is requested and the file is decrypted.
- No login/auth system — possession of the file + password replaces authentication.

## 3. Data Model

### 3.1 Two-Layer Architecture

The app separates two independent data layers, because accounting lots (purchases at different times/prices) and actual on-chain UTXOs cannot be reliably mapped 1:1 (e.g. several separate purchases are often sent in one batch to a single address, forming a single UTXO there):

1. **Portfolio ledger (accounting):** manually recorded buy/sell/transfer/spend events for holdings, P&L, and FIFO tax logic. Pure bookkeeping, independent of the actual on-chain structure.
2. **Address watchlist (security/on-chain):** an independent list of Bitcoin addresses or xpubs the user adds for monitoring (watch-only principle, as in Sparrow/Electrum). All security features (sections 6.1/6.2) operate on this list with live blockchain data, independent of the ledger.

A ledger transaction can optionally reference an address from the watchlist (purely informative, no functional dependency).

### 3.2 Portfolio Ledger

Hierarchy: **Wallet → Account → Transactions**. A wallet (e.g. an exchange or hardware wallet) can contain multiple accounts (e.g. "Spot", "Savings", "Account 1").

```json
{
  "version": "1.0",
  "currencyDisplay": "EUR",
  "wallets": [
    {
      "id": "uuid",
      "name": "Kraken",
      "type": "exchange | hardware | software | paper",
      "accounts": [
        {
          "id": "uuid",
          "name": "Spot",
          "transactions": []
        }
      ]
    }
  ]
}
```

Transaction schema:

```json
{
  "id": "uuid",
  "type": "buy | sell | transfer_in | transfer_out | spend",
  "date": "ISO-8601",
  "amountBtc": "decimal string",
  "pricePerBtcEur": "decimal | null (price per BTC; for transfers optional: the traced average cost of the moved lots, for display only)",
  "totalFiatEur": "decimal | null (EUR total actually paid/received for the transaction; for transfers optional: value of the moved amount at the traced average cost, for display only)",
  "feeBtc": "decimal | null (optional — many brokers only report fees in EUR)",
  "feeFiatEur": "decimal | null (optional)",
  "counterpartyAccountId": "transfer_in/transfer_out only: reference to the destination/source account",
  "transferGroupId": "transfer_in/transfer_out only: shared id linking the out-leg and in-leg(s) of one internal transfer",
  "lotAllocations": "sell/spend/transfer_out: array of { lotTransactionId, amountBtc } — references the buy/transfer_in transaction(s) (lots) this amount came from; for a transfer_out these are the source-account lots the transfer closes, and their sum must equal amountBtc exactly",
  "txid": "transfer_in/transfer_out only, optional: on-chain transaction id (64 hex chars, lower case)",
  "address": "transfer_in/transfer_out only, optional: the Bitcoin address of this leg — destination for a transfer_out, receiving address for a transfer_in",
  "note": "string"
}
```

Note: process amounts as strings/with a decimal library, not as JS `number` (avoid rounding errors with crypto amounts). For buy/sell/spend, at least one of `pricePerBtcEur` or `totalFiatEur` must be set — the missing field is derived from the other (`totalFiatEur = pricePerBtcEur × amountBtc` or vice versa).

Transfer legs created by the transfer dialog carry the moved lots' quantity-weighted average cost in `pricePerBtcEur` and the value of the transferred amount in `totalFiatEur`, so the transaction table shows a price and a value for transfers too. That is display data: the FIFO engine keeps deriving cost basis and acquisition dates from the moved lots (an internal transfer_in never reads the price), and a linked existing transaction keeps a price it already has.

Linking an existing transaction as the out-leg (transfer dialog): the candidate matches when its `amountBtc` **plus** the network fee entered in the dialog equals the sum of the selected lots. Its amount is never rewritten — only `feeBtc` and the lot allocations are written back. Picking a candidate adopts its own `feeBtc` into the dialog when no fee was entered yet.

On-chain fields (`txid`, `address`): both optional and only meaningful for `transfer_in`/`transfer_out` — the form never offers them for buy/sell/spend, and the CSV import drops them for those types. `txid` is stored normalized (trimmed, lower case) and must be exactly 64 hex characters; `address` must be a syntactically valid Bitcoin address (legacy P2PKH/P2SH, bech32 SegWit v0, bech32m Taproot — checksum verified for bech32/bech32m, case rules per BIP-173), stored trimmed with an all-uppercase bech32 address folded to lower case. Because one on-chain transaction can pay several outputs, the address pins down which output this leg means. Both are **matching aids only** (pairing an out-leg with its in-leg): the security/privacy and UTXO features must keep operating exclusively on the address watchlist (§3.1/§3.3) — never derive watchlist data from the ledger or vice versa. Explorer links for these values are rendered as plain anchors the user clicks; the table must never fetch anything while rendering (a txid/address must not reach a third party unasked).

Fee convention (`feeBtc`): `amountBtc` is always what reaches the other side — the coins received on a buy/transfer_in, the coins sold, spent or sent on the outgoing types. A BTC fee is **on top of** that: a buy credits `amountBtc − feeBtc`, and sell/spend/transfer_out (internal *and* external) debit `amountBtc + feeBtc`. For a transfer_out that sum is exactly what its `lotAllocations` add up to, and the in-leg of an internal transfer records the out-leg's `amountBtc` unchanged — so a transfer pair costs the portfolio precisely the network fee. `balanceDelta()` in `lib/portfolio.ts` is the single implementation of this rule; the FIFO engine consumes lots the same way, and a test asserts both stay equal. Files written before this was unified (out-leg amount incl. fee, allocations summing to it, in-leg net) are converted on load by `migrateTransferFeeConvention()` in `lib/store.ts`.

**Deleting a transaction** releases what pointed at it (`lib/deletion.ts`, used by both delete actions in the store): `lotAllocations` entries referencing a deleted transaction are dropped, so that disposal falls back to dynamic FIFO instead of reporting a phantom uncovered amount; and a transfer leg whose counterpart is gone loses `transferGroupId`/`counterpartyAccountId`, i.e. it becomes a plain external send/receive, so its coins stay accounted for in both the balance and the FIFO engine. A group with several in-legs stays intact as long as one out-leg and one in-leg remain. The confirm dialog names how many transactions this affects.

**Lot concept:** A "lot" is not a separate entity but any buy/transfer_in transaction with a remaining balance (amount − amount already sold via `lotAllocations`). The assignment of a sale to one or more lots is computed at the time of the sale (automatically via FIFO or chosen manually) and stored permanently in `lotAllocations` — it is never retroactively recomputed when new transactions are added later.

**Lot continuity across internal transfers:** Moving coins between own wallets/accounts must not reset the tax lot history. An internal transfer_out carries `lotAllocations` (FIFO-selected or user-targeted, possibly several lots batched into one on-chain transaction) and shares a `transferGroupId` with its transfer_in leg(s). A transfer_in does NOT start a new lot at the transfer date — its `date` is only the arrival time for display purposes. The FIFO/tax engine resolves lot identity (original acquisition date + cost basis) at runtime by following transferGroupId → transfer_out → lotAllocations back to the original buy, across any number of transfer hops. Holding-period and cost-basis calculations for later disposals always use the traced original lot.

### 3.3 Address Watchlist

```json
{
  "watchedAddresses": [
    {
      "id": "uuid",
      "type": "address | xpub | ypub | zpub",
      "value": "bc1q... or xpub...",
      "label": "e.g. Ledger Account 1",
      "tags": ["kyc", "hardware-wallet"]
    }
  ],
  "explorerSettings": {
    "provider": "mempool.space | blockstream | custom-electrum",
    "customEndpoint": "optional, e.g. your own Electrum server"
  }
}
```

Live data (current UTXOs, address history, pubkey exposure) is fetched at runtime from the configured explorer source, not stored in the file (only the watchlist itself is persisted).

### 3.4 CSV Import Presets

Import configurations for the CSV import wizard (delimiter, encoding, date format, column mapping, per-field BTC/Sats unit, and the "Typ" value-mapping table) come from two sources:

- **System presets:** read-only, shipped in the app's code under `/config/import-presets/` (one JSON file per provider, e.g. `kraken.json`). Not stored in the portfolio file, not editable or deletable by the user — only an app update can change them. New providers are added by dropping in another JSON file (see `lib/importPresets.ts`).
- **User presets:** created, edited, and deleted by the user in the import wizard. Stored in the portfolio file itself (`importPresets`), so they travel with the file rather than being tied to one device/browser.

```json
{
  "importPresets": [
    {
      "id": "uuid",
      "name": "e.g. My Ledger export",
      "delimiter": ", | ;",
      "decimalSeparator": ". | ,",
      "encoding": "utf-8 | iso-8859-1 | iso-8859-15",
      "mapping": { "type": "CSV column name", "date": "…", "time": "…", "amountBtc": "…" },
      "fixedType": "optional: buy | sell | transfer_in | transfer_out | spend",
      "dateFormat": "optional: iso | de | mdy | dmy | ymd | unix-s | unix-ms",
      "timeFormat": "optional: hms | h12 | datetime",
      "amountUnit": "optional: btc | sats",
      "feeMode": "optional: included | deducted",
      "feeUnit": "optional: btc | sats",
      "typeValueMapping": { "optional, e.g. received": "transfer_in", "sent": "transfer_out" },
      "rowFilter": {
        "optional — only matching CSV lines are imported": null,
        "combinator": "and | or",
        "rules": [
          {
            "column": "CSV column name, e.g. transaction_type",
            "match": "isAnyOf | isNoneOf (default isAnyOf)",
            "values": ["trade"]
          }
        ]
      }
    }
  ]
}
```

**Column mapping:** the wizard proposes a mapping from the header names. Every field/column pair is scored (whole header name > all words of a phrase anywhere in the header > substring, minus per-field exclusions) and the best pairs are taken first, so `transaction_type` or `Operation Type` finds the type field while an exact `type` still beats `ordertype`, and "Amount Fiat" lands on the fiat total rather than the BTC amount. Ties go to the earlier column, i.e. the first column that says "type" wins.

**Date and time:** two separate mapping fields, both mandatory, each with its own format select. An export with separate columns ("Datum" + "Uhrzeit") maps one to each; an export with a single date-time column has that column selected in *both* fields and its time read out of the value (`timeFormat: "datetime"`). The time field is optional. The date cell stays in the preview exactly as the file has it; the time cell is normalized to "HH:MM:SS" (`normalizeTimeCell`), so a column holding a whole timestamp shows just its clock time and a 12-hour value shows the 24-hour one, while an unreadable value is kept verbatim and flagged. The two are combined only when the row is validated and imported (`parseImportDateTime`): pointing both fields at the same column parses that value once, separate columns put the time cell's clock time on the date cell's calendar day (local time, as a single cell "01.02.2024 10:30" has always been read). A time that cannot be read is reported per row as `invalidTime`. A value with an explicit zone ("…T23:30:00Z") names an instant, so day *and* clock time are both read in local terms; otherwise the two halves could come from different days and move the transaction. The mapping proposal checks the data, not just the header, so "Time in force" never becomes the time column; with no time column at all it falls back to the date column, which is also what a date-only export needs (its rows then import at midnight). A row whose time cell is empty is reported as `invalidTime` rather than silently becoming 00:00.

**Values on import:** an amount is stored as a magnitude, because the direction comes from the transaction type — a leading minus, as Bitvavo writes it for withdrawals, is dropped. BTC amounts and BTC fees are rounded to 8 decimals (`btcString`), the satoshi being the smallest unit the ledger stores.

**Fee mode (BTC fee only):** exports disagree on whether the amount column already has the BTC fee taken out of it, so the wizard asks, next to the mapped BTC-fee column: `included` (default — the amount still contains the fee, e.g. a withdrawal row showing what left the account) or `deducted` (the amount is already net, e.g. a row showing what arrived). The import converts either one to the ledger convention of §3.2, where `feeBtc` is always on top of `amountBtc`: with `included` an outgoing amount becomes `amount − fee`, with `deducted` a buy becomes `amount + fee`. Exactly one side needs correcting per mode, and either way the coins that actually move stay the file's amount. A `transfer_in` is never touched (its credit ignores the fee, which belongs to the out-leg), and a fiat fee never changes a BTC amount. The setting is per import, so a file that mixes both conventions across row types needs two runs.

**Row filter:** the wizard's second step restricts the import to certain lines — any number of conditions "column is (not) one of \<values\>", joined by one AND/OR combinator. Columns and values are offered from the loaded file (values with occurrence counts), so a filter always fits the file at hand; e.g. a 21bitcoin export where only `transaction_type = trade` should be imported. A rule without selected values, or one naming a column the file does not have, is ignored rather than dropping every row. Filtered-out lines never reach the mapping/type-value/preview steps, and surviving rows keep their original CSV line number.

In the wizard's first step, the user picks a preset (system presets first, marked as predefined, then their own) or "manual/no preset"; picking one pre-fills every later step, which the user can still adjust before importing. After a manual or adjusted run, the user can save the resulting configuration as a new user preset.

## 4. MVP Features

- **Wallet/account management:** create, rename, delete (hierarchy wallet → account).
- **Transaction entry (manual):** buy, sell, transfer (wallet-to-wallet/account-to-account), spend (payment with BTC).
- **Dashboard:**
  - Total portfolio value, current price via Binance public API, switchable EUR/USD.
  - Profit/loss (realized + unrealized), average cost basis (FIFO).
  - Breakdown by wallet/account.
- **Transaction table:** sortable, filterable by wallet, account, type, date range.
- **Value history chart:** portfolio performance over time, optional comparison against the BTC price (historical data via Binance Klines API).
- **Tax module (Germany):** *(stage 2 — implemented but hidden behind the `TAX_FEATURES_ENABLED` flag in `lib/features.ts`; the FIFO engine keeps running, only the tax-specific UI is removed)*
  - FIFO lot assignment on sell/spend.
  - Marking tax-free (holding period > 1 year) vs. taxable.
  - Display of remaining time until tax-free status per open lot.
- **File handling:** open/save incl. password prompt and encryption (see section 2).

## 5. Design

- Minimalist, clean, reduced UI.
- Dark mode as the default theme.
- Bitcoin color theme: accent color orange (`#F7931A`) on black/dark gray, green/red for profit/loss indicators.
- Responsive, desktop-focused, but mobile-friendly.

## 6. Settings

### 6.1 Security & Privacy

- **Address reuse detection:** warning when a watched address has been used for receiving more than once.
- **Public key leak detection:** check whether, for legacy/P2SH addresses, a spend has already exposed the public key on-chain.
- **xpub leak warning:** notice when adding an xpub that sharing it exposes the wallet's entire transaction history.
- **Address poisoning warning:** detection of dust transfers with visually similar addresses (a common scam attempt).
- **Address type hint:** recommendation of modern address formats (native SegWit/Taproot) over legacy, for better privacy and lower fees.
- **Privacy score:** heuristic-based assessment per transaction/UTXO (incl. common-input-ownership heuristic, conspicuously round amounts).
- **Privacy mode (UI):** ability to blur/hide amounts in the interface (e.g. for screenshots or screen sharing).

### 6.2 UTXO Management

- **Coin control with labels:** tag individual UTXOs (source, KYC/non-KYC, wallet) for targeted selection in future spends.
- **Dust UTXO detection:** flag UTXOs whose spend fee would exceed their value.
- **Consolidation suggestions:** recommend merging small UTXOs when network fees are low.

### 6.3 General Settings

- Language (German/English toggle, German as default) — the choice lives in the portfolio file and is mirrored to a device preference (`localStorage`), so the pages that exist without an open file (start screen, "how it works", legal notice, privacy) follow it as well; those pages carry their own DE/EN switch and exist under a localized URL per language (`/so-funktionierts` ↔ `/how-it-works`, `/impressum` ↔ `/legal-notice`, `/datenschutz` ↔ `/privacy`; map in `lib/routes.ts`). Opening a page adopts the URL's language; switching the language rewrites the URL — except while a portfolio is open, where the file's language wins
- Default display currency (EUR/USD toggle)
- Explorer source for on-chain queries: public API (default, e.g. mempool.space) or your own Electrum server/node (maximum privacy) — with a clear UI notice about the trade-off that public APIs transmit addresses to third parties
- Change password / enable/disable encryption
- Tax settings (holding period rule, FIFO as default, possibly LIFO selectable later)
- Autosave behavior (interval/debounce in File System Access API mode)

## 7. Tech Stack

- **Framework:** Next.js (App Router) + Tailwind CSS
- **i18n:** next-intl (or comparable) for DE/EN language switching, German as default
- **State management:** lightweight (React Context or Zustand), no Redux needed
- **Charts:** Recharts or Chart.js
- **Price data:** Binance public API (ticker for live price, Klines for historical chart data)
- **On-chain data:** mempool.space/Blockstream Esplora API (default) or a configurable own Electrum server; Next.js API routes optionally usable as a proxy (e.g. to avoid sending the user's IP directly to public APIs), but not strictly required since these APIs generally support CORS
- **Encryption:** Web Crypto API (AES-GCM + PBKDF2)
- **Hosting:** fully static/serverless possible (no persistent backend required for the MVP), e.g. Vercel/Netlify

## 8. Non-Goals (MVP)

- No server-side storage of user data
- No multi-user/login system
- No CSV import (later stage)
- No broker/exchange API integration (later stage)
- No cryptocurrencies other than Bitcoin
- No automatic derivation of UTXOs from the portfolio ledger (see 3.1) — on-chain data comes exclusively from the address watchlist

## 9. Roadmap (post-MVP)

- CSV upload with a mapping assistant for various exchange export formats
- Direct read-only API integration with brokers/exchanges (a server proxy may be needed due to CORS/API keys — results still end up exclusively in the local file, no server-side storage)
- Multi-asset support (ETH, more coins)
- PDF export for tax documents
- Automatic import of the address watchlist via xpub scan (auto-detect all derived addresses)

## 10. Technical Notes for Implementation

- Check browser support for the File System Access API at runtime (feature detection), implement a clean fallback.
- Implement the FIFO calculation as a pure, isolated function with unit tests.
- Numeric **input fields** use the shared `components/NumberInput.tsx`: it shows the value with the locale's decimal separator (de: "0,50000000") while handing the parent a canonical decimal string ("0.5"), which is what the ledger stores and every calculation expects. Typing is never reformatted mid-entry (only on blur), and unparseable text is passed through so validation can flag it instead of it silently becoming 0. `parseNumberInput()` accepts either separator (the last "." or "," is the decimal point, earlier ones are grouping), so pasted values work in both languages.
- Formatting for display goes exclusively through the shared helpers, never through a bare `toLocaleString`/`toFixed` (which would pick up the browser's locale or ignore grouping): `formatBtc` (always 8 decimals, zero-padded), `formatFiat` (with currency symbol), `formatFiatPlain` (no symbol — for columns whose header already names the currency), `formatInt` in `lib/decimal.ts`, and `formatDate`/`formatTime`/`formatDateTime` in `lib/i18n/`. The active app locale (`intlLocale(locale)` → `de-DE`/`en-US`) drives decimal and thousands separators as well as date order. Input fields keep raw machine-readable values — only rendered output is formatted.
- The displayed BTC holding always comes from the ledger (`portfolio.totalBalance()`: buys + transfer_ins − sells − transfer_outs − spends, BTC fees per §3.2), never from the FIFO engine. FIFO can only account for disposals it finds lots for, so with an incomplete history (e.g. a CSV export starting mid-history) its open-lot sum (`FifoResult.openLotsBtc`) exceeds the real balance — that gap is reported on the dashboard instead of changing the balance.
- Version the data model (`version` field) to enable future migrations.
- Use decimal arithmetic for BTC amounts (e.g. `decimal.js`), no native `number` for money/crypto amounts.
- Autosave mechanism (e.g. debounce after every change) for File System Access API mode; explicit save button for fallback mode.
- Implement the address watchlist strictly separated from the portfolio ledger (see 3.1) — no implicit links, only optional, purely informative references.
