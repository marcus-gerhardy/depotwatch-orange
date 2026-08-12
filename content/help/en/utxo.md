# UTXO management
Labelling individual coins, spotting dust, consolidating sensibly.

## What a UTXO is {#utxo-what}
Bitcoin has no account balances, only **unspent outputs**: individual amounts, each spent as a whole. Your "holding" is the sum of your UTXOs.

This is not a detail for the advanced: which UTXOs you throw together when paying decides what an observer learns about you, and how much fee you pay.

## Labelling (coin control) {#utxo-labels}
Every UTXO can carry a label and tags — where it came from, `kyc` or `non-kyc`, which wallet. The labels live in your portfolio file.

The point shows when spending: knowing which coins came from a KYC exchange lets you avoid spending them together with others.

## Spotting dust {#utxo-dust}
A UTXO is "dust" when spending it would cost more in fees than it is worth. The app marks such outputs, measured against the current fee level.

Dust somebody sent you unasked is often an attempt to mark you. Simply leaving it alone is usually the right answer.

## Consolidating {#utxo-consolidate}
Many small UTXOs make later payments expensive. Merging them into one costs a fee once — best done while the network is cheap.

The fee widget on the dashboard says so when fees are low: that this is a good moment for it.
