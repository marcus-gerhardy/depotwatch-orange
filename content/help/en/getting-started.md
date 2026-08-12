# Getting started
From an empty file to your first recorded transaction, in four steps.

## Create a portfolio file {#gs-create}
DepotWatch Orange stores nothing on a server. Your entire portfolio lives in **one file on your device**, which you look after yourself.

The start screen offers two ways in:

1. **Create a new portfolio** makes an empty file and walks you through location, password and the first wallet.
2. **Load the demo portfolio** opens a fully populated example you can try everything on without risk. It only lives in memory; as soon as you change it, the app asks where to save.

> How the app works without a server, and why that is safer, is explained on [How it works](/how-it-works).

## Choose a password {#gs-password}
The password encrypts the file (AES-256-GCM, key derivation with PBKDF2). There is **no recovery**: without the password the file is gone, for you as well.

- Use a long password you can remember, or keep it in a password manager.
- A portfolio without encryption is possible, but the file is then readable by anyone who gets hold of it.
- Without a password the app also cannot lock itself, because there would be nothing to lock it with.

## First wallet and account {#gs-first-wallet}
The structure has two levels: a **wallet** is a place where bitcoin sits (an exchange, a hardware wallet, a software wallet, a paper wallet). An **account** is an area inside it.

For example: wallet "Kraken" with the accounts "Spot" and "Savings", wallet "Ledger" with the account "Account 1".

If in doubt: one wallet with one account is enough to start with, and you can add more at any time.

## Record your first transaction {#gs-first-tx}
Go to **Transactions** and click **Record transaction**. A buy needs a date, an account, the BTC amount and either the price or the euro total — one of the two is enough, the app works out the other.

![The "Record transaction" dialog with the fields type, date, account, amount, price and total](/help/screenshots/transaction-form.png)

The dashboard then shows holding, average cost and value straight away.

> Got an export from your exchange? Then the [CSV import](/help/csv-import) is faster than typing.
