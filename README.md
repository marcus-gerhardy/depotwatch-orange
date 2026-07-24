# DepotWatch Orange

Local-first Bitcoin portfolio tracker. All portfolio data lives in a single,
password-encrypted file on the user's device — the server only ships static
code. See [CLAUDE.md](./CLAUDE.md) for the full specification (German).

## Features (MVP)

- **Wallet → Account → Transaction** hierarchy with manual entry of buys,
  sells, transfers, and spends (decimal-exact via `decimal.js`)
- **Dashboard** with live BTC price (Binance API), EUR/USD toggle, unrealized
  and realized P/L, and a portfolio value chart (Binance klines)
- **German tax module**: pure FIFO engine (`lib/fifo.ts`, unit-tested) with
  taxable vs. tax-free classification (>1 year holding period, §23 EStG) and a
  per-lot countdown to tax freedom
- **Address watchlist** (watch-only, separate from the ledger): live balance /
  UTXO data via mempool.space, blockstream.info, or a custom Esplora endpoint,
  with security heuristics — address reuse, public-key exposure, legacy-format
  hints, dust/address-poisoning detection, privacy score, UTXO labels
  (coin control), dust-UTXO flagging, and consolidation suggestions
- **File handling**: File System Access API with autosave (Chrome/Edge/Opera)
  or upload/download fallback (Firefox/Safari); AES-256-GCM encryption with a
  PBKDF2-derived key (600k iterations, Web Crypto API)
- **i18n**: German (default) and English; dark Bitcoin theme; privacy mode
  that blurs all amounts

## Development

```bash
npm install
npm run dev     # dev server at http://localhost:3000
npm run test    # FIFO engine unit tests (vitest)
npm run lint
npm run build   # static export to ./out (no backend required)
```

The build is a fully static export (`output: "export"`), deployable to any
static host (Vercel, Netlify, nginx, …).

## Architecture notes

- `lib/types.ts` — versioned portfolio file schema (ledger + watchlist are
  strictly separate layers; a transaction may only reference a watchlist entry
  informatively)
- `lib/fifo.ts` — pure FIFO cost-basis engine; internal transfers never reset
  acquisition dates, fees in BTC are consumed from the oldest lots
- `lib/crypto.ts` — encrypted-file envelope (versioned KDF parameters)
- `lib/store.ts` — Zustand store, immutable updates, debounced autosave
- No user data ever leaves the device except explorer/price API lookups; the
  settings UI warns that public explorer APIs see watched addresses.
