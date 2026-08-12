# Frequently asked questions
What can go wrong, and what to do about it.

## My holding is wrong {#faq-balance}
The holding shown always comes from your transactions: buys and arrivals minus sales, sends and spends, with BTC fees applied by the usual rule.

If it does not match your exchange, check in this order:

1. Are transactions missing? The last import may have taken too few rows because of a row filter.
2. Are fees counted twice? In the import step, the fee question decides whether an amount was meant gross or net.
3. Are there transfers whose counterpart is missing? The **Data quality** widget counts them.

## "Uncovered disposal" {#faq-uncovered}
A sale, a transfer or a spend without a lot assignment. The app never assigns by itself — see [Sales](/help/sales).

While that is open, the sum of open positions exceeds the actual holding, and the dashboard says so. Open the transaction in question and assign the positions; the filter in the transaction table finds them.

## "Origin unresolved" {#faq-unresolved}
An arrival whose outgoing leg is missing or unlinked. The app refuses to treat the arrival date as an acquisition date — that would falsify the holding period.

Open the arrival and link it to the matching outgoing leg. If the app finds no candidate, you can create the missing outgoing leg directly from the source account's positions.

## I forgot my password {#faq-password}
Then the file cannot be opened any more — not by us either. There is no back door; that is the point of the encryption.

Check whether a **backup** with an older password exists; after a password change, old backups keep the old one.

## I deleted too much {#faq-undo}
Under **Settings → Change history** you find the most recent changes, each of them reversible. That includes deletions which released lot assignments along the way.

For large actions or older states: [restore a backup](/help/backups).

## Prices are not loading {#faq-prices}
Prices come from a public interface. Without internet, with blocking extensions, or under rate limiting, the tile stays empty and shows an error.

Everything that comes from your file — holding, assignments, holding periods — keeps working regardless.

## Does the app work offline? {#faq-offline}
Yes. Opening, recording, analysing and saving need no network. Without one, only prices and on-chain data are missing, and this help works fully offline as well.
