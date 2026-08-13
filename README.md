# DepotWatch Orange

A local-first Bitcoin portfolio tracker. Everything lives in **one
password-encrypted file on the user's device**; the server ships static code and
nothing else. No account, no database, no tracking.

[CLAUDE.md](./CLAUDE.md) is the full specification and the reasoning behind the
decisions (German). This file is the short version.

## What it does

**Ledger.** Wallet → account → transaction, with buys, sells, transfers and
spends. Decimal-exact throughout (`decimal.js`); BTC amounts are never JS
numbers. Fees sit *next to* the amount, one rule everywhere.

**Lots and tax (Germany).** A FIFO engine computes cost basis, holding periods
and gains — but the app **never assigns lots by itself**. Which purchases a sale
or transfer closes is the user's decision, stored permanently and never
recomputed, because a guessed assignment silently decides holding periods and
taxable gains and would decide them differently the next time anything earlier
changes. §23 EStG holding period and exemption limit are configurable; the tax
view exports CSV. Behind `TAX_FEATURES_ENABLED` in `lib/features.ts`.

**Transfers keep their history.** Moving coins between your own wallets is not a
disposal: the engine traces acquisition dates and cost across any number of
hops, and says "origin unresolved" rather than substituting an arrival date.

**CSV import.** A wizard with per-provider presets (shipped and user-defined),
column and value mapping, row filters, unit and fee-convention handling,
duplicate detection by file hash and by row, and an undo per import run.

**Dashboard.** ~25 widgets on a grid the user arranges; the layout travels in
the portfolio file. Live price and on-chain figures come from Binance and the
configured explorer, cached and de-duplicated; every tile fails on its own.

**Watchlist.** Watch-only addresses, strictly separate from the ledger, with
reuse/pubkey-exposure/poisoning checks, a privacy score, UTXO labels and dust
detection. A own Electrum/Esplora endpoint can replace the public explorer.

**Safety.** AES-256-GCM with a PBKDF2-derived key (600k iterations); a SHA-256
checksum in the file that is verified on open; auto-lock on inactivity that
actually drops the plaintext and the key; verified backups into a folder of the
user's choosing, with retention that can never leave you with nothing; and a
50-entry change log with per-action undo.

**Also.** Nine themes (two light), German and English, EUR/USD/BTC display,
milestones, a year in review with a privacy-first image export, and an in-app
help section of fifteen topics.

## Development

```bash
npm install
npm run dev              # http://localhost:3000
npm run test             # vitest, ~880 tests
npm run lint
npm run build            # static export to ./out
npm run help:build       # content/help/*.md → lib/help/content.ts
npm run help:screenshots # rebuild + Playwright shots of the demo portfolio
npm run icons:build      # assets/icon.svg → favicon, touch, manifest icons
```

Generated files are committed and have generators next to them:
`scripts/build-theme-css.py`, `scripts/build-demo-portfolio.py`,
`scripts/build-help.py`, `scripts/build-icons.mjs`. Run the matching script
after editing a source — `assets/icon.svg` is the only place the app mark is
drawn, everything else is rasterised from it.

Screenshots need a Chromium: either `npx playwright install chromium` once, or
point `CHROMIUM_PATH` at a system install.

## Deployment

Static export, deployable anywhere. See [docs/deployment.md](./docs/deployment.md)
for the Vercel setup and the response headers (`vercel.json`), including why
`connect-src` cannot be narrowed to the public explorers.

## Architecture notes

- `lib/types.ts` — the versioned file schema. Ledger and watchlist are separate
  layers by design; a transaction may reference an address only informatively.
- `lib/fifo.ts` / `lib/provenance.ts` — the same persisted links read forwards
  (disposals) and backwards (origins); a test asserts they agree.
- `lib/store.ts` — Zustand, immutable updates, debounced autosave, and the one
  place that writes files.
- `lib/crypto.ts`, `lib/integrity.ts` — envelope with versioned KDF parameters,
  and the checksum that makes a damaged file say so.
- No user data leaves the device. The only outbound requests are price lookups
  and, if the watchlist is used, address queries to the configured explorer —
  which the settings say out loud.
