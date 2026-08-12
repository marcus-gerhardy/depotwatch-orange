# Sales and lot selection
What happens when you sell, and why you pick the position yourself.

## Recording a sale {#sale-create}
A sale needs a date, an account, an amount and the proceeds. On top of that it needs to say **which buys** the sold amount came from — the lot assignment.

The dialog offers that selection right there, so it can be answered immediately. You can also add it later: until then the transaction stays marked as incomplete.

## Why the app does not assign automatically {#sale-no-auto}
Other programs quietly assume "FIFO" and assign the oldest buy. This app deliberately does **not**.

The reason: an automatic assignment silently decides the holding period, the cost basis and the taxable gain — and it decides **differently** as soon as anything earlier in the ledger changes. Two runs over the same file would then disagree about what was sold.

So: the assignment is made once, by you, stored permanently, and **never recalculated afterwards**.

## Picking lots {#sale-pick}
The picker shows every open position in the account with acquisition date, remaining amount, cost and holding-period status.

- Sorting and search help you find things; the table's order doubles as the priority when amounts are filled in automatically.
- Multi-select is there for a sale that covers several buys.
- The proposed amounts can be edited by hand afterwards.

If you want to follow FIFO for tax purposes, sort by acquisition date ascending and pick from the top. If you want to sell a position that is already past the holding period, sort by holding period instead.

## What the app computes from it {#sale-fifo}
The assigned lots give cost, holding period and gain — per part, because one sale can come from several buys.

The engine consumes **only what is assigned**. A disposal without an assignment closes no position, has no cost basis and is reported as "uncovered". While that is the case, the sum of open positions exceeds the actual holding — that is the honest state of the file, and it disappears as you assign.

> What follows from this for tax is under [Taxes](/help/tax). The app is no substitute for tax advice.
