# CSV import presets

A **preset** describes one provider's CSV export completely enough that the
import wizard needs to ask nothing: delimiter, encoding, date and time format,
which column fills which field, which unit the amounts are in, what the type
column's values mean, how the fees are to be read, and which rows take part at
all.

Two kinds exist (see [CLAUDE.md](../../CLAUDE.md) §3.4):

- **System presets** — the JSON files in this directory. Read-only in the app,
  shipped in the bundle, changed only by an app update.
- **User presets** — created in the wizard, stored in the user's own portfolio
  file, so they travel with the file rather than with a device.

Both are the same configuration. A user preset can be exported as a file of the
format described here, which is how a system preset comes into being: somebody
gets an import working and contributes the configuration that made it work.

## Presets carry no personal data

**A preset is configuration and nothing else.** It must never contain
transactions, amounts, balances, bitcoin addresses, txids, file names, e-mail
addresses or anything else that belongs to whoever made it. That is not a
formality: these files are shared in public pull requests, and a file that
quietly carries somebody's on-chain history is the worst kind of leak, because
nothing about it looks wrong.

The export in the app is built from an allowlist of fields and additionally
scans the three places where the user's own data could bleed in — the header
signature, the type values and the row-filter values — dropping anything that
parses as an address, a txid, an amount, an e-mail address or an IBAN, and
naming what it dropped. The importer *refuses* such a file rather than cleaning
it silently. Read the file before you open a pull request anyway: it is short,
and you are the last check.

## Contributing a preset

1. **Get one import working** in the app: CSV import wizard, all steps, until
   the preview shows the rows exactly as they should be booked.
2. **Save it as your own preset** at the end of the wizard.
3. **Export it as JSON**: Settings → Import → Import presets → *Export as
   JSON*. The dialog asks for provider, format version and a description, shows
   the header signature it took from your file, and lists anything it removed.
4. **Check the file**: no amounts, no addresses, no file name, no account name.
5. **Drop it into this directory**, named after the id
   (`example-exchange-v1.json`).
6. **Validate**: `npm run presets:validate` — the same check the build runs.
7. **Register it** in `lib/importPresets.ts`: one `import` line and one entry in
   `SYSTEM_IMPORT_PRESETS`. (Deliberately manual: what the app ships is a
   decision, not the content of a directory.)
8. **Open a pull request** naming the provider, the export ("trade history",
   "ledgers", …) and roughly when the export was made — providers change their
   formats, and that is what `formatVersion` is for.

## The format

The schema is [`schema.json`](./schema.json) (JSON Schema 2020-12);
[`example.json`](./example.json) is a complete, valid template. Fields:

| Field | Required | What it is |
| --- | --- | --- |
| `schemaVersion` | yes | Version of *this* format. Always `1` right now. |
| `id` | yes | Unique, kebab case, usually provider + format version. Also the file name. |
| `name` | yes | What the picker shows. |
| `provider` | yes | Exchange, broker or wallet. Groups the picker. |
| `formatVersion` | yes | Version of the *provider's* export format, so several can coexist. Compared numerically where possible (`"2"` < `"10"`). |
| `description` | no | One or two sentences: which export this is, where it is found, what it does not cover. |
| `delimiter` | yes | `","` or `";"`. |
| `decimalSeparator` | yes | `"."` or `","`. |
| `encoding` | yes | `"utf-8"`, `"iso-8859-1"` or `"iso-8859-15"`. |
| `dateFormat` | no | `iso`, `de`, `mdy`, `dmy`, `ymd`, `unix-s`, `unix-ms`. |
| `timeFormat` | no | `hms`, `h12`, or `datetime` when the clock time comes out of a full timestamp. |
| `columnMapping` | yes | Target field → column header, spelled exactly as the header row does. |
| `unitMapping` | no | `amount` and `fee`, each `btc` or `sats`. |
| `valueMapping` | no | What the type column's values mean, e.g. `{"withdrawal": "transfer_out"}`. |
| `fixedType` | no | One type for every row, for an export that holds one kind only. Not together with a mapped `type` column. |
| `feeInterpretation` | no | `btcIn`/`btcOut` (`deducted` \| `notDeducted`) and `fiat` (`gross` \| `net`) — see below. |
| `rowFilter` | no | Which lines take part at all, e.g. only `Asset = BTC`. |
| `headerSignature` | yes | The header row of a real export. This is what recognises the file. |
| `createdAt` | yes | ISO-8601. Documentation only. |

Target fields for `columnMapping`: `type`, `date`, `time`, `amountBtc`,
`pricePerBtcEur`, `totalFiatEur`, `feeBtc`, `feeFiatEur`, `originalCurrency`,
`originalAmount`, `originalPricePerBtc`, `txid`, `address`, `note`.
Transaction types for `valueMapping`/`fixedType`: `buy`, `sell`, `transfer_in`,
`transfer_out`, `spend`.

### `headerSignature`

The whole header row of a real export, as written in the file. It is compared
**tolerantly**: case-insensitively, with repeated whitespace collapsed, order
irrelevant, and columns the export has *in addition* are not a reason to reject
the preset — exports gain columns far more often than they lose them. A preset
matches when every column it names is present.

List all columns, not only the mapped ones: that is what tells two providers
with similar mappings apart, and two format versions of one provider.

### `feeInterpretation`

Exports disagree about whether a fee is already inside the amount it belongs
to, and one file commonly uses both conventions — a spot buy reporting the
amount net of the trading fee, a withdrawal reporting the total that left the
account. Hence one answer per direction:

- `btcIn` — buys. `deducted`: the BTC amount is what was really credited.
  `notDeducted`: the fee is still inside it.
- `btcOut` — sells, spends, outgoing transfers. Same question.
- `fiat` — `gross`: the EUR amount already contains the fee. `net`: the fee
  comes on top.

The ledger itself always keeps the fee *next to* the amount (CLAUDE.md §3.2);
these settings only say how to get there from what the file writes.

## Validation

```
npm run presets:validate
```

runs over every `*.json` in this directory (except `schema.json`) and checks it
against the schema plus the things a schema cannot say: ids unique across all
files, the file name matching the id, a non-empty header signature, valid
target fields in `columnMapping`, valid transaction types in `valueMapping` and
`fixedType`, and no personal data anywhere. It runs as part of `npm run build`
and again in `npm test`.
