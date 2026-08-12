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
  "lotAllocations": "sell/spend/transfer_out: array of { lotTransactionId, amountBtc } — references the buy/transfer_in transaction(s) (lots) this amount came from; for a transfer_out these are the source-account lots the transfer closes, and their sum must equal amountBtc + feeBtc, i.e. what actually left the account (see the fee convention below)",
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

Transfer legs created by the transfer dialog carry the value of what they move in `totalFiatEur` and the rate that follows from it in `pricePerBtcEur`, so the transaction table shows a price and a value for transfers too. That is display data: the FIFO engine keeps deriving cost basis and acquisition dates from the moved lots (an internal transfer_in never reads the price), and a linked existing transaction keeps a price it already has.

**A transfer's rate and value are computed from its origins** (`provenanceValue()`/`derivedTransferValues()` in `lib/provenance.ts`), live wherever they are shown: the transaction table's Kurs and Wert columns (sorted by the computed figure like any other, and shown without any "≈": a complete value is the exact sum of the amounts of the buys behind it, not an estimate — only a value that covers just part of the amount is marked), the origin list's total row, and the transaction dialog, which shows both read-only for a transfer leg. A transfer is not a trade and has no price of its own — the coins it moves do. The live trace **wins over figures a leg stored earlier**, because lot assignments are editable and a stored value goes stale the moment they change; what a leg recorded is the fallback for a chain that no longer resolves (an unlinked leg, an import). Nothing is ever written to the file by the display.

**The value is built from what the origin transactions recorded, not from their cost basis** (`recordedShareValue()`): a lot's own "Betrag (EUR)" (or price × amount), split in proportion to the share taken from what it credited to the account. It is valued over the share that was **consumed**, not the share that arrived — a transfer_out closes `amountBtc + feeBtc` worth of lots while only `amountBtc` reaches the other side, and the euros of the coins burned as a network fee were paid for those same buys. So a transfer that moves whole buys is worth exactly the sum of their amounts, at every hop of a chain (`valueScale` in the resolver multiplies across hops); the BTC shares stay net, so they keep adding up to the transaction's own amount. The rate is that value over the amount, which is therefore slightly above the buys' own rate whenever a fee was paid — value and rate never contradict each other. Using the tax cost basis instead — which adds `feeFiatEur` and divides by the net BTC (`buyLotBasis`) — leaves a transfer's value differing from the amounts its buys show in the same table, which is exactly the comparison a user makes. The two figures stay separate on purpose: `OriginLot.costEur` is the cost basis for tax, `OriginLot.valueEur` is the recorded value for display, and the origin table shows the cost basis per lot ("Einstand / BTC") while its total row shows the value — never an average of one under the header of the other. Origins with no EUR figure at all are left out of both sums instead of being valued at the others' average; `complete` says whether the whole amount is covered, and a partial value is marked as such. The transfer dialog writes the same figure onto the legs it creates, so stored and computed agree from the start.

Linking an existing transaction as the out-leg (transfer dialog): the candidate matches when its `amountBtc` **plus** the network fee entered in the dialog equals the sum of the selected lots. Its amount is never rewritten — only `feeBtc` and the lot allocations are written back. Picking a candidate adopts its own `feeBtc` into the dialog when no fee was entered yet.

**Settled in another currency** (`originalCurrency`, `originalAmount`, `originalPricePerBtc`): a transaction may have been settled in something other than EUR (e.g. a BTC buy against USDT on Bitget). Those three optional fields record it **for documentation only**. EUR stays the one binding valuation currency: FIFO, holding periods, P&L and the dashboard read `totalFiatEur`/`pricePerBtcEur` exclusively and never these fields — there is no per-field currency choice anywhere in the app. All four fields are optional, so files written before they existed stay valid without migration.

**EUR valuation of such transactions** (`eurValuationSource`, `lib/valuation.ts`): when a buy/sell/spend has a timestamp and an amount but no EUR figure, the EUR value can be derived from the Binance BTC/EUR daily close of that day (`fetchDailyClose` in `lib/binance.ts`): `totalFiatEur = amountBtc × close`, and `eurValuationSource` is set to `"binance-klines"` so an estimated value stays distinguishable from a documented one (absent means `"manual"`). Every derived value remains freely editable, and editing it puts the source back to `"manual"`. The lookup never runs in the background or over the whole ledger at once — only on an explicit click in the transaction dialog or as one bulk action in the CSV import preview (rate limits, and every request tells a third party which days one is interested in). One request per distinct day serves all rows on it (`createEurValuator`). A day Binance has no candle for keeps asking for a manual value. The transaction table shows the original currency in an opt-in column and marks a derived EUR value with "≈".

**On-chain data belongs to the transfer, not to one leg** (`groupOnChain()`/`effectiveOnChain()` in `lib/transferLink.ts`): both legs describe the same send, and in practice only one side has the data — a hardware wallet exports txid and address, an exchange export usually neither. So a leg without them takes them from its group: the `txid` always (one transaction, one id), the `address` only when the group pairs exactly one out-leg with exactly one in-leg, because a batched send pays several outputs and "the" address of the sending leg would be a guess. Everything reads it that way: the table's columns (the inherited value is muted and says where it came from), the data-quality issue `missingTxid` — and with it the dashboard widget that counts it — and the transaction dialog, which offers the counterpart's value for an empty field instead of filling it in silently. Linking two legs (`linkTransferLegs`, and the transfer dialog when it links or creates a counterpart) writes the values over, so a pairing made now needs no inheriting later.

On-chain fields (`txid`, `address`): both optional and only meaningful for `transfer_in`/`transfer_out` — the form never offers them for buy/sell/spend, and the CSV import drops them for those types. `txid` is stored normalized (trimmed, lower case) and must be exactly 64 hex characters; `address` must be a syntactically valid Bitcoin address (legacy P2PKH/P2SH, bech32 SegWit v0, bech32m Taproot — checksum verified for bech32/bech32m, case rules per BIP-173), stored trimmed with an all-uppercase bech32 address folded to lower case. Because one on-chain transaction can pay several outputs, the address pins down which output this leg means. Both are **matching aids only** (pairing an out-leg with its in-leg): the security/privacy and UTXO features must keep operating exclusively on the address watchlist (§3.1/§3.3) — never derive watchlist data from the ledger or vice versa. Explorer links for these values are rendered as plain anchors the user clicks; the table must never fetch anything while rendering (a txid/address must not reach a third party unasked).

Fee convention (`feeBtc`): `amountBtc` is always what reaches the other side — the coins received on a buy/transfer_in, the coins sold, spent or sent on the outgoing types. A BTC fee is **on top of** that: a buy credits `amountBtc − feeBtc`, and sell/spend/transfer_out (internal *and* external) debit `amountBtc + feeBtc`. For a transfer_out that sum is exactly what its `lotAllocations` add up to, and the in-leg of an internal transfer records the out-leg's `amountBtc` unchanged — so a transfer pair costs the portfolio precisely the network fee. `balanceDelta()` in `lib/portfolio.ts` is the single implementation of this rule; the FIFO engine consumes lots the same way, and a test asserts both stay equal. Files written before this was unified (out-leg amount incl. fee, allocations summing to it, in-leg net) are converted on load by `migrateTransferFeeConvention()` in `lib/store.ts`.

**Deleting a transaction** releases what pointed at it (`lib/deletion.ts`, used by both delete actions in the store): `lotAllocations` entries referencing a deleted transaction are dropped — an amount no lot could ever cover — which leaves that disposal unassigned until the user assigns it again (nothing re-assigns it automatically, see the lot concept); and a transfer leg whose counterpart is gone loses `transferGroupId`/`counterpartyAccountId`, i.e. it becomes a plain external send/receive, so its coins stay accounted for in both the balance and the FIFO engine. A group with several in-legs stays intact as long as one out-leg and one in-leg remain. The confirm dialog names how many transactions this affects.

**Lot concept:** A "lot" is not a separate entity but any buy/transfer_in transaction with a remaining balance (amount − amount already sold via `lotAllocations`). The assignment of a disposal to one or more lots is stored permanently in `lotAllocations` and is never retroactively recomputed when other transactions are added or edited later.

**The assignment is always the user's, never the app's.** Nothing anywhere picks lots by itself — not when a transaction is created, not when one is deleted, and above all not while calculating. A guessed assignment decides holding periods, cost basis and taxable gains silently, and silently decides them differently as soon as anything earlier in the ledger changes; two runs of the same file would then disagree about what was sold. So:

- a new sell, spend or outgoing transfer is created **without** allocations (the dialog offers the picker right there, so it can be answered immediately, but nothing is filled in for the user), except for a sale started from a specific lot row, which is a choice the user already made;
- the FIFO engine consumes **only** what the allocations say (`consumeAllocated`); there is no dynamic FIFO fallback and no `allocateFifo` helper any more. A disposal without an assignment closes no lots, has no cost basis and reports its full amount as `uncoveredBtc`;
- deleting a lot drops the allocations pointing at it and leaves the disposal unassigned, rather than substituting another lot;
- what is unassigned is *visible*: `incompleteAllocation` (§4.1) covers sell, spend and transfer_out, the transaction table badges those rows and unfolds them into their (missing) origins, and the dashboard reports the resulting gap between the ledger balance and the engine's open lots.

A consequence to keep in mind: while disposals are unassigned, `FifoResult.openLotsBtc` exceeds the ledger balance by exactly the unassigned amount. That gap is the honest state of the file, not a bug — it disappears as the assignments are made.

**Lot continuity across internal transfers:** Moving coins between own wallets/accounts must not reset the tax lot history. An internal transfer_out carries `lotAllocations` (assigned by the user, possibly several lots batched into one on-chain transaction) and shares a `transferGroupId` with its transfer_in leg(s). A transfer_in does NOT start a new lot at the transfer date — its `date` is only the arrival time for display purposes. The FIFO/tax engine resolves lot identity (original acquisition date + cost basis) at runtime by following transferGroupId → transfer_out → lotAllocations back to the original buy, across any number of transfer hops. Holding-period and cost-basis calculations for later disposals always use the traced original lot.

**Origin resolution** (`lib/provenance.ts`): the same links read backwards, for one transaction at a time. `resolveProvenance(entry, index)` answers "which original buys is this made of", returning per origin the acquisition date, the proportional share, the original cost per BTC, the origin wallet/account and the lot transaction's id. A transfer_in resolves through its group's out-leg, every other type through its own `lotAllocations`; a buy or an external receive is an origin and resolves to itself. Shares are split **proportionally** at every hop, so they always add up to exactly the amount asked for: a transfer_out's allocations cover its amount *plus* the network fee (see the fee convention), so an arrival's origins each carry their proportional part of that fee, and an arrival that is later only partly moved on passes its origins down in the same proportion. Multiple hops (A → B → C) simply recurse. Corrupt data cannot hang the walk: ids on the current path are tracked (a repeat is a circular link) and the depth is capped, with the untraceable amount reported as `unresolvedBtc` and `truncated` set.

The FIFO engine and the resolver derive lot identity from the same persisted data and must agree — a test asserts they produce the same dates, amounts and costs for a bundled arrival, and `buyLotBasis()` in `lib/fifo.ts` is the single implementation of a buy's cost per BTC that both read.

**Both links are editable after the fact** (`lib/transferLink.ts`, pure functions over the ledger/portfolio), because an import rarely gets them right the first time:

- *Which lots an out-leg closes* (`lotAllocations`) is edited in the transaction's own dialog: entries can be changed, removed, and added from the source account's open lots. Availability per lot counts every **other** transaction's allocations and deliberately excludes the edited transaction's own claim, so editing a value never competes with itself (`lotAvailability`). The target sum is `allocationTargetBtc()` = `amountBtc + feeBtc`; a deviation is shown in BTC and never blocks saving, since a half-assigned import is a legitimate intermediate state. Because these are a field of one transaction, they are written by the dialog's save like every other field.
- *Which out-leg an arrival belongs to* (`transferGroupId`) is edited on the in-leg: the linked leg is shown with wallet/account, date, amount and txid and can be released, or one can be picked from the unpaired out-legs of other accounts, filterable by wallet, account and period and ranked by `rankOutLegCandidates()` — an identical txid is proof and sorts first, then closeness in amount (weighted heavily) and date. This link lives on *two* transactions at once, so it is applied to the portfolio immediately rather than on the dialog's save; releasing it always clears both sides, and a group with several in-legs survives losing one of them. The outgoing leg's own dialog *shows* the arrivals it is paired with (read-only, with a jump), so "did this send ever arrive anywhere" is answerable from either side.

**Linked means paired, never "has a `transferGroupId`"** (`pairedGroupIds()`/`isLegPaired()`): a leg can carry an id whose counterpart never existed or is gone — an interrupted assignment, an import, an older file. Such a leg is exactly as unlinked as one without an id, so it is offered as a candidate and counted as a data-quality gap (§4.1); asking the field instead hid it from the arrival's picker *and* from the issue count, leaving a transfer that could not be repaired from either side. `linkTransferLegs()` accordingly mints a fresh group for it. A candidate that *is* paired is offered only on request (`includePaired`), marked with its existing arrival: one send can legitimately arrive in several pieces, so linking then **joins** that group instead of minting a new id (which would orphan the arrival already there), and the out-leg's amount is never rewritten as a fee in that case.

**A link applied while the dialog is open must survive its save.** The dialog's fields are state captured when it opened, but the transfer link is not a field: it is written to the portfolio immediately and can change (or be released) while the dialog is open. So `transferGroupId` and the counterparty account are taken from the *live* entry on save, never from the snapshot the dialog started with — otherwise saving silently undid the assignment that was just made. For the same reason the counterparty select of a paired leg shows the linked account and is disabled (changing it there would desync the two sides), and on an unpaired leg it follows the live entry unless the user picks something else. Moving a leg to another account is still allowed: `updateTransaction()` retargets the counterpart's `counterpartyAccountId` the way the bulk move does, so the pair never points at the account a leg has left.

**The amount difference when linking** is the network fee in the normal case. It is shown, and `adoptFeeBtc` writes it to the out-leg — which also sets the out-leg's amount to what arrived, because the ledger's fee sits *next to* the amount rather than inside it (§3.2); recording it without shrinking the amount would debit the source account twice. `amountBtc + feeBtc` is unchanged by that, so existing allocations stay valid. A difference above 1 % of the amount (`FEE_PLAUSIBILITY_LIMIT`), or a negative one, is not a fee but a wrong match and is called out as such.

Both dialogs preview the resulting origin list before saving, computed by running the real resolver over a ledger that already has the change — no second implementation to keep in sync.

**Picking what to assign** happens in a table, not a list, because a real portfolio has neither few lots nor few candidates (`components/LotPicker.tsx` for lots, the candidate table in `components/OutLegLink.tsx` for out-legs): **newest first** by default — what one looks for right after an import — sortable by every column, narrowable by free text and period, and for lots **multi-select**, so a transfer batching six purchases costs one dialog instead of six. What each selected lot would contribute is computed and shown before confirming: while the transaction is still short of BTC the selection is filled up in the table's current order and capped per lot (the sort order doubles as the priority), and unchecking that offers every picked lot in full. The resulting amounts stay editable in the assignment table afterwards.

`lotAllocations` are nevertheless **stored oldest lot first**, whatever order the table is sorted or the user clicked in: the FIFO engine takes the network fee off the last allocation, so the stored order decides which lot pays it and must not follow a display preference.

**Where the trace dead-ends** the app says so instead of substituting the arrival date: an internal transfer_in whose origin does not resolve is reported as "origin unresolved" (`hasUnresolvedOrigin`), counted as a data-quality issue (§4.1), badged in the transaction table, and offered the assignment dialog. In the FIFO engine the same situation — an arrival that received more than its out-leg moved — marks the surplus lot `originUnresolved`, which propagates into `DisposalPart.originUnresolved` and `Disposal.unresolvedOriginBtc`. Every tax surface renders that as "origin unresolved" rather than a holding period (§4).

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

**Duplicate detection** (`lib/importDuplicates.ts`, `lib/importBatches.ts`): an export imported twice doubles the holding and falsifies every tax figure derived from it, and nothing looks broken afterwards — the numbers are simply wrong. Two halves guard against it.

*The file*: its raw bytes are hashed (SHA-256) when it is chosen and compared against the runs the portfolio already records. A match warns with the date and the transaction count of that run, and the step does not continue until the repeat is confirmed on purpose. The bytes, not the parsed rows: a re-export with one row appended is a different file. WebCrypto is unavailable outside a secure context, so a failed hash costs the warning and nothing else — the row-level detection still runs.

*The rows*: every row that would actually be written is checked against the target account **and** against the earlier rows of the same file, in this order of evidence — a shared `txid` in the same account and of the same type; identical account, type, timestamp, amount and EUR figure; the same values with timestamps inside a tolerance (`settings.importDuplicateToleranceMinutes`, default 2, configurable because exports disagree about time zones and rounding). The first two are proof and are labelled as such, the third is a suspicion and is worded as one. Rows are walked in file order and join the index as they go, so of two identical lines the *second* is flagged and the first stays importable.

**Nothing is ever rejected automatically.** Identical transactions can be perfectly real (a split order filled twice), so a duplicate is *marked*, defaulted to "do not import", and the user decides: the preview badges it, names the reason, links to the colliding transaction so the two can be compared, filters to "all / new only / duplicates only", and offers "skip all" and "import all anyway". That default is derived, not written into the rows, so a row re-included by hand survives the scan re-running.

The comparison keys are built **once** as maps (`buildDuplicateIndex`), so a portfolio of several thousand transactions costs one pass rather than one per imported row; a test asserts 1 000 rows against 5 000 existing transactions stay in the millisecond range.

**Every import is recorded** (`importBatches` on the file, `importBatchId` on each transaction it wrote, both optional so older files need no migration): when, which file, its hash, the preset, how many transactions, and where they landed. That is what recognises the file next time and what "undo this import" removes by. Undoing is deliberately not a single delete: a transaction an import wrote becomes an ordinary transaction the moment it exists, so `analyzeBatchRemoval()` reports what would break — a lot a later disposal allocates, a transfer leg whose counterpart stays, a disposal of the batch that closed lots which do not belong to it — and those stay while the rest goes. The list and the action live in the settings.

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

  The dialog (`components/TransactionForm.tsx`) is one always-visible block with what every transaction needs — type, date, account(s), amount, price, total — and below it one collapsible `Section` (`components/ui.tsx`) per topic: fees, assignment/origin (transfers only), on-chain data, settled-in-another-currency, note. A section is **closed by default but opens itself when it has content** and stays open while something in it needs attention (an unassigned amount, an unlinked arrival, an invalid txid — `forceOpen`, which the toggle cannot override for as long as it lasts). A closed header carries a summary of what is inside (the fee, the note, the linked source account, assigned/target BTC), so the dialog reads top to bottom without opening anything. Fields of a closed section keep their values — collapsing hides, it never clears. The field area scrolls and the save/cancel bar does not, so the actions of a long transfer are never a scroll away.
- **Dashboard:** a freely configurable widget dashboard (see §4.1).
- **Transaction table:** sortable, filterable by wallet, account, type, date range, and by data-quality issue (see §4.1, "Data quality"). Both transfer directions unfold (expander) into their origin lots (§3.2): original purchase date, proportional BTC share, original cost per BTC, origin wallet/account and holding-period status, each linking to the original buy, with a total row that flags any deviation from the arrival's own amount. The same list is a section of the transaction's detail/edit view. An arrival with no resolvable origin shows "origin not assigned" plus a button that opens the out-leg picker (§3.2); when that picker finds no candidate it offers the transfer dialog's assignment mode instead, which builds the missing out-leg from the source account's lots. An out-leg whose allocations do not cover what left the account shows the same kind of hint, leading into its own dialog, where the assignments are edited.
- **Value history chart:** portfolio performance over time, optional comparison against the BTC price (historical data via Binance Klines API).
- **Tax module (Germany):** on (`TAX_FEATURES_ENABLED` in `lib/features.ts`; flipping it to `false` removes every tax surface from the UI while the FIFO engine keeps running, because the persisted `lotAllocations` depend on it).
  - Lot assignment on sell/spend/transfer_out: made by the user and persisted, never derived by the app (see §3.2).
  - Marking tax-free (holding period > 1 year) vs. taxable.
  - Display of remaining time until tax-free status per open lot.
  - Holding period and cost basis always come from the **resolved original** lot (§3.2), never from the date coins arrived somewhere. A transfer leg is never a taxable event, regardless of the price it carries for display.
  - Positions whose origin does not resolve are reported as "origin unresolved" — in the tax view's open lots and disposals, in the transaction table's tax-status column, and as their own bucket in the holding-period widget. They are never valued against an arrival date.
- **File handling:** open/save incl. password prompt and encryption (see section 2).

### 4.1 Widget Dashboard

The dashboard is a grid the user arranges themselves (`react-grid-layout` v2, loaded via `next/dynamic` with `ssr: false` — it measures the DOM, so there is nothing for the static export to prerender).

**Grid:** 12 columns, drag and resize enabled only in an explicit *edit mode* (`components/DashboardGrid.tsx`), so nothing moves by accident in normal use. Dragging starts from the widget header only (`WIDGET_DRAG_HANDLE`), which leaves the controls inside a widget clickable. Below 768 px the dashboard drops to a single column (`components/Dashboard.tsx` → `WidgetStack`) and edit mode is unavailable; a widget keeps its configured grid height there, so a chart stays a chart.

**Free cells:** react-grid-layout knows nothing about empty space, so `freeRects()` in `lib/dashboardLayout.ts` derives it from the layout — occupied cells are marked, then each free cell grows right and down as far as it stays free, which merges a wide gap into one "+" button instead of twelve. Three spare rows are always offered below the last widget. Clicking a placeholder opens the widget picker and inserts the chosen widget at that cell in its default size.

**Registry (`components/widgets/registry.ts`):** every widget is one entry — id, title/description keys, preview icon, default size, min/max size, data sources, component. Nothing in the dashboard, the grid, or the picker knows a widget by name, so a new widget is added by a single registry entry and nothing else. Min/max sizes are enforced by the grid, so a tile can never be resized into illegibility. Widget components take no props; they read the shared, once-computed portfolio figures (ledger, FIFO result, balances, live price, display-currency formatting, transaction-table navigation) from `useDashboardData()` (`components/widgets/context.tsx`).

**Widgets:** portfolio value with 24h/7d/30d change, profit/loss, BTC price, holding-period timeline, sats stack with milestones, average cost basis vs. price, custody split (exchange share as a warning metric), price chart with own entries and exits, network fees, halving countdown, data quality, DCA overview, plus the value chart, the wallet/account breakdown and the holding composition. Also: what could be realised tax-free right now, this year's gains against the exemption limit, the BTC stack over time, a buy heatmap, the fee balance, a what-if price, time in the market with the deepest drawdown, a block clock, the watchlist's UTXO picture and its open security findings. Portfolio-level warnings (negative holding, unusable amounts, uncovered disposals) are *not* widgets: they belong to the whole ledger and are always shown above the grid.

The **BTC price widget shows both fiat prices**, one row per currency and the rows identical apart from their colour: the display currency in the accent, the fiat it does not already show muted below it (with the display unit set to BTC the first row is a sats figure, so EUR *and* USD follow). Both come from the spot request that runs anyway — the EUR/USD cross rate needs them — so naming the dollar price costs nothing.

It **also reads the price as "Moscow time"** (`moscowTime()` in `lib/displayUnit.ts`): the sats one dollar buys, written as a clock — 2 000 sats per dollar is "20:00", with the sats figure spelled out below it. It is **always the USD price**, whatever the file displays, because that is the convention the figure is quoted in everywhere; a per-user reference currency would produce a "moscow time" nobody else could compare theirs to. It is a second notation of the same spot price, not a conversion, so it is always shown (like the display unit of §6.3 and unlike the easter eggs of §5.1) and nothing stored or calculated ever reads it. Below $10 000 per BTC the figure stops being a clock ("100:00"), and below half a sat per dollar there is nothing left to show — both cases print "—" instead of an invented time.

**Derived figures live in `lib/dashboardStats.ts`, not in the widgets** (`taxFreeRealizable`, `realizedInYear`, `feeTotals`, `buyHeatmap`, `tradeMarkers`, `maxDrawdown`, `timeInMarket`, `whatIf`): pure functions over what the engine already produced, unit-tested in `lib/dashboardStats.test.ts`, Decimal throughout with rounding left to the formatters. Each of them has a way of being quietly wrong that no screenshot would reveal, and each is pinned by a test: a lot whose origin never resolved is **never** counted as tax-free (its acquisition date is an arrival, §3.2) but reported as its own figure; a BTC fee is valued at the close of **the day it was paid**, and a day with no candle is reported as unvalued rather than dropped; the drawdown is the *portfolio's*, not the price's, so buying on the way down lifts it again; the what-if values `openBasisBtc` and not the whole holding, for the same reason the P/L widget does.

**The exemption-limit tracker** reads `settings.taxExemptionLimitEur` (§6.3, default 1 000 €) instead of hard-wiring a figure — the legislator moves it (600 € until 2023), and a file written under one figure must keep showing that one. It says in words that this is a *Freigrenze* and not an allowance (one euro over and the whole gain is taxable, not just the excess), and carries the disclaimer that none of this is tax advice. Both tax widgets sit behind `TAX_FEATURES_ENABLED` in the registry: with the flag off they are not registered at all, so they can be neither placed nor picked.

**The two watchlist widgets share one scan** (`lib/watchlistScan.ts`): addresses are walked one at a time with a pause between them, every request goes through the module cache of §4.1 keyed per address, and the aggregation (`summarizeUtxos`, `summarizeSecurity`) happens once for both tiles. Watch-only and strictly separate from the ledger (§3.1); xpub entries are counted as "not queryable" rather than guessed at. With an empty watchlist both tiles offer to add an address and open that form on arrival, rather than only naming the gap.

**A widget may not read the clock while rendering.** `useNow()`/`useNowDate()` (`lib/clock.ts`) expose it as an external store, and where there is no meaningful "now" (the prerender) the hook returns null and the widget shows its skeleton — calling `Date.now()` in the render would make the component non-idempotent, which is exactly what that module exists to prevent.

**The price chart's own entries and exits** (`tradeMarkers`/`tradeMarkersFor`): a marker sits at the price the trade was **executed** at, never at that day's close. The close is a different number, and putting a buy on it claims an execution that never happened — it also dropped every trade whose day the price source had no candle for. A trade with no EUR figure at all has no price to be placed at and is *counted* below the chart instead of being placed at zero. Because the ledger records EUR (§3.2) and the chart follows the display currency, a USD axis converts each marker at the EUR/USD rate of **its own day** (both daily series, the rate carried forward over gaps), not at today's. And because a daily DCA would put several hundred dots on the chart — a band, not information — trades are folded into buckets (day, week or month: the finest that stays under ~45 markers), each marker sitting at the **volume-weighted** average price of its bucket and sized by the BTC it covers. Whenever it aggregated, the widget says so underneath, so a dot standing for thirty buys cannot be read as one trade.

**The buy heatmap is the classic calendar strip** (`buyHeatmap`): a year of days, weeks as columns and weekdays as rows, shaded by the day's volume. The strip is 53 columns wide at a readable cell size, so on a narrow tile it scrolls sideways — that is the trade this form makes, and it is why the widget asks for a wide default (eight columns, where the year fits without scrolling). Squeezing the year into any width instead is what turns the squares into slivers that can carry neither a date nor a label. What the strip does carry: the months across the top and the weekdays down the side, so it is clear what one square is, plus a line saying it outright. Hovering a square reports that day below the grid — how many buys, how much BTC and EUR, and the volume-weighted price paid, derived from the **gross** amounts like the chart's trade markers (the cell's BTC stays net of the fee, since that is what the stack grew by). That detail area has a fixed height and falls back to the period's summary, so moving the pointer across a year of squares never makes the tile jump. Month names and weekday abbreviations come from `Intl` in the active locale rather than from a dictionary entry, because they are calendar data.

**Unrealized P/L and the cost basis:** `openCostBasisEur` only covers open lots that have a known cost per BTC, so a market value compared against it must be taken over `FifoResult.openBasisBtc` — never over `portfolio.totalBalance()`. Coins whose acquisition price is unknown (an external `transfer_in` without a price, a buy with no EUR figure) are part of the holding but contribute no cost, so valuing the whole holding against a partial basis books their full market value as profit and can report a gain while the price sits below the average cost. The P/L widget therefore values `openBasisBtc` and names the BTC it left out; the same rule applies to any future figure that subtracts a cost basis from a market value.

**Data quality** (`lib/dataQuality.ts`): unlinked transfer legs (unpaired, see §3.2 — a group id alone is not a link), incoming transfers whose origin cannot be traced, disposals (sell, spend, outgoing transfer) whose lot allocations do not cover what left the account, transfer legs without a txid, and buy/sell/spend without any EUR figure. One predicate per issue, shared by the widget and the transaction table's issue filter, so the count and the filtered list can never disagree. An issue that cannot be judged from a single transaction takes an `IssueContext` (built once per ledger via `issueContext()`) instead of guessing — origin resolution walks the whole ledger backwards, and a caller that does not pass the context gets `false` rather than a wrong count.

**External data** (`lib/marketData.ts`): one module-level cache with per-key TTL, shared in-flight requests and a short error memo, so a re-render never becomes a request and an unreachable source never becomes a request storm. Prices come from Binance, on-chain figures exclusively from the explorer configured in `explorerSettings` (§3.3) — never a hard-wired third party. Widgets load independently, show a skeleton while loading, and catch their own errors: a per-widget `WidgetBoundary` plus a per-widget error state means one broken or unreachable tile never takes down the dashboard.

**Layout persistence:** position, size and choice of widgets live in the portfolio file (`uiSettings.dashboardLayout`, §3.5) and are written once per editing session, not per drag. "Reset layout" restores `defaultDashboard()` in the working copy, which is then committed like any other change. The shipped default layout has to be a fixed point of react-grid-layout's vertical compaction — otherwise the grid would "change" it on mount and merely opening the dashboard would dirty the file; a test asserts this.

**The default layout is a table of row bands** (`DEFAULT_BANDS` in `lib/dashboardLayout.ts`) and shows **every** registered widget, ordered by what a portfolio owner needs first: what it is worth right now, then what it is made of and whether it is in one's own custody, then the curves, then buying behaviour, then the ledger panels, then tax, then the watchlist, and finally the ambient chain facts. A band is exactly 12 columns wide and every widget in it is equally tall, which is what makes the whole layout a compaction fixed point *by construction*: each band rests completely on the one above, so nothing can float upwards, and no row is left part empty. A band 11 wide, or two heights inside one band, silently breaks that — three tests hold it: every row full, nothing able to rise, and every registry entry placed exactly once (so a new widget that nobody put in a band fails there rather than quietly missing from the default). Widths follow what a widget needs rather than what looks tidy: the buy heatmap gets **eight columns**, because a year of days is 53 week columns wide and only fits without scrolling from there on. The tax band carries `taxOnly`, so with `TAX_FEATURES_ENABLED` off it is dropped whole and the bands above keep their positions — a tax widget mixed into a shared band would leave a hole instead.

## 5. Design

- Minimalist, clean, reduced UI.
- Dark mode as the default theme (both themes are dark).
- Bitcoin color theme: accent color orange (`#F7931A`) on black/dark gray, green/red for profit/loss indicators.
- Responsive, desktop-focused, but mobile-friendly.
- **Typography:** Outfit for body text, Space Grotesk for headings, Geist Mono for anything that has to line up in a column (amounts, ids, addresses). All three are **bundled with the app** (`app/fonts/`, variable woff2, latin subset, wired up via `next/font/local`) rather than fetched from Google — an app whose whole point is that opening a portfolio tells nobody must not ask a CDN for a font while doing it. The heading face is applied to `h1`–`h6` in `globals.css`, so every heading follows without a component knowing about it; `font-heading` is there for the few lockups that read as headings without being one.

**Colour themes** (`lib/theme.ts` + the generated `app/themes.css`, chosen in the settings, §6.3): a theme is **nothing but a set of token values** — background/surface/surface-2, border, foreground/muted, accent (+ its dim and the text colour on it), gain/gain-safe/loss/warning, and a five-colour chart series. No component ever names a colour, so a new theme is one entry in the table and no component changes at all. Nine ship: `ocean` (default, deep navy), `night` (the Bitcoin orange on near-black), `terminal` (green on black, monospaced, with a static scanline texture), `gold`, `paper` (light, serif headings), `sunrise` (light, warm), `nord`, `mono` (greyscale, colour reserved for gain/loss) and `mempool` (after its fee gradient). A theme may bring its own typeface (`--theme-font-body`/`--theme-font-heading`), which is how terminal and paper differ in more than colour.

The values exist twice — as CSS custom properties for the components and as literals in TypeScript, because chart libraries cannot read variables and reading them off the DOM would mean touching `document` during a prerender. `scripts/build-theme-css.py` generates the stylesheet from the table, and `lib/theme.test.ts` asserts they never drift apart **and** that every theme clears WCAG AA (4.5:1) for text on every surface it is used on, for the text on a filled accent button, and 3:1 for the chart series. That test is what keeps a new palette honest; `night`'s loss red was lifted from `#e01b24` to `#f4585f` because of it, the only change to the two original themes.

**Appearance** (`lib/appearance.ts`) is theme + mode + the colour-vision option in one shape. `mode: "system"` picks between a configured light and dark theme by `prefers-color-scheme`, live. It lives in the portfolio file (`uiSettings.theme`/`themeMode`/`themeLight`/`themeDark`/`colorBlindSafe`, next to the dashboard layout) and is mirrored to a device preference (`localStorage`), so the start screen and the legal pages are themed before a file is open; the file wins when one is opened, and `settings.theme` is still read for files written before it moved. An inline script in `<head>` (`lib/themeBoot.ts`) sets the attributes from that preference **before the first paint**, so nothing flashes in the wrong colours; `components/ThemeEffect.tsx` only keeps them in sync afterwards.

**Accessibility.** Gain and loss are never encoded by colour alone: `PnlValue` prefixes an arrow (▲/▼/•, `aria-hidden`), and the places that already print a sign opt out of it — so the direction survives colour blindness, a greyscale print and a monochrome theme. The **colour-vision-friendly** option is independent of the theme and swaps gain from green to a blue each theme carries itself (`--gain-safe`, one rule for all themes); a test asserts that blue is blue-dominant in every theme and far enough from the loss hue. Print always uses the light `paper` theme, whatever is on screen — its tokens are re-declared inside `@media print`, so a dark background never floods a page.

**Laser eyes** (§5.1) add no colour of their own: the glow is `var(--accent)`, so the effect works in every theme, including the light ones.

**Keyboard and dialogs:** `:focus-visible` draws an accent outline globally — the UI is dense and made largely of icon buttons, table headers and disclosure headers that have no other affordance. Anything sortable or expandable is a real `<button>` with `aria-sort`/`aria-expanded`, never a clickable `<th>` or `<div>`. `Modal` is a `role="dialog" aria-modal` with its title as the accessible name; it takes focus when it opens, returns it where it was on close, closes on Escape, and freezes the page behind it.

### 5.2 Milestones

A catalogue of small acknowledgements (`lib/milestones.ts`, the overview in `components/MilestonesView.tsx`), under one rule that decides what may be in it: **a milestone rewards a decision the user made, never what the market did.** Nothing is awarded for the price going up, because that is not an achievement, it is weather. There are no streaks either — a streak turns a tool one opens when there is something to record into one that punishes you for not opening it, and this is somebody's money, not a game. And nothing compares one user to another, because the app has never seen another user and never will. A test asserts that no predicate reads a rate.

Five categories: **stacking** (first transaction, 100 000 sats, 1 000 000 sats, 0.1, 0.21, 1 and 2.1 BTC), **sovereignty** (first withdrawal from an exchange to one's own wallet, 50 % and 100 % self custody, first watched address, a taproot address, a Lightning wallet), **patience** (first lot past the holding period, 100 days, a year, held through a halving, four years), **diligence** (first backup, the file is encrypted, every transfer linked, every txid recorded, a tax report exported, a tax year closed) and **culture** (whitepaper opened, first consolidation, bought on a halving day, bought on 22 May).

**The file stores only what was reached** (`milestones` on the portfolio file: id, `achievedAt`, `acknowledged` — optional, so older files need no migration); the catalogue itself lives in code, and adding one is a single registry entry. Each entry is a **pure predicate** over a snapshot (`MilestoneContext`), which is what makes the catalogue unit-testable and what lets the app work out *when* something happened rather than stamping today's date on a file with five years of history: `achievedAt()` derives the date from the ledger (the day the holding crossed a threshold, the withdrawal that moved coins off an exchange, first buy plus 100 days), falls back to now, and is never allowed to land in the future.

**Every entry has its own drawn icon** (`components/MilestoneIcon.tsx`), for the same reason the laser eyes are drawn (§5.1): at 20 px an emoji is a handful of pixels whose look is decided by the platform's emoji font rather than by the theme, and it takes no accent colour. The set shares one geometry — a 24×24 box, no fill, `currentColor` at stroke width 1.6, round caps and joins, a solid dot where one is needed — which is what makes a column of them read as one set rather than as a pile of clip art. The drawings live outside `lib/milestones.ts`, keyed by id, so the catalogue stays free of JSX and testable without a DOM; tests assert that every milestone has exactly one icon, that none is drawn that no milestone asks for, that no shape brings a weight or colour of its own, and that nothing runs past the viewBox. The overview shows the icon for an *open* milestone too, muted instead of in the accent: an icon that only appeared once earned would make the list jump as it filled up.

**A reached milestone stays reached.** The holding can fall back below one coin and coins can move back onto an exchange — none of that un-earns the decision, and re-deriving the date would rewrite history. Records are added to, never touched.

**Evaluated on change, not on a timer:** the store evaluates inside the same commit as the change that earned it, and once when a file is opened, which is when the time-based ones can have become true. First contact with a file that carries *no* milestone history is silent: everything it already fulfils was discovered, not reached, so it is recorded acknowledged and nothing is announced. A file that already carries records is a returning one, and what is new since then genuinely happened while the user was away. Two milestones cannot be worked out from the file at all (the whitepaper was opened, a report was exported) and are recorded when they happen.

**The notification is a remark, not an interruption**: a small card bottom right that goes on its own, several at once collected into one card rather than queued as a sequence, its one movement behind `motion-safe:`. The whole coin keeps the confetti it already had (§5.1). Everything here is switched off by `settings.easterEggs` — but only the announcement: the records are still kept and the overview stays reachable, because that switch turns off the interruption, not the history.

### 5.1 Easter Eggs

A handful of small touches, under one rule: **none of them may get in the way of using the app seriously.** Nothing moves on its own, nothing blocks a click, nothing changes a number. `settings.easterEggs` (default on, `lib/easterEggs.ts`) switches every one of them off; with it off the app behaves entirely plainly. It has **no row in the settings**: a switch labelled "playful touches" tells everyone who opens the settings that there are some to find, which is precisely what these must not do. The field stays honoured wherever it is read, so a file that carries it off keeps them off — it is switchable by editing the file, not by reading the settings. The laser-eyes switch is the one exception, and only *after* they have been unlocked (§5.1), because by then there is nothing left to give away and an unexplained glow needs a way out.

- **Day-of lines**, each only on its day and in the *user's own timezone*: 22 May adds a line to the portfolio-value widget expressing the holding in pizzas at the 2010 rate (10 000 BTC for two, so 5 000 apiece); 3 January puts the genesis-block headline in the footer, 10 January Hal Finney's "Running bitcoin".
- **The first whole coin** (`components/Celebration.tsx`): crossing 1.0 BTC once triggers a short orange confetti animation, CSS only and `pointer-events: none`. `uiSettings.wholecoinerCelebrated` records it in the portfolio file, so it happens once per portfolio rather than once per page load — and a file that is *already* above one coin when it is opened records the flag without showing anything, because that moment has passed. `prefers-reduced-motion` (checked in JS *and* in the stylesheet) leaves the message and drops the motion.
- **Laser eyes**: 21 clicks on the ₿ in the header unlock a cosmetic mode — persisted as `uiSettings.laserEyes`, switchable off in the settings once unlocked, and confirmed by a toast so an unexplained glow cannot read as a rendering bug. The logo is a real button, so it is reachable by keyboard. Unlocked, the ₿ **gives way to a face** (`components/LaserAvatar.tsx`): the placeholder avatar of every login screen, contours only, with a flare burnt into each eye. Both halves are the point — the meme is a *face* with flares in it, and a flare needs eyes to sit in, which a ₿ does not have. The flare is what the pictures actually show, not a beam leaving the head: a white-hot core, long horizontal spikes and shorter vertical ones, and a halo wide enough that the two bleed into one band across the eyes. It is drawn (SVG) because at 20 px an emoji is a handful of grey pixels that looks like whatever the platform's emoji font decides. The only colours are the theme's accent and white, so it burns in all nine themes; the glow around it is one `drop-shadow` in the accent (`.laser-glow` in `globals.css`, `drop-shadow` and not `text-shadow`, because what glows is no longer a glyph). Static, out of the layout, and nothing it draws can take a click.

- **Sovereign badge**: with 0 % of the holding on exchange-type wallets, the custody widget's warning metric gives way to the acknowledgement — that state *is* the goal of the metric.
- **Fee comment**: the network-fee widget adds one line per rate band about what one would actually do at that rate (consolidate while blocks are cheap, wait while they are not), which keeps it useful rather than loud.
- **Empty transaction table**: "Nothing here yet. Every stack starts at zero sats." instead of the neutral sentence.
- The **whitepaper** ships with the app (`public/bitcoin.pdf`) and is linked from "how it works" — served from the project, like the fonts, so reading it asks nobody else. That page also calls the chain the **timechain**, exactly once.

Every string goes through the normal DE/EN dictionaries; there are no hard-coded texts.

The **BTC display unit** (§6.3) is deliberately *not* one of these: it is a real display mode and stays available with the switch off. Only the "1 BTC = 1 BTC" line in the portfolio-value widget is the playful part of it.

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

- Appearance (§5): one of nine colour themes, or "follow the system" with a light and a dark theme; plus the colour-vision-friendly option. Stored in `uiSettings` and mirrored to a device preference
- Language (German/English toggle, German as default) — the choice lives in the portfolio file and is mirrored to a device preference (`localStorage`), so the pages that exist without an open file (start screen, "how it works", legal notice, privacy) follow it as well; those pages carry their own DE/EN switch and exist under a localized URL per language (`/so-funktionierts` ↔ `/how-it-works`, `/impressum` ↔ `/legal-notice`, `/datenschutz` ↔ `/privacy`; map in `lib/routes.ts`). Opening a page adopts the URL's language; switching the language rewrites the URL — except while a portfolio is open, where the file's language wins
- Display currency: EUR, USD, or **BTC** — a display *unit*, not a valuation currency. The ledger stays EUR (§3.2); amounts are shown in whole sats, fiat figures are converted at the current rate, and prices are still fetched in fiat (`priceCurrencyOf`). Sorting, rounding and every stored value are untouched by it: `lib/displayUnit.ts` only renders.
- Easter eggs / playful touches (§5.1), on by default
- Explorer source for on-chain queries: public API (default, e.g. mempool.space) or your own Electrum server/node (maximum privacy) — with a clear UI notice about the trade-off that public APIs transmit addresses to third parties
- Change password / enable/disable encryption
- Tax settings (holding period rule, the §23 EStG exemption limit in EUR, FIFO as default, possibly LIFO selectable later)
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

### 7.1 Demo Portfolio

`public/demo-portfolio.json` and `…​.en.json` are what "Testportfolio laden" opens. They are not a stub: the demo doubles as the worked example of every feature, so the ledger contains every constellation the app knows — all four wallet types, wallets with several accounts, all five transaction types, batched transfers (dozens of buys in one send), a chain across three wallets, one send arriving in two accounts, foreign-currency settlement in USDT and USD valued from history, external receives and sends, legs that inherit a txid or an address from their counterpart, BTC and fiat fees, disposals on both sides of the holding period across three tax years, a watchlist covering every address format, UTXO labels, two import presets that disagree about everything the wizard can ask, and the current default dashboard.

It also has to have **volume**, because a heatmap, a DCA overview, a fee balance or the price chart's marker aggregation say nothing about five transactions. So the file carries three years of a weekly savings plan and a year of a daily one — several hundred buys, swept into cold storage in batches of dozens of lots at a time, which is also the widest lot assignment in the file. Prices come from `price_at()`, which interpolates monthly anchors and adds a deterministic wobble; deterministic because the generated files have to be reproducible.

It also carries exactly **one** deliberate gap — a transfer nobody has assigned yet — because "which buys does this close" is the one question the app never answers by itself (§3.2), and the demo should show what that looks like and how it is fixed. Its note says so.

Both files are generated by `scripts/build-demo-portfolio.py` from one structure, so the two languages cannot drift apart, and `lib/demoPortfolio.test.ts` runs the real engine over them: balances non-negative, no lot over-allocated, engine and ledger agreeing apart from that one gap, and every feature above actually present. A demo that contradicts itself fails there rather than in front of a user.

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
- Implement the FIFO calculation as a pure, isolated function with unit tests. The same goes for origin resolution (`lib/provenance.ts`): pure, isolated, and covered for single lots, bundled multi-lot arrivals, partial amounts, multiple hops, missing links and circular references.
- Numeric **input fields** use the shared `components/NumberInput.tsx`: it shows the value with the locale's decimal separator (de: "0,50000000") while handing the parent a canonical decimal string ("0.5"), which is what the ledger stores and every calculation expects. Typing is never reformatted mid-entry (only on blur), and unparseable text is passed through so validation can flag it instead of it silently becoming 0. `parseNumberInput()` accepts either separator (the last "." or "," is the decimal point, earlier ones are grouping), so pasted values work in both languages.
- Formatting for display goes exclusively through the shared helpers, never through a bare `toLocaleString`/`toFixed` (which would pick up the browser's locale or ignore grouping): `formatBtc` (always 8 decimals, zero-padded), `formatFiat` (with currency symbol), `formatFiatPlain` (no symbol — for columns whose header already names the currency), `formatInt` in `lib/decimal.ts`, and `formatDate`/`formatTime`/`formatDateTime` in `lib/i18n/`. The active app locale (`intlLocale(locale)` → `de-DE`/`en-US`) drives decimal and thousands separators as well as date order. Input fields keep raw machine-readable values — only rendered output is formatted.
- **The order the ledger is read in is causal, not chronological** (`causalOrder()` behind `flattenLedger()`): an entry is placed at the later of its own date and the dates of the transactions it takes its lots from — an in-leg behind its out-leg, a disposal behind the lots it allocates — with the causal depth as the tie-break inside one effective date. Timestamps alone do not do it: an arrival is regularly recorded *before* the send it belongs to (a hardware wallet stamps the transaction when it sees it, an exchange when the withdrawal completes, and two CSV exports need not agree at all). Read in that order the arrival's lots have not left the source account yet, and its coins drop out of the FIFO engine while the balance still counts them — which surfaces as a chunk of the holding with no cost basis. For the same reason the engine never silently drops an arrival: one whose group has no out-leg becomes a lot of unknown origin (`originUnresolved`) instead of nothing at all.
- **A daily balance series books both legs of an internal transfer on the send day** (`dailyBalanceSeries()` in `lib/portfolio.ts`). The two legs regularly carry different timestamps — a hardware wallet stamps the arrival when it sees it, an exchange the withdrawal when it completes, and two CSV exports need not agree at all (see the causal-order note above). Booked on their own days, such a pair moves the *total* holding: it rises by the moved amount on the arrival day and falls back on the send day, drawing a spike out of a transfer that never changed the holding by more than its network fee (the opposite leg order draws the same artefact as a dip). So a **paired** `transfer_in` is booked on the day its out-leg left, which is also the day the fee was burnt; an unpaired arrival keeps its own day, because an arrival with no send behind it is a real inflow from outside. Everything built on that series inherits the fix: the value chart, the 24h/7d/30d changes, the stack chart and the drawdown.
- The displayed BTC holding always comes from the ledger (`portfolio.totalBalance()`: buys + transfer_ins − sells − transfer_outs − spends, BTC fees per §3.2), never from the FIFO engine. The engine only accounts for disposals that carry an assignment (§3.2), so with unassigned or half-imported history its open-lot sum (`FifoResult.openLotsBtc`) exceeds the real balance — that gap is reported on the dashboard instead of changing the balance.
- Version the data model (`version` field) to enable future migrations.
- Use decimal arithmetic for BTC amounts (e.g. `decimal.js`), no native `number` for money/crypto amounts.
- Autosave mechanism (e.g. debounce after every change) for File System Access API mode; explicit save button for fallback mode.
- Implement the address watchlist strictly separated from the portfolio ledger (see 3.1) — no implicit links, only optional, purely informative references.
