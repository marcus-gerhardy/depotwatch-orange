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
  "pricePerBtcEur": "decimal | null (price per BTC; null for transfers)",
  "totalFiatEur": "decimal | null (EUR total actually paid/received for the transaction; null for transfers)",
  "feeBtc": "decimal | null (optional — many brokers only report fees in EUR)",
  "feeFiatEur": "decimal | null (optional)",
  "counterpartyAccountId": "transfer_in/transfer_out only: reference to the destination/source account",
  "lotAllocations": "sell/spend only: array of { lotTransactionId, amountBtc } — references the buy/transfer_in transaction(s) (lots) this amount came from",
  "note": "string"
}
```

Note: process amounts as strings/with a decimal library, not as JS `number` (avoid rounding errors with crypto amounts). For buy/sell/spend, at least one of `pricePerBtcEur` or `totalFiatEur` must be set — the missing field is derived from the other (`totalFiatEur = pricePerBtcEur × amountBtc` or vice versa).

**Lot concept:** A "lot" is not a separate entity but any buy/transfer_in transaction with a remaining balance (amount − amount already sold via `lotAllocations`). The assignment of a sale to one or more lots is computed at the time of the sale (automatically via FIFO or chosen manually) and stored permanently in `lotAllocations` — it is never retroactively recomputed when new transactions are added later.

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

## 4. MVP Features

- **Wallet/account management:** create, rename, delete (hierarchy wallet → account).
- **Transaction entry (manual):** buy, sell, transfer (wallet-to-wallet/account-to-account), spend (payment with BTC).
- **Dashboard:**
  - Total portfolio value, current price via Binance public API, switchable EUR/USD.
  - Profit/loss (realized + unrealized), average cost basis (FIFO).
  - Breakdown by wallet/account.
- **Transaction table:** sortable, filterable by wallet, account, type, date range.
- **Value history chart:** portfolio performance over time, optional comparison against the BTC price (historical data via Binance Klines API).
- **Tax module (Germany):**
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

- Language (German/English toggle, German as default)
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
- Version the data model (`version` field) to enable future migrations.
- Use decimal arithmetic for BTC amounts (e.g. `decimal.js`), no native `number` for money/crypto amounts.
- Autosave mechanism (e.g. debounce after every change) for File System Access API mode; explicit save button for fallback mode.
- Implement the address watchlist strictly separated from the portfolio ledger (see 3.1) — no implicit links, only optional, purely informative references.
