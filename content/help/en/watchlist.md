# Address watchlist and security
Watching addresses without anyone needing your keys.

## Watch-only, and separate from the ledger {#watch-concept}
The watchlist is a **list of its own**, holding Bitcoin addresses or xpubs you want to keep an eye on. It deliberately has nothing to do with your recorded transactions.

The reason: accounting positions and actual UTXOs cannot be mapped one to one — several buys often end up in a single UTXO. So the ledger works from what you recorded and the security side from what the blockchain says, without either distorting the other.

## Adding an address {#watch-add}
Under **Watchlist** you enter an address or xpub, a label and optionally tags such as `kyc` or `hardware-wallet`.

![The address watchlist with watched addresses, labels and tags](/help/screenshots/watchlist.png)

> An **xpub** reveals a wallet's entire transaction history, not just one address. Only enter one if you are aware of that.

## What is checked {#watch-checks}
- **Address reuse** — the same address used more than once to receive.
- **Public key exposure** — with legacy addresses the public key becomes visible on the first spend.
- **Address poisoning** — dust from visually similar addresses, a common scam attempt.
- **Address type** — a hint towards modern formats (SegWit, Taproot) with better privacy and lower fees.
- **Privacy score** — a heuristic assessment per UTXO.

## Where the data comes from {#watch-explorer}
On-chain data is fetched from the explorer configured in the settings — mempool.space by default.

> In doing so the provider learns **which addresses you are interested in**, together with your IP address. That is the price of a public service. To avoid it, enter your own server under **Settings → Explorer**; no address then leaves your network.

Portfolio data is never transmitted in the process — only the addresses you entered yourself.
