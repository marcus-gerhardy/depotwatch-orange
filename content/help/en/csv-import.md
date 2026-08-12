# CSV import
Reading exchange export files, step by step.

## The steps at a glance {#csv-overview}
The wizard walks through five steps:

1. **File and preset** — choose the file, then a preset or "no preset".
2. **Row filter** — take only certain lines, for instance only `trade`.
3. **Map columns** — which CSV column fills which field.
4. **Map values** — which text means which transaction type.
5. **Preview** — every row exactly as it would be booked, with warnings and duplicates.

Only the last step writes anything into your portfolio.

## Presets {#csv-presets}
**Bundled presets** (Kraken, Bitpanda, BitBox02 and others) ship with the app and cover the usual exports. They cannot be edited, but they make a good starting point.

**Your own presets** are saved at the end. They live **inside your portfolio file**, so they travel with it to other devices and survive a change of browser.

## Mapping columns {#csv-mapping}
The app proposes a mapping from the column headers; you still have to check it.

**Date and time** are two fields with formats of their own. If your file has a single timestamp column, select it in both fields and set the time format to "from date/time". If a value carries a time zone (`+02:00`, `Z`), it is taken into account.

**Units** are set per field: BTC or sats for amounts, BTC or sats for fees.

**Character set and separators** are in the first step: UTF-8, ISO-8859-1 or ISO-8859-15, comma or semicolon, dot or comma as the decimal separator. Mangled accents in the preview almost always mean the wrong character set.

## Reading fees correctly {#csv-fees}
Exports disagree about whether a fee is already part of the amount it belongs to. Right at the fee column, the wizard therefore asks:

- **BTC fee**: "already deducted from the amount?" — separately for incoming and outgoing, because one file may well use both conventions.
- **Euro fee**: "already part of the amount?"

The preview has a column of its own showing what will actually be booked. When the sum does not match your account balance, this is almost always where the mistake is.

## Duplicates {#csv-duplicates}
A file imported twice doubles the holding without anything looking broken. Two checks guard against it:

- **The file**: its checksum is compared against earlier imports. If it looks familiar, the app warns with the date and the size of that earlier run.
- **The rows**: every row is checked against the target account and against the earlier rows of the same file — the same transaction id, or identical values, or identical values within a time tolerance (configurable, two minutes by default).

**Nothing is discarded automatically.** A duplicate can be genuine. Duplicates are marked, default to "do not import" and link to the colliding transaction; the decision is yours.

## Undoing an import {#csv-undo}
Every import is recorded. Under **Settings → Import** you see the runs and can remove one of them.

What a later action has already used — a lot that was sold from, or a transfer whose counterpart stays — is **not** removed, and is named individually.
