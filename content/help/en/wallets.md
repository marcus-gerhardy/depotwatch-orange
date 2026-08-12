# Wallets and accounts
How to map where your bitcoin actually sits.

## The structure {#wallets-structure}
**Wallet → account → transactions.** A wallet is a place of storage, an account an area inside it. Every transaction belongs to exactly one account.

Wallets have a type: **exchange**, **hardware**, **software** or **paper**. The type is not decoration — the app works out the share in self custody from it, and warns when a lot sits on exchanges.

## Creating and renaming {#wallets-manage}
Under **Wallets** you create wallets and accounts inside them. Renaming is possible at any time and changes nothing about the transactions.

Deleting a wallet or an account **deletes all the transactions in it**. The app says how many beforehand, and releases what pointed at them: lot allocations that would dangle, and transfer links whose counterpart is gone.

## How many accounts make sense? {#wallets-howmany}
As many as there are places you want to see separately. One account per exchange account and one per hardware wallet is the normal case.

Separate accounts pay off when you want to tell holdings apart, savings plan versus trading stack for instance — the lot assignment for sales and transfers becomes much easier to read.
