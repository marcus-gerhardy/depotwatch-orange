# Transfers between wallets
How bitcoin moves from one account to another without losing its holding period.

## Why a transfer is not a sale {#transfer-why}
When you send bitcoin from an exchange to your hardware wallet, you have not sold anything. The acquisition date and cost stay with the coins — and so does the holding period.

For the app to follow that, it needs two things: **which buys** the outgoing leg takes with it (the lot assignment), and **which arrival** belongs to it (the link).

## Creating a transfer {#transfer-create}
In the transfer dialog you pick the source account, the target account, the amount and the network fee. The app creates both sides: an outgoing leg in the source account and an incoming one in the target, joined by a shared id.

The network fee belongs to the outgoing leg. The target receives the amount without it — exactly as it happens on chain.

## Lot assignment {#transfer-lots}
An outgoing leg has to say **which buys** the coins come from. The app **never** picks that itself, and that is deliberate: a guessed assignment silently decides holding periods and gains.

In the dialog you pick the lots in a table — newest first, sortable, searchable, multi-select. A transfer bundling twelve savings-plan buys is therefore one selection instead of twelve operations.

The selected lots have to add up to **amount + network fee**. A deviation is shown but blocks nothing: a half-assigned import is a legitimate intermediate state.

## Linking the two legs {#transfer-link}
When the two sides come from different imports, they start out unconnected. You link them **from the arrival**: the dialog suggests matching outgoing legs from other accounts, ranked by how well they fit — an identical transaction id counts as proof, after that amount and date decide.

The difference between the two amounts is normally the network fee, and the app offers to adopt it. If the difference is more than one percent, it is probably the wrong partner, and the app says so.

## Seeing where coins came from {#transfer-provenance}
Every transfer can be unfolded in the transaction table. Underneath it says **which original buys** the amount is made of: acquisition date, proportional share, original cost, source account and holding-period status.

This works across any number of hops: exchange → hardware wallet → another hardware wallet keeps the original purchase.

Where the trail cannot be followed, the app says "origin unresolved" rather than inventing a date. Such positions show up in the data quality list and can be repaired from there.
