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
  "originalCurrency": "optional: currency/asset the transaction was actually settled in, e.g. \"USDT\"",
  "originalAmount": "optional: decimal string — amount paid/received in that currency",
  "originalPricePerBtc": "optional: decimal string — price per BTC in that currency",
  "eurValuationSource": "optional: manual | binance-klines — where the EUR value comes from",
  "note": "string"
}
```

Note: process amounts as strings/with a decimal library, not as JS `number` (avoid rounding errors with crypto amounts). For buy/sell/spend, at least one of `pricePerBtcEur` or `totalFiatEur` must be set — the missing field is derived from the other (`totalFiatEur = pricePerBtcEur × amountBtc` or vice versa).

Transfer legs created by the transfer dialog carry the moved lots' quantity-weighted average cost in `pricePerBtcEur` and the value of the transferred amount in `totalFiatEur`, so the transaction table shows a price and a value for transfers too. That is display data: the FIFO engine keeps deriving cost basis and acquisition dates from the moved lots (an internal transfer_in never reads the price), and a linked existing transaction keeps a price it already has.

Linking an existing transaction as the out-leg (transfer dialog): the candidate matches when its `amountBtc` **plus** the network fee entered in the dialog equals the sum of the selected lots. Its amount is never rewritten — only `feeBtc` and the lot allocations are written back. Picking a candidate adopts its own `feeBtc` into the dialog when no fee was entered yet.

**Settled in another currency** (`originalCurrency`, `originalAmount`, `originalPricePerBtc`): a transaction may have been settled in something other than EUR (e.g. a BTC buy against USDT on Bitget). Those three optional fields record it **for documentation only**. EUR stays the one binding valuation currency: FIFO, holding periods, P&L and the dashboard read `totalFiatEur`/`pricePerBtcEur` exclusively and never these fields — there is no per-field currency choice anywhere in the app. All four fields are optional, so files written before they existed stay valid without migration.

**EUR valuation of such transactions** (`eurValuationSource`, `lib/valuation.ts`): when a buy/sell/spend has a timestamp and an amount but no EUR figure, the EUR value can be derived from the Binance BTC/EUR daily close of that day (`fetchDailyClose` in `lib/binance.ts`): `totalFiatEur = amountBtc × close`, and `eurValuationSource` is set to `"binance-klines"` so an estimated value stays distinguishable from a documented one (absent means `"manual"`). Every derived value remains freely editable, and editing it puts the source back to `"manual"`. The lookup never runs in the background or over the whole ledger at once — only on an explicit click in the transaction dialog or as one bulk action in the CSV import preview (rate limits, and every request tells a third party which days one is interested in). One request per distinct day serves all rows on it (`createEurValuator`). A day Binance has no candle for keeps asking for a manual value. The transaction table shows the original currency in an opt-in column and marks a derived EUR value with "≈".

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
      "feeBtcModeIn": "optional: deducted | notDeducted (buys)",
      "feeBtcModeOut": "optional: deducted | notDeducted (sells, spends, transfers out)",
      "feeFiatMode": "optional: gross | net",
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

**Date and time:** two separate mapping fields, both mandatory, each with its own format select. An export with separate columns ("Datum" + "Uhrzeit") maps one to each; an export with a single date-time column has that column selected in *both* fields and its time read out of the value (`timeFormat: "datetime"`). The time field is optional. Both cells are normalized for the preview with their column's format: the date to "YYYY-MM-DD" (`normalizeDateCell`) and the time to "HH:MM:SS" (`normalizeTimeCell`), so whatever shape the file uses — a unix timestamp, "07/24/2026", an ISO value with a zone offset like `2024-07-05T14:01:34+02:00` — shows up as a readable date and clock time, and a column holding a whole timestamp fills both fields with its two halves. A value that cannot be read is kept verbatim and flagged. The two are combined only when the row is validated and imported (`parseImportDateTime`): pointing both fields at the same column parses that value once, separate columns put the time cell's clock time on the date cell's calendar day (local time, as a single cell "01.02.2024 10:30" has always been read). A time that cannot be read is reported per row as `invalidTime`. A value with an explicit zone ("…T23:30:00Z", "…+02:00") names an instant, so day *and* clock time are both read in local terms; otherwise the two halves could come from different days and move the transaction. A date without any time means local midnight of that day. The mapping proposal checks the data, not just the header, so "Time in force" never becomes the time column; with no time column at all it falls back to the date column, which is also what a date-only export needs (its rows then import at midnight). A row whose time cell is empty is reported as `invalidTime` rather than silently becoming 00:00.

**Original currency in the import:** `originalCurrency`, `originalAmount` and `originalPricePerBtc` are mappable target fields like any other (the currency code is stored upper case, and a pair like "BTC/USDT" keeps its quote side). If no EUR column was mapped but date and amount are there, the preview offers to derive the missing EUR values for all affected rows in one action with a progress indicator; those rows are marked "€?" before and "≈" after.

**Values on import:** an amount is stored as a magnitude, because the direction comes from the transaction type — a leading minus, as Bitvavo writes it for withdrawals, is dropped. BTC amounts and BTC fees are rounded to 8 decimals (`btcString`), the satoshi being the smallest unit the ledger stores; a value that already fits into 8 decimals is never touched. An amount that differs from the file's because of the BTC fee mode is spelled out in the preview (`btcAmountAdjustment`), so it cannot be mistaken for a rounding artifact.

**Fee modes:** exports disagree on whether a fee is already part of the amount it belongs to, so the wizard asks — right at the mapped fee column, and only when that column is mapped:

- **BTC fee** (`feeBtcModeIn` / `feeBtcModeOut`, at the `feeBtc` mapping): "already deducted from the BTC amount?", asked **once per direction** — `deducted` = the amount is what was really received/sent, `notDeducted` (default) = the fee is still inside it. Two questions, because one file commonly uses both conventions: a Bitget spot buy reports the amount net of the trading fee while its withdrawals report the total that left the account. Forcing one answer on both directions leaves the other wrong by exactly its fee sum, which is what a balance that will not reach zero looks like.
- **EUR fee** (`feeFiatMode`, at the `feeFiatEur` mapping): "already part of the EUR amount?" `gross` = the amount is the money that actually moved, fee included, `net` (default) = the fee comes on top.

Both are converted to the ledger convention of §3.2, where a fee always sits *next to* the amount it belongs to: `feeBtc` on top of `amountBtc` (a buy credits amount − fee, an outgoing type debits amount + fee) and `feeFiatEur` outside `totalFiatEur` (the FIFO engine adds it to a buy's acquisition cost and takes it off a sale's proceeds). So each mode corrects exactly one direction: `notDeducted` turns an outgoing BTC amount into `amount − fee`, `deducted` turns a bought amount into `amount + fee`; `gross` turns a buy total into `total − fee` and a sale total into `total + fee`, `net` needs nothing. Either way the money and the coins that actually moved stay what the file says. A `transfer_in` is never touched (its credit ignores the fee, which belongs to the out-leg), and a fiat fee never changes a BTC amount, nor a BTC fee an EUR total.

**Consistent EUR figures:** because a fee mode moves the total or the amount, `pricePerBtcEur` is always re-derived so price, total and amount tell the same story (`reconcileEurFigures`): with a total the price follows from `total ÷ amountBtc` — a price column in the file may still refer to the unadjusted figures — otherwise the total follows from `price × amountBtc`. The preview therefore shows both, plus a read-only column with what the ledger will actually book (`effectiveEurTotal`: acquisition cost `total + fee` on a buy, proceeds `total − fee` on a sale/spend) and the rate that follows from it, so the chosen interpretation stays checkable per row.

All fee modes are part of the import presets (system and user), so the next import from the same provider comes pre-filled; a user preset written before the BTC question was split still applies its single answer to both directions.

**Row filter:** the wizard's second step restricts the import to certain lines — any number of conditions "column is (not) one of \<values\>", joined by one AND/OR combinator. Columns and values are offered from the loaded file (values with occurrence counts), so a filter always fits the file at hand; e.g. a 21bitcoin export where only `transaction_type = trade` should be imported. A rule without selected values, or one naming a column the file does not have, is ignored rather than dropping every row. Filtered-out lines never reach the mapping/type-value/preview steps, and surviving rows keep their original CSV line number.

In the wizard's first step, the user picks a preset (system presets first, marked as predefined, then their own) or "manual/no preset"; picking one pre-fills every later step, which the user can still adjust before importing. After a manual or adjusted run, the user can save the resulting configuration as a new user preset.

### 3.5 Interface Settings (`uiSettings`)

How the user arranged the interface travels with the portfolio file, not with the browser — the same file opened on another device shows the same dashboard and the same table columns.

```json
{
  "uiSettings": {
    "dashboardLayout": [
      { "i": "portfolioValue-1", "widgetId": "portfolioValue", "x": 0, "y": 0, "w": 4, "h": 4 }
    ],
    "transactionColumns": ["date", "type", "walletAccount", "amount", "price", "value"]
  }
}
```

- `dashboardLayout`: position, size and choice of the dashboard widgets (§4.1). `i` is the instance id and the grid item key, `widgetId` the registry entry to render, `x`/`y`/`w`/`h` grid units.
- `transactionColumns`: the visible transaction-table columns, in display order.

`uiSettings` and each of its fields are **optional**: a file written before they existed stays valid and falls back to the default layout and the default column set. Entries naming a widget or column this build does not have are dropped on load, so removing a widget in an app update cannot break an existing file. An empty `dashboardLayout` is not the same as a missing one — a dashboard the user deliberately emptied stays empty.

**When it is written:** once per editing session, never per interaction. The dashboard keeps its working copy in component state while edit mode is on and commits it when the user leaves edit mode or navigates away; the column picker commits when it closes. So a drag across the grid costs one save at the end instead of one per frame, and an encrypted file is re-encrypted once instead of continuously. A session that changed nothing writes nothing: the commit is compared against the arrangement the session started from, so merely opening the dashboard of an older file never writes the default back or marks the file dirty.

**Migration:** both values used to be device preferences in `localStorage` (`depotwatch.dashboard.v1`, `depotwatch.txColumns.v6`). Those keys are still *read* as a fallback when the open file carries no setting of its own (`lib/legacyUiPrefs.ts`), so nothing is lost when an older file is opened. They are never written back and never deleted: the file always wins, and adopting a device value must not silently mark the file as changed.

## 4. MVP Features

- **Wallet/account management:** create, rename, delete (hierarchy wallet → account).
- **Transaction entry (manual):** buy, sell, transfer (wallet-to-wallet/account-to-account), spend (payment with BTC).
- **Dashboard:** a freely configurable widget dashboard (see §4.1).
- **Transaction table:** sortable, filterable by wallet, account, type, date range, and by data-quality issue (see §4.1, "Data quality").
- **Value history chart:** portfolio performance over time, optional comparison against the BTC price (historical data via Binance Klines API).
- **Tax module (Germany):** *(stage 2 — implemented but hidden behind the `TAX_FEATURES_ENABLED` flag in `lib/features.ts`; the FIFO engine keeps running, only the tax-specific UI is removed)*
  - FIFO lot assignment on sell/spend.
  - Marking tax-free (holding period > 1 year) vs. taxable.
  - Display of remaining time until tax-free status per open lot.
- **File handling:** open/save incl. password prompt and encryption (see section 2).

### 4.1 Widget Dashboard

The dashboard is a grid the user arranges themselves (`react-grid-layout` v2, loaded via `next/dynamic` with `ssr: false` — it measures the DOM, so there is nothing for the static export to prerender).

**Grid:** 12 columns, drag and resize enabled only in an explicit *edit mode* (`components/DashboardGrid.tsx`), so nothing moves by accident in normal use. Dragging starts from the widget header only (`WIDGET_DRAG_HANDLE`), which leaves the controls inside a widget clickable. Below 768 px the dashboard drops to a single column (`components/Dashboard.tsx` → `WidgetStack`) and edit mode is unavailable; a widget keeps its configured grid height there, so a chart stays a chart.

**Free cells:** react-grid-layout knows nothing about empty space, so `freeRects()` in `lib/dashboardLayout.ts` derives it from the layout — occupied cells are marked, then each free cell grows right and down as far as it stays free, which merges a wide gap into one "+" button instead of twelve. Three spare rows are always offered below the last widget. Clicking a placeholder opens the widget picker and inserts the chosen widget at that cell in its default size.

**Registry (`components/widgets/registry.ts`):** every widget is one entry — id, title/description keys, preview icon, default size, min/max size, data sources, component. Nothing in the dashboard, the grid, or the picker knows a widget by name, so a new widget is added by a single registry entry and nothing else. Min/max sizes are enforced by the grid, so a tile can never be resized into illegibility. Widget components take no props; they read the shared, once-computed portfolio figures (ledger, FIFO result, balances, live price, display-currency formatting, transaction-table navigation) from `useDashboardData()` (`components/widgets/context.tsx`).

**Widgets:** portfolio value with 24h/7d/30d change, profit/loss, BTC price, holding-period timeline, sats stack with milestones, average cost basis vs. price, custody split (exchange share as a warning metric), price chart with own entries and exits, network fees, halving countdown, data quality, DCA overview, plus the value chart, the wallet/account breakdown and the holding composition. Portfolio-level warnings (negative holding, unusable amounts, uncovered disposals) are *not* widgets: they belong to the whole ledger and are always shown above the grid.

**Unrealized P/L and the cost basis:** `openCostBasisEur` only covers open lots that have a known cost per BTC, so a market value compared against it must be taken over `FifoResult.openBasisBtc` — never over `portfolio.totalBalance()`. Coins whose acquisition price is unknown (an external `transfer_in` without a price, a buy with no EUR figure) are part of the holding but contribute no cost, so valuing the whole holding against a partial basis books their full market value as profit and can report a gain while the price sits below the average cost. The P/L widget therefore values `openBasisBtc` and names the BTC it left out; the same rule applies to any future figure that subtracts a cost basis from a market value.

**Data quality** (`lib/dataQuality.ts`): unlinked transfer legs, transfer legs without a txid, and buy/sell/spend without any EUR figure. One predicate per issue, shared by the widget and the transaction table's issue filter, so the count and the filtered list can never disagree.

**External data** (`lib/marketData.ts`): one module-level cache with per-key TTL, shared in-flight requests and a short error memo, so a re-render never becomes a request and an unreachable source never becomes a request storm. Prices come from Binance, on-chain figures exclusively from the explorer configured in `explorerSettings` (§3.3) — never a hard-wired third party. Widgets load independently, show a skeleton while loading, and catch their own errors: a per-widget `WidgetBoundary` plus a per-widget error state means one broken or unreachable tile never takes down the dashboard.

**Layout persistence:** position, size and choice of widgets live in the portfolio file (`uiSettings.dashboardLayout`, §3.5) and are written once per editing session, not per drag. "Reset layout" restores `defaultDashboard()` in the working copy, which is then committed like any other change. The shipped default layout has to be a fixed point of react-grid-layout's vertical compaction — otherwise the grid would "change" it on mount and merely opening the dashboard would dirty the file; a test asserts this.

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
- **Charts:** Recharts
- **Dashboard grid:** react-grid-layout v2 (see §4.1)
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
