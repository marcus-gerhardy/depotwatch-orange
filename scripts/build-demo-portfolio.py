#!/usr/bin/env python3
"""Builds the shipped demo portfolios: public/demo-portfolio{,.en}.json.

    python3 scripts/build-demo-portfolio.py

Both files have to describe the *same* ledger — only the notes and labels a
reader sees differ — so they are generated from one structure instead of being
edited twice. The demo is also the worked example of every feature, which is
why the ledger below deliberately contains every constellation the app knows:
all wallet types, all transaction types, batched and chained and split
transfers, foreign-currency settlement, external receives and sends, fees of
each kind, disposals on both sides of the holding period, and exactly one
unassigned transfer as the example of an open lot assignment.

What comes out is checked by lib/demoPortfolio.test.ts — balances, assignments
and the feature coverage — so run the tests after changing anything here.
"""
import json
from collections import defaultdict
from decimal import Decimal as D

TXID = {
    "t1": "9f2c4a1d0b7e5638a4c1f0d92b6e83571c4a0d9e2f8b7361a5c0e4d29f7b6183",
    "t2": "3ab7e1c95d0426f8b1c73e9a5d20f4681e7c3b95a2d08f461c9e75b3a0d26f84",
    "split": "5c0d38e7a1b94f26d0357c81e9a4b62f3d18e075c9a2b46f81d05e37c9a2b641",
    "paper": "e41d7b09a5c2f836d17b04e95a3c68f2019d7e4b6a25c8f03d19b7e04a5c26f38",
    "spend": "7d0a3e19b5c284f6013d7ae95b2c48f60d19a7e3b5c04f82d61a9e07b3c54f29",
    "ext": "b62c9f07d3a15e84f209c7b3d5a0e6482f13c9d70b5a2e46f803d1c95a7b0e23",
}
ADDR = {
    "cold1": "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    "cold2": "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3",
    "second": "bc1q9d4ywgfnd8h43da5tpcxcn6ajv590cg6d3tg6axemvljvt2k76zs50tv4q",
    "sparrow": "bc1pmzfrwwndsqmk5yh69yjr5lfgfg4ev8c0tsc06e",
    "paper": "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
    "friend": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
}


def d(x):
    return D(str(x))


class Ledger:
    """Collects transactions and checks the invariants while they are added."""

    def __init__(self):
        self.wallets = []
        self.by_account = {}
        self.credited = {}   # lot tx id -> BTC it credited
        self.allocated = defaultdict(D)  # lot tx id -> BTC claimed by disposals
        self.balance = defaultdict(D)    # account id -> BTC

    def wallet(self, wid, name_de, name_en, wtype, accounts):
        self.wallets.append(
            {"id": wid, "de": name_de, "en": name_en, "type": wtype, "accounts": accounts}
        )
        for acc in accounts:
            self.by_account[acc["id"]] = acc
            acc.setdefault("transactions", [])

    def add(self, account_id, tx):
        acc = self.by_account[account_id]
        acc["transactions"].append(tx)
        amount = d(tx["amountBtc"])
        fee = d(tx.get("feeBtc") or 0)
        t = tx["type"]
        if t == "buy":
            credited = amount - fee
            self.credited[tx["id"]] = credited
            self.balance[account_id] += credited
        elif t == "transfer_in":
            self.credited[tx["id"]] = amount
            self.balance[account_id] += amount
        else:
            self.balance[account_id] -= amount + fee
        for a in tx.get("lotAllocations", []):
            self.allocated[a["lotTransactionId"]] += d(a["amountBtc"])
        return tx


L = Ledger()


def tx(id, type, date, amount, *, price=None, total=None, fee_btc=None, fee_fiat=None,
       lots=None, counterparty=None, group=None, txid=None, address=None,
       orig=None, eur_source=None, note_de="", note_en=""):
    out = {
        "id": id,
        "type": type,
        "date": date,
        "amountBtc": str(amount),
        "pricePerBtcEur": None if price is None else str(price),
        "totalFiatEur": None if total is None else str(total),
    }
    if fee_btc is not None:
        out["feeBtc"] = str(fee_btc)
    if fee_fiat is not None:
        out["feeFiatEur"] = str(fee_fiat)
    if lots:
        out["lotAllocations"] = [
            {"lotTransactionId": k, "amountBtc": str(v)} for k, v in lots
        ]
    if counterparty:
        out["counterpartyAccountId"] = counterparty
    if group:
        out["transferGroupId"] = group
    if txid:
        out["txid"] = txid
    if address:
        out["address"] = address
    if orig:
        out["originalCurrency"], out["originalAmount"], out["originalPricePerBtc"] = (
            orig[0], str(orig[1]), str(orig[2]),
        )
    if eur_source:
        out["eurValuationSource"] = eur_source
    out["note_de"] = note_de
    out["note_en"] = note_en
    return out


# ---------------------------------------------------------------- wallets
L.wallet("w-kraken", "Kraken", "Kraken", "exchange", [
    {"id": "a-kraken-spot", "de": "Spot", "en": "Spot"},
    {"id": "a-kraken-dca", "de": "Sparplan", "en": "Savings plan"},
])
L.wallet("w-bitget", "Bitget", "Bitget", "exchange", [
    {"id": "a-bitget-spot", "de": "Spot (USDT)", "en": "Spot (USDT)"},
])
L.wallet("w-bitbox", "BitBox02", "BitBox02", "hardware", [
    {"id": "a-bitbox-cold", "de": "Cold Storage", "en": "Cold storage"},
    {"id": "a-bitbox-second", "de": "Zweitkonto", "en": "Second account"},
])
L.wallet("w-sparrow", "Sparrow", "Sparrow", "software", [
    {"id": "a-sparrow-hot", "de": "Hot Wallet", "en": "Hot wallet"},
])
L.wallet("w-paper", "Papier-Backup", "Paper backup", "paper", [
    {"id": "a-paper-vault", "de": "Tresor", "en": "Vault"},
])

# ------------------------------------------------------- Kraken / Spot
L.add("a-kraken-spot", tx(
    "k-buy-1", "buy", "2023-06-15T10:15:00.000Z", "0.25", price="24000", total="6000",
    fee_fiat="9.60",
    note_de="Erstkauf per SEPA-Überweisung",
    note_en="First purchase by SEPA transfer"))
L.add("a-kraken-spot", tx(
    "k-buy-2", "buy", "2023-11-02T08:40:00.000Z", "0.15", total="5250", fee_fiat="8.40",
    note_de="Nachkauf, nur Gesamtbetrag im Beleg",
    note_en="Follow-up buy, receipt shows only the total"))
L.add("a-kraken-spot", tx(
    "k-buy-3", "buy", "2024-04-10T16:05:00.000Z", "0.2", price="58000", fee_btc="0.0002",
    note_de="Kauf kurz nach dem Halving, Gebühr in BTC abgezogen",
    note_en="Bought shortly after the halving, fee charged in BTC"))
L.add("a-kraken-spot", tx(
    "k-buy-old", "buy", "2023-02-01T12:00:00.000Z", "0.01",
    note_de="Beispiel: alter Kauf ohne EUR-Beleg — die Datenqualität meldet ihn, der Kurs lässt sich im Dialog aus der Historie ermitteln",
    note_en="Example: an old buy with no EUR figure — reported by the data quality check; the dialog can derive the rate from history"))
L.add("a-kraken-spot", tx(
    "k-sell-1", "sell", "2024-09-20T11:30:00.000Z", "0.1", price="52000", total="5200",
    fee_fiat="7.80", lots=[("k-buy-1", "0.1")],
    note_de="Teilverkauf, Haltefrist über einem Jahr → steuerfrei",
    note_en="Partial sale, held for more than a year → tax-free"))
L.add("a-kraken-spot", tx(
    "k-out-cold", "transfer_out", "2024-12-01T09:00:00.000Z", "0.3999", fee_btc="0.0001",
    lots=[("k-buy-1", "0.15"), ("k-buy-2", "0.15"), ("k-buy-3", "0.1")],
    counterparty="a-bitbox-cold", group="g-cold-1",
    note_de="Sammel-Auszahlung von drei Käufen auf die Hardware-Wallet",
    note_en="Batched withdrawal of three buys to the hardware wallet"))
L.add("a-kraken-spot", tx(
    "k-sell-2", "sell", "2026-03-05T15:45:00.000Z", "0.05", total="5900", fee_fiat="8.85",
    lots=[("k-buy-3", "0.05")],
    note_de="Gewinnmitnahme, Haltefrist über einem Jahr",
    note_en="Taking profit, held for more than a year"))
L.add("a-kraken-spot", tx(
    "k-buy-4", "buy", "2026-07-20T07:55:00.000Z", "0.03", total="3450",
    note_de="Nachkauf; Haltefrist läuft noch",
    note_en="Follow-up buy; holding period still running"))
L.add("a-kraken-spot", tx(
    "k-sell-3", "sell", "2026-07-30T13:05:00.000Z", "0.01", price="121000", total="1210",
    fee_fiat="1.82", lots=[("k-buy-4", "0.01")],
    note_de="Kurzfristiger Verkauf innerhalb der Haltefrist → steuerpflichtiger Gewinn",
    note_en="Sold inside the holding period → taxable gain"))
# The one deliberate gap: a transfer nobody has assigned yet.
L.add("a-kraken-spot", tx(
    "k-out-open", "transfer_out", "2026-07-25T10:10:00.000Z", "0.008",
    counterparty="a-sparrow-hot", group="g-open-1",
    note_de="Beispiel: Zuordnung fehlt noch — welche Käufe hier abgehen, entscheidet ausschließlich die manuelle Zuordnung im Dialog",
    note_en="Example: not assigned yet — which buys leave here is decided solely by the manual assignment in the dialog"))

# ------------------------------------------------- Kraken / Sparplan (DCA)
dca_prices = ["92000", "88000", "95000", "101000", "99000", "104000",
              "112000", "108000", "115000", "121000", "118000", "124000"]
dca_ids = []
for i, price in enumerate(dca_prices):
    year = 2025 + (7 + i) // 12
    month = (7 + i) % 12 + 1
    tid = f"k-dca-{i + 1}"
    dca_ids.append(tid)
    L.add("a-kraken-dca", tx(
        tid, "buy", f"{year}-{month:02d}-01T06:30:00.000Z", "0.006",
        price=price if i % 2 == 0 else None,
        total=None if i % 2 == 0 else str(D(price) * d("0.006")),
        fee_fiat="0.99",
        note_de="Sparplan-Ausführung",
        note_en="Savings plan execution"))

# Bundle eight DCA lots plus a slice of the ninth into one withdrawal.
dca_lots = [(tid, "0.006") for tid in dca_ids[:8]] + [(dca_ids[8], "0.00205")]
L.add("a-kraken-dca", tx(
    "k-out-dca", "transfer_out", "2026-06-20T09:15:00.000Z", "0.05", fee_btc="0.00005",
    lots=dca_lots, counterparty="a-bitbox-cold", group="g-cold-2",
    note_de="Sparplan-Bestand auf die Hardware-Wallet — neun Käufe in einer Transaktion (Beispiel ohne erfasste Txid)",
    note_en="Savings-plan holdings to the hardware wallet — nine buys in one transaction (example without a recorded txid)"))

# ------------------------------------------------------- Bitget (USDT)
L.add("a-bitget-spot", tx(
    "b-buy-1", "buy", "2025-02-10T13:20:00.000Z", "0.04", price="84500", total="3380",
    orig=("USDT", "3600", "90000"), eur_source="binance-klines",
    note_de="Kauf gegen USDT; EUR-Wert aus dem historischen Kurs ermittelt",
    note_en="Bought against USDT; EUR value derived from the historical rate"))
L.add("a-bitget-spot", tx(
    "b-buy-2", "buy", "2025-08-15T17:05:00.000Z", "0.025", price="95000", total="2375",
    orig=("USDT", "2750", "110000"), eur_source="binance-klines",
    note_de="Kauf gegen USDT",
    note_en="Bought against USDT"))
L.add("a-bitget-spot", tx(
    "b-out-sparrow", "transfer_out", "2025-09-01T10:00:00.000Z", "0.0649", fee_btc="0.0001",
    lots=[("b-buy-1", "0.04"), ("b-buy-2", "0.025")],
    counterparty="a-sparrow-hot", group="g-sparrow-1", txid=TXID["t2"],
    note_de="Abzug von der Börse in die eigene Software-Wallet",
    note_en="Off the exchange into my own software wallet"))

# ------------------------------------------------------------- BitBox02
L.add("a-bitbox-cold", tx(
    "bb-in-1", "transfer_in", "2024-12-01T09:52:00.000Z", "0.3999",
    counterparty="a-kraken-spot", group="g-cold-1",
    txid=TXID["t1"], address=ADDR["cold1"],
    note_de="Eingang von Kraken; Txid und Adresse stammen aus der Hardware-Wallet und gelten für beide Seiten",
    note_en="Received from Kraken; txid and address come from the hardware wallet and count for both legs"))
L.add("a-bitbox-cold", tx(
    "bb-in-2", "transfer_in", "2026-06-20T09:58:00.000Z", "0.05",
    counterparty="a-kraken-dca", group="g-cold-2",
    note_de="Eingang des Sparplan-Bestands",
    note_en="Savings-plan holdings received"))
L.add("a-bitbox-cold", tx(
    "bb-out-paper", "transfer_out", "2026-02-01T14:00:00.000Z", "0.15", fee_btc="0.00008",
    lots=[("bb-in-1", "0.15008")],
    counterparty="a-paper-vault", group="g-paper-1",
    txid=TXID["paper"], address=ADDR["paper"],
    note_de="Langfrist-Anteil auf das Papier-Backup — zweiter Schritt der Kette Kraken → BitBox02 → Papier",
    note_en="Long-term share to the paper backup — second hop of the chain Kraken → BitBox02 → paper"))
# One send, two arrivals (one transaction paying two of my own outputs).
L.add("a-bitbox-cold", tx(
    "bb-in-split-1", "transfer_in", "2026-04-12T18:22:00.000Z", "0.02",
    counterparty="a-sparrow-hot", group="g-split-1",
    txid=TXID["split"], address=ADDR["cold2"],
    note_de="Eine Transaktion, zwei eigene Ausgänge: dieser Teil landet im Cold Storage",
    note_en="One transaction, two of my own outputs: this part lands in cold storage"))
L.add("a-bitbox-second", tx(
    "bb-in-split-2", "transfer_in", "2026-04-12T18:22:00.000Z", "0.0099",
    counterparty="a-sparrow-hot", group="g-split-1",
    txid=TXID["split"], address=ADDR["second"],
    note_de="Zweiter Ausgang derselben Transaktion",
    note_en="Second output of the same transaction"))

# --------------------------------------------------------------- Sparrow
L.add("a-sparrow-hot", tx(
    "sp-in-bitget", "transfer_in", "2025-09-01T10:31:00.000Z", "0.0649",
    counterparty="a-bitget-spot", group="g-sparrow-1",
    txid=TXID["t2"], address=ADDR["sparrow"],
    note_de="Eingang von Bitget",
    note_en="Received from Bitget"))
L.add("a-sparrow-hot", tx(
    "sp-in-invoice", "transfer_in", "2026-01-20T09:05:00.000Z", "0.005", price="104000",
    txid=TXID["ext"], address=ADDR["sparrow"],
    note_de="Bezahlung eines Auftrags in BTC — externer Zugang mit bekanntem Gegenwert",
    note_en="An invoice paid in BTC — external receive with a known value"))
L.add("a-sparrow-hot", tx(
    "sp-in-gift", "transfer_in", "2026-02-14T20:10:00.000Z", "0.0015",
    note_de="Geschenk, Einstand unbekannt — Menge zählt zum Bestand, nicht zur Einstandsbasis",
    note_en="A gift, cost unknown — counts towards the holding, not towards the cost basis"))
L.add("a-sparrow-hot", tx(
    "sp-out-split", "transfer_out", "2026-04-12T18:15:00.000Z", "0.0299", fee_btc="0.0001",
    lots=[("sp-in-bitget", "0.03")],
    counterparty="a-bitbox-cold", group="g-split-1", txid=TXID["split"],
    note_de="Eine Transaktion an zwei eigene Adressen; die Adresse steht deshalb an den Eingängen, nicht hier",
    note_en="One transaction to two of my own addresses; the address therefore sits on the arrivals, not here"))
L.add("a-sparrow-hot", tx(
    "sp-out-friend", "transfer_out", "2026-05-05T19:40:00.000Z", "0.004", fee_btc="0.00002",
    lots=[("sp-in-invoice", "0.00402")],
    txid=TXID["spend"], address=ADDR["friend"],
    note_de="Externer Versand an eine fremde Adresse",
    note_en="External send to somebody else's address"))
L.add("a-sparrow-hot", tx(
    "sp-spend", "spend", "2026-06-10T12:35:00.000Z", "0.0008", price="119000",
    lots=[("sp-in-bitget", "0.0008")],
    note_de="Mit BTC bezahlt (Hardware gekauft)",
    note_en="Paid with BTC (bought hardware)"))
L.add("a-sparrow-hot", tx(
    "sp-in-open", "transfer_in", "2026-07-25T10:18:00.000Z", "0.008",
    counterparty="a-kraken-spot", group="g-open-1",
    note_de="Gegenstück der noch nicht zugeordneten Auszahlung — die Herkunft bleibt offen, bis die Käufe zugeordnet sind",
    note_en="Counterpart of the unassigned withdrawal — its origin stays open until the buys are assigned"))

# ---------------------------------------------------------- Paper backup
# Recorded five minutes BEFORE the send it belongs to: two exports, two clocks.
L.add("a-paper-vault", tx(
    "pp-in-1", "transfer_in", "2026-02-01T13:55:00.000Z", "0.15",
    counterparty="a-bitbox-cold", group="g-paper-1",
    txid=TXID["paper"], address=ADDR["paper"],
    note_de="Eingang auf dem Papier-Backup; hier eine Minute vor dem Versand erfasst (unterschiedliche Uhren)",
    note_en="Received on the paper backup; recorded before the send here (two clocks disagree)"))

# --------------------------------------------------------------- checks
for tid, claimed in L.allocated.items():
    have = L.credited.get(tid)
    assert have is not None, f"allocation points at a non-lot: {tid}"
    assert claimed <= have, f"lot {tid} over-allocated: {claimed} > {have}"
for acc, bal in L.balance.items():
    assert bal >= 0, f"negative balance in {acc}: {bal}"
print("balances:", {k: str(v) for k, v in L.balance.items()})
print("total:", sum(L.balance.values()))

WIDGETS = [
    # 12 columns; every tile at or above its minimum size, no overlaps, and the
    # arrangement is a fixed point of the grid's compaction (tests assert all
    # three, so the demo cannot mark itself as edited just by being looked at).
    ("portfolioValue", 0, 0, 4, 4), ("pnl", 4, 0, 4, 4), ("btcPrice", 8, 0, 4, 4),
    ("portfolioChart", 0, 4, 8, 8), ("satsStack", 8, 4, 4, 4),
    ("avgCost", 8, 8, 4, 4),
    ("priceEntries", 0, 12, 8, 8), ("holdingPeriod", 8, 12, 4, 4),
    ("custody", 8, 16, 4, 4),
    ("walletBreakdown", 0, 20, 6, 6), ("dca", 6, 20, 6, 6),
    ("holdingComposition", 0, 26, 4, 6), ("networkFees", 4, 26, 4, 5),
    ("halving", 8, 26, 4, 6),
    ("dataQuality", 4, 31, 4, 3),
]


def build(lang):
    def pick(obj):
        return obj[lang]

    wallets = []
    for w in L.wallets:
        wallets.append({
            "id": w["id"],
            "name": pick(w),
            "type": w["type"],
            "accounts": [
                {
                    "id": a["id"],
                    "name": pick(a),
                    "transactions": [
                        {**{k: v for k, v in t.items() if not k.startswith("note_")},
                         "note": t[f"note_{lang}"]}
                        for t in a["transactions"]
                    ],
                }
                for a in w["accounts"]
            ],
        })

    return {
        "version": "1.0",
        "settings": {
            "locale": lang,
            "currencyDisplay": "EUR",
            "theme": "ocean",
            "holdingPeriodDays": 365,
            "costBasisMethod": "FIFO",
            "autosaveDebounceMs": 1500,
        },
        "wallets": wallets,
        "watchedAddresses": [
            {
                "id": "wa-cold-1", "type": "address", "value": ADDR["cold1"],
                "label": "BitBox02 – Empfangsadresse 1" if lang == "de" else "BitBox02 – receiving address 1",
                "tags": ["hardware-wallet", "non-kyc"],
            },
            {
                "id": "wa-sparrow-xpub", "type": "zpub",
                "value": "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs",
                "label": "Sparrow – Konto 1 (zpub)" if lang == "de" else "Sparrow – account 1 (zpub)",
                "tags": ["software-wallet"],
            },
            {
                "id": "wa-kraken-xpub", "type": "xpub",
                "value": "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz",
                "label": "Börsen-Auszahlungen (xpub, KYC)" if lang == "de" else "Exchange withdrawals (xpub, KYC)",
                "tags": ["kyc", "exchange"],
            },
        ],
        "explorerSettings": {"provider": "mempool.space"},
        "utxoLabels": [
            {
                "outpoint": f"{TXID['t1']}:0",
                "label": "Sammel-Auszahlung Kraken" if lang == "de" else "Batched Kraken withdrawal",
                "tags": ["kyc"],
            },
            {
                "outpoint": f"{TXID['ext']}:1",
                "label": "Auftragszahlung" if lang == "de" else "Invoice payment",
                "tags": ["non-kyc"],
            },
        ],
        "importPresets": [
            {
                "id": "preset-demo-exchange",
                "name": "Beispiel: Börsen-Export" if lang == "de" else "Example: exchange export",
                "delimiter": ",",
                "decimalSeparator": ".",
                "encoding": "utf-8",
                "dateFormat": "iso",
                "timeFormat": "datetime",
                "amountUnit": "btc",
                "feeUnit": "btc",
                "feeBtcModeIn": "deducted",
                "feeBtcModeOut": "notDeducted",
                "feeFiatMode": "net",
                "mapping": {
                    "type": "Operation",
                    "date": "Timestamp",
                    "time": "Timestamp",
                    "amountBtc": "Amount BTC",
                    "pricePerBtcEur": "Price EUR",
                    "feeFiatEur": "Fee EUR",
                    "txid": "Transaction ID",
                },
                "typeValueMapping": {
                    "buy": "buy", "sell": "sell",
                    "deposit": "transfer_in", "withdrawal": "transfer_out",
                },
                "rowFilter": {
                    "combinator": "and",
                    "rules": [
                        {"column": "Asset", "match": "isAnyOf", "values": ["BTC"]},
                        {"column": "Status", "match": "isNoneOf", "values": ["cancelled"]},
                    ],
                },
            }
        ],
        "uiSettings": {
            "dashboardLayout": [
                {"i": f"{wid}-1", "widgetId": wid, "x": x, "y": y, "w": w, "h": h}
                for wid, x, y, w, h in WIDGETS
            ],
            "transactionColumns": [
                "date", "type", "taxStatus", "walletAccount", "amount", "price",
                "value", "originalCurrency", "txid",
            ],
        },
    }


for lang, path in (("de", "public/demo-portfolio.json"), ("en", "public/demo-portfolio.en.json")):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(build(lang), f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote", path)
