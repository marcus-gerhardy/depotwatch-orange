# Recording transactions
The five types, and when each is the right one.

## The five transaction types {#tx-types}
- **Buy** — you give euros and get bitcoin. Creates a new lot (a position with its own acquisition date and cost).
- **Sell** — you give bitcoin and get euros. A disposal for tax purposes.
- **Transfer out** — bitcoin leaves an account: either to another account of your own or to somebody else's address.
- **Transfer in** — bitcoin arrives in an account.
- **Spend** — you pay with bitcoin. Treated like a sale for tax purposes.

![The transaction table with date, type, wallet, amount, price and value per row](/help/screenshots/transactions.png)

> A transfer between your own wallets is **not** a sale and triggers no tax. Record it as a transfer, not as a sale followed by a buy, or you destroy your holding periods.

## Price or total {#tx-price}
For buys, sales and spends one of the two is enough: price per BTC **or** total in euros. The app derives the other.

If you record both, the total counts as what actually moved.

## Fees {#tx-fees}
Fees sit **next to** the amount, not inside it:

- A **BTC fee** comes on top. A buy of 0.1 BTC with a 0.001 BTC fee credits the account with 0.099 BTC. A sale or transfer of 0.1 BTC with a 0.001 BTC fee debits it 0.101 BTC.
- A **euro fee** raises the acquisition cost on a buy and reduces the proceeds on a sale.

This rule holds everywhere; the CSV import converts other conventions found in export files onto it.

## Settled in another currency {#tx-currency}
If you bought against USDT or dollars, you can document that: currency, amount and price in the original currency have their own section in the dialog.

Those fields are **documentation only**. Everything is calculated in euros — holding periods, gains and every analysis read the euro fields exclusively. Where the euro value is missing, the app can derive it from the historical daily close at the press of a button; such values are marked with "≈".

## On-chain data {#tx-onchain}
Transfers can carry a **transaction id** and an **address**. Both are optional and serve for finding things again and for pairing an outgoing leg with its incoming one.

Where one side is missing a value, the app takes it from the counterpart, as long as that is unambiguous. The app's security features do **not** read these fields — they work exclusively from the [address watchlist](/help/watchlist).
