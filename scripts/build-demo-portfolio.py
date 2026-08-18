#!/usr/bin/env python3
"""Builds the shipped demo portfolios: public/demo-portfolio{,.en}.json.

    python3 scripts/build-demo-portfolio.py

Both files have to describe the *same* ledger — only the notes and labels a
reader sees differ — so they are generated from one structure instead of being
edited twice. The demo is also the worked example of every feature, which is
why the ledger below deliberately contains every constellation the app knows:
all wallet types, all transaction types, batched and chained and split
transfers, foreign-currency settlement, external receives and sends, fees of
each kind, disposals on both sides of the holding period in three tax years,
and exactly one unassigned transfer as the example of an open lot assignment.

It also has to have *volume*. A heatmap, a DCA overview, a fee balance or the
price chart's marker aggregation say nothing about five transactions, so the
file carries three years of a weekly savings plan and a year of a daily one
(several hundred buys), swept into cold storage in batches of dozens of lots at
a time.

Every price in here comes from `price_at`, i.e. from the day's actual BTC/EUR
close (scripts/data/btc-eur-daily.json, refreshed by scripts/fetch-demo-prices.py
— the very source the app charts). Nothing is invented: a demo that buys at
made-up prices draws its own buys and sells far away from the price line the
dashboard fetches from Binance, and every euro figure it shows is wrong in the
same way. The table is committed, so generating stays reproducible and offline.

What comes out is checked by lib/demoPortfolio.test.ts — balances, assignments,
the feature coverage and the volume — so run the tests after changing anything
here.
"""
import json
from collections import defaultdict
from decimal import Decimal as D
from pathlib import Path

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
    # A real bech32m address (BIP-350 test vector). The made-up one that used
    # to be here failed the app's own address check and made every demo visit
    # send three doomed requests to the explorer.
    "software": "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
    "paper": "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
    "friend": "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
}


def d(x):
    return D(str(x))


# ------------------------------------------------------------ price model
# The market, not a model of one: the committed table of daily BTC/EUR closes
# (scripts/fetch-demo-prices.py). Every euro figure in the demo is derived from
# it, so a demo trade sits on the price line the dashboard draws instead of
# somewhere above it.
_PRICE_FILE = Path(__file__).resolve().parent / "data" / "btc-eur-daily.json"
try:
    _CLOSES = {k: D(v) for k, v in json.loads(
        _PRICE_FILE.read_text(encoding="utf-8"))["closes"].items()}
except FileNotFoundError:  # pragma: no cover - a checkout without the table
    raise SystemExit(
        f"missing {_PRICE_FILE}\nRun: npm run demo:prices"
    )
_FIRST_DAY, _LAST_DAY = min(_CLOSES), max(_CLOSES)


def price_at(iso):
    """BTC/EUR close of that day, from the committed history.

    Refuses a day the table does not cover rather than guessing: an invented
    price is exactly what this file is here to stop, and the fix ("refresh the
    table") belongs in front of whoever is generating, not in the output.
    """
    day = iso[:10]
    if day in _CLOSES:
        return _CLOSES[day]
    if not (_FIRST_DAY <= day <= _LAST_DAY):
        raise SystemExit(
            f"no BTC/EUR close for {day} (history covers {_FIRST_DAY} … {_LAST_DAY}).\n"
            "Run: npm run demo:prices"
        )
    # Inside the covered span, so this is a day Binance has no candle for: the
    # last close before it is what the market last traded at.
    before = max(k for k in _CLOSES if k <= day)
    return _CLOSES[before]


# What a euro figure is quoted as when a transaction was settled in dollars.
# Documentation only (§3.2) — the ledger values everything in EUR — so one
# rounded rate is honest enough and keeps the demo free of a second history.
USD_PER_EUR = D("1.08")


def usd(amount_eur):
    """A EUR figure as the dollars it stood for, to the cent."""
    return (d(amount_eur) * USD_PER_EUR).quantize(D("0.01"))


def eur(amount_btc, price):
    """What an amount costs at a price, to the cent."""
    return (d(amount_btc) * d(price)).quantize(D("0.01"))


def priced(day, amount_btc):
    """That day's close and what the amount was worth at it."""
    price = price_at(day)
    return price, eur(amount_btc, price)


def _weekday(iso):
    """0 = Monday … 6 = Sunday."""
    from datetime import date

    return date.fromisoformat(iso).weekday()


def each_day(start, end, step_days=1):
    """ISO dates from start to end (inclusive), stepping whole days."""
    from datetime import date, timedelta

    cur = date.fromisoformat(start)
    last = date.fromisoformat(end)
    while cur <= last:
        yield cur.isoformat()
        cur += timedelta(days=step_days)


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
L.wallet("w-exchange", "Börse", "Exchange", "exchange", [
    {"id": "a-exchange-spot", "de": "Spot", "en": "Spot"},
    {"id": "a-exchange-dca", "de": "Sparplan", "en": "Savings plan"},
])
L.wallet("w-exchange2", "Börse 2", "Exchange 2", "exchange", [
    {"id": "a-exchange2-spot", "de": "Spot (USDT)", "en": "Spot (USDT)"},
])
L.wallet("w-hardware", "Hardware-Wallet", "Hardware wallet", "hardware", [
    {"id": "a-hardware-cold", "de": "Cold Storage", "en": "Cold storage"},
    {"id": "a-hardware-second", "de": "Zweitkonto", "en": "Second account"},
])
L.wallet("w-software", "Software-Wallet", "Software wallet", "software", [
    {"id": "a-software-hot", "de": "Hot Wallet", "en": "Hot wallet"},
])
L.wallet("w-paper", "Papier-Backup", "Paper backup", "paper", [
    {"id": "a-paper-vault", "de": "Tresor", "en": "Vault"},
])
L.wallet("w-broker", "Sparplan-Anbieter", "Savings plan provider", "exchange", [
    {"id": "a-broker-weekly", "de": "Wochen-Sparplan", "en": "Weekly savings plan"},
    {"id": "a-broker-daily", "de": "Tages-Sparplan", "en": "Daily savings plan"},
])
L.wallet("w-hardware2", "Hardware-Wallet 2", "Hardware wallet 2", "hardware", [
    {"id": "a-hardware2-vault", "de": "Langfrist", "en": "Long term"},
])

# ------------------------------------------------------- Börse / Spot
_price, _total = priced("2023-06-15", "0.25")
L.add("a-exchange-spot", tx(
    "k-buy-1", "buy", "2023-06-15T10:15:00.000Z", "0.25", price=_price, total=_total,
    fee_fiat="9.60",
    note_de="Erstkauf per SEPA-Überweisung",
    note_en="First purchase by SEPA transfer"))
L.add("a-exchange-spot", tx(
    "k-buy-2", "buy", "2023-11-02T08:40:00.000Z", "0.15",
    total=priced("2023-11-02", "0.15")[1], fee_fiat="8.40",
    note_de="Nachkauf, nur Gesamtbetrag im Beleg",
    note_en="Follow-up buy, receipt shows only the total"))
L.add("a-exchange-spot", tx(
    "k-buy-3", "buy", "2024-04-10T16:05:00.000Z", "0.2", price=price_at("2024-04-10"),
    fee_btc="0.0002",
    note_de="Kauf kurz nach dem Halving, Gebühr in BTC abgezogen",
    note_en="Bought shortly after the halving, fee charged in BTC"))
L.add("a-exchange-spot", tx(
    "k-buy-old", "buy", "2023-02-01T12:00:00.000Z", "0.01",
    note_de="Beispiel: alter Kauf ohne EUR-Beleg — die Datenqualität meldet ihn, der Kurs lässt sich im Dialog aus der Historie ermitteln",
    note_en="Example: an old buy with no EUR figure — reported by the data quality check; the dialog can derive the rate from history"))
_price, _total = priced("2024-09-20", "0.1")
L.add("a-exchange-spot", tx(
    "k-sell-1", "sell", "2024-09-20T11:30:00.000Z", "0.1", price=_price, total=_total,
    fee_fiat="7.80", lots=[("k-buy-1", "0.1")],
    note_de="Teilverkauf, Haltefrist über einem Jahr → steuerfrei",
    note_en="Partial sale, held for more than a year → tax-free"))
L.add("a-exchange-spot", tx(
    "k-out-cold", "transfer_out", "2024-12-01T09:00:00.000Z", "0.3999", fee_btc="0.0001",
    lots=[("k-buy-1", "0.15"), ("k-buy-2", "0.15"), ("k-buy-3", "0.1")],
    counterparty="a-hardware-cold", group="g-cold-1",
    note_de="Sammel-Auszahlung von drei Käufen auf die Hardware-Wallet",
    note_en="Batched withdrawal of three buys to the hardware wallet"))
# Sold well above what that lot cost, and more than a year after it — the
# dates are picked so the note stays true against the real price history.
L.add("a-exchange-spot", tx(
    "k-sell-2", "sell", "2025-07-14T15:45:00.000Z", "0.05",
    total=priced("2025-07-14", "0.05")[1], fee_fiat="8.85",
    lots=[("k-buy-3", "0.05")],
    note_de="Gewinnmitnahme, Haltefrist über einem Jahr",
    note_en="Taking profit, held for more than a year"))
L.add("a-exchange-spot", tx(
    "k-buy-4", "buy", "2026-02-10T07:55:00.000Z", "0.03",
    total=priced("2026-02-10", "0.03")[1],
    note_de="Nachkauf; Haltefrist läuft noch",
    note_en="Follow-up buy; holding period still running"))
_price, _total = priced("2026-05-04", "0.01")
L.add("a-exchange-spot", tx(
    "k-sell-3", "sell", "2026-05-04T13:05:00.000Z", "0.01", price=_price, total=_total,
    fee_fiat="1.82", lots=[("k-buy-4", "0.01")],
    note_de="Kurzfristiger Verkauf innerhalb der Haltefrist → steuerpflichtiger Gewinn",
    note_en="Sold inside the holding period → taxable gain"))
# The one deliberate gap: a transfer nobody has assigned yet.
L.add("a-exchange-spot", tx(
    "k-out-open", "transfer_out", "2026-07-25T10:10:00.000Z", "0.008",
    counterparty="a-software-hot", group="g-open-1",
    note_de="Beispiel: Zuordnung fehlt noch — welche Käufe hier abgehen, entscheidet ausschließlich die manuelle Zuordnung im Dialog",
    note_en="Example: not assigned yet — which buys leave here is decided solely by the manual assignment in the dialog"))

# -------------------------------------------------- Börse / Sparplan (DCA)
# Twelve monthly executions; every other one records only the total, the way
# half the exchange exports do.
dca_ids = []
for i in range(12):
    year = 2025 + (7 + i) // 12
    month = (7 + i) % 12 + 1
    day = f"{year}-{month:02d}-01"
    price, total = priced(day, "0.006")
    tid = f"k-dca-{i + 1}"
    dca_ids.append(tid)
    L.add("a-exchange-dca", tx(
        tid, "buy", f"{day}T06:30:00.000Z", "0.006",
        price=price if i % 2 == 0 else None,
        total=None if i % 2 == 0 else total,
        fee_fiat="0.99",
        note_de="Sparplan-Ausführung",
        note_en="Savings plan execution"))

# Bundle eight DCA lots plus a slice of the ninth into one withdrawal.
dca_lots = [(tid, "0.006") for tid in dca_ids[:8]] + [(dca_ids[8], "0.00205")]
L.add("a-exchange-dca", tx(
    "k-out-dca", "transfer_out", "2026-06-20T09:15:00.000Z", "0.05", fee_btc="0.00005",
    lots=dca_lots, counterparty="a-hardware-cold", group="g-cold-2",
    note_de="Sparplan-Bestand auf die Hardware-Wallet — neun Käufe in einer Transaktion (Beispiel ohne erfasste Txid)",
    note_en="Savings-plan holdings to the hardware wallet — nine buys in one transaction (example without a recorded txid)"))

# ------------------------------------------------------ Börse 2 (USDT)
_price, _total = priced("2025-02-10", "0.04")
L.add("a-exchange2-spot", tx(
    "b-buy-1", "buy", "2025-02-10T13:20:00.000Z", "0.04", price=_price, total=_total,
    orig=("USDT", usd(_total), usd(_price)), eur_source="binance-klines",
    note_de="Kauf gegen USDT; EUR-Wert aus dem historischen Kurs ermittelt",
    note_en="Bought against USDT; EUR value derived from the historical rate"))
_price, _total = priced("2025-08-15", "0.025")
L.add("a-exchange2-spot", tx(
    "b-buy-2", "buy", "2025-08-15T17:05:00.000Z", "0.025", price=_price, total=_total,
    orig=("USDT", usd(_total), usd(_price)), eur_source="binance-klines",
    note_de="Kauf gegen USDT",
    note_en="Bought against USDT"))
L.add("a-exchange2-spot", tx(
    "b-out-software", "transfer_out", "2025-09-01T10:00:00.000Z", "0.0649", fee_btc="0.0001",
    lots=[("b-buy-1", "0.04"), ("b-buy-2", "0.025")],
    counterparty="a-software-hot", group="g-software-1", txid=TXID["t2"],
    note_de="Abzug von der Börse in die eigene Software-Wallet",
    note_en="Off the exchange into my own software wallet"))

# ------------------------------------------------------ Hardware-Wallet
L.add("a-hardware-cold", tx(
    "bb-in-1", "transfer_in", "2024-12-01T09:52:00.000Z", "0.3999",
    counterparty="a-exchange-spot", group="g-cold-1",
    txid=TXID["t1"], address=ADDR["cold1"],
    note_de="Eingang von der Börse; Txid und Adresse stammen aus der Hardware-Wallet und gelten für beide Seiten",
    note_en="Received from the exchange; txid and address come from the hardware wallet and count for both legs"))
L.add("a-hardware-cold", tx(
    "bb-in-2", "transfer_in", "2026-06-20T09:58:00.000Z", "0.05",
    counterparty="a-exchange-dca", group="g-cold-2",
    note_de="Eingang des Sparplan-Bestands",
    note_en="Savings-plan holdings received"))
L.add("a-hardware-cold", tx(
    "bb-out-paper", "transfer_out", "2026-02-01T14:00:00.000Z", "0.15", fee_btc="0.00008",
    lots=[("bb-in-1", "0.15008")],
    counterparty="a-paper-vault", group="g-paper-1",
    txid=TXID["paper"], address=ADDR["paper"],
    note_de="Langfrist-Anteil auf das Papier-Backup — zweiter Schritt der Kette Börse → Hardware-Wallet → Papier",
    note_en="Long-term share to the paper backup — second hop of the chain exchange → hardware wallet → paper"))
# One send, two arrivals (one transaction paying two of my own outputs).
L.add("a-hardware-cold", tx(
    "bb-in-split-1", "transfer_in", "2026-04-12T18:22:00.000Z", "0.02",
    counterparty="a-software-hot", group="g-split-1",
    txid=TXID["split"], address=ADDR["cold2"],
    note_de="Eine Transaktion, zwei eigene Ausgänge: dieser Teil landet im Cold Storage",
    note_en="One transaction, two of my own outputs: this part lands in cold storage"))
L.add("a-hardware-second", tx(
    "bb-in-split-2", "transfer_in", "2026-04-12T18:22:00.000Z", "0.0099",
    counterparty="a-software-hot", group="g-split-1",
    txid=TXID["split"], address=ADDR["second"],
    note_de="Zweiter Ausgang derselben Transaktion",
    note_en="Second output of the same transaction"))

# -------------------------------------------------------- Software-Wallet
L.add("a-software-hot", tx(
    "sp-in-exchange2", "transfer_in", "2025-09-01T10:31:00.000Z", "0.0649",
    counterparty="a-exchange2-spot", group="g-software-1",
    txid=TXID["t2"], address=ADDR["software"],
    note_de="Eingang von Börse 2",
    note_en="Received from exchange 2"))
L.add("a-software-hot", tx(
    "sp-in-invoice", "transfer_in", "2026-01-20T09:05:00.000Z", "0.005",
    price=price_at("2026-01-20"),
    txid=TXID["ext"], address=ADDR["software"],
    note_de="Bezahlung eines Auftrags in BTC — externer Zugang mit bekanntem Gegenwert",
    note_en="An invoice paid in BTC — external receive with a known value"))
L.add("a-software-hot", tx(
    "sp-in-gift", "transfer_in", "2026-02-14T20:10:00.000Z", "0.0015",
    note_de="Geschenk, Einstand unbekannt — Menge zählt zum Bestand, nicht zur Einstandsbasis",
    note_en="A gift, cost unknown — counts towards the holding, not towards the cost basis"))
L.add("a-software-hot", tx(
    "sp-out-split", "transfer_out", "2026-04-12T18:15:00.000Z", "0.0299", fee_btc="0.0001",
    lots=[("sp-in-exchange2", "0.03")],
    counterparty="a-hardware-cold", group="g-split-1", txid=TXID["split"],
    note_de="Eine Transaktion an zwei eigene Adressen; die Adresse steht deshalb an den Eingängen, nicht hier",
    note_en="One transaction to two of my own addresses; the address therefore sits on the arrivals, not here"))
L.add("a-software-hot", tx(
    "sp-out-friend", "transfer_out", "2026-05-05T19:40:00.000Z", "0.004", fee_btc="0.00002",
    lots=[("sp-in-invoice", "0.00402")],
    txid=TXID["spend"], address=ADDR["friend"],
    note_de="Externer Versand an eine fremde Adresse",
    note_en="External send to somebody else's address"))
L.add("a-software-hot", tx(
    "sp-spend", "spend", "2026-06-10T12:35:00.000Z", "0.0008",
    price=price_at("2026-06-10"),
    lots=[("sp-in-exchange2", "0.0008")],
    note_de="Mit BTC bezahlt (Hardware gekauft)",
    note_en="Paid with BTC (bought hardware)"))
L.add("a-software-hot", tx(
    "sp-in-open", "transfer_in", "2026-07-25T10:18:00.000Z", "0.008",
    counterparty="a-exchange-spot", group="g-open-1",
    note_de="Gegenstück der noch nicht zugeordneten Auszahlung — die Herkunft bleibt offen, bis die Käufe zugeordnet sind",
    note_en="Counterpart of the unassigned withdrawal — its origin stays open until the buys are assigned"))

# ---------------------------------------------------------- Paper backup
# Recorded five minutes BEFORE the send it belongs to: two exports, two clocks.
L.add("a-paper-vault", tx(
    "pp-in-1", "transfer_in", "2026-02-01T13:55:00.000Z", "0.15",
    counterparty="a-hardware-cold", group="g-paper-1",
    txid=TXID["paper"], address=ADDR["paper"],
    note_de="Eingang auf dem Papier-Backup; hier eine Minute vor dem Versand erfasst (unterschiedliche Uhren)",
    note_en="Received on the paper backup; recorded before the send here (two clocks disagree)"))

# ------------------------------ Savings plan provider: a real DCA history
# The point of these is volume. Three years of a weekly plan and a year of a
# daily one give the heatmap, the DCA overview, the fee balance, the stack
# curve and the price chart's markers something to actually show — a handful of
# buys tells none of them anything, and a daily DCA is exactly the case the
# marker aggregation exists for.
weekly = []
for n, day in enumerate(each_day("2023-07-03", "2026-08-03", 7)):
    price = price_at(day)
    # The plan buys for a fixed sum, so the amount moves with the price.
    amount = (D("55") / price).quantize(D("0.00000001"))
    tid = f"r-week-{n + 1:03d}"
    weekly.append({"id": tid, "amount": amount, "day": day, "spent": False})
    L.add("a-broker-weekly", tx(
        tid, "buy", f"{day}T07:00:00.000Z", amount,
        price=price, total=eur(amount, price), fee_fiat="0.55",
        note_de=f"Wochen-Sparplan, Ausführung {n + 1}",
        note_en=f"Weekly savings plan, execution {n + 1}"))

daily = []
for n, day in enumerate(each_day("2025-08-01", "2026-08-08", 1)):
    # Four days a week, so the heatmap has gaps to show rather than a solid
    # block: nothing on Wednesdays, Saturdays and Sundays.
    if _weekday(day) in (2, 5, 6):
        continue
    price = price_at(day)
    amount = (D("12") / price).quantize(D("0.00000001"))
    tid = f"r-day-{n + 1:03d}"
    daily.append({"id": tid, "amount": amount, "day": day, "spent": False})
    L.add("a-broker-daily", tx(
        tid, "buy", f"{day}T06:15:00.000Z", amount,
        price=price, total=eur(amount, price), fee_fiat="0.12",
        note_de="Tages-Sparplan",
        note_en="Daily savings plan"))

# Lots held back from the sweeps, because a disposal has to come from
# somewhere: the ones nearest these days stay in the account until they are
# sold, one pair inside the holding period and one pair past it.
def reserve(lots, day, count):
    """Mark the `count` lots closest to `day` as spoken for, and return them."""
    from datetime import date

    target = date.fromisoformat(day)
    picked = sorted(lots, key=lambda l: abs((date.fromisoformat(l["day"]) - target).days))
    for lot in picked[:count]:
        lot["reserved"] = True
    return picked[:count]


# Bought where the market later rose, so "taxable gain" and "tax-free gain"
# are what the disposals below actually are — against the real price history,
# not against a story about it.
reserved_taxable = reserve(weekly, "2025-04-07", 2)   # sold in July 2025
reserved_taxfree = reserve(weekly, "2024-10-01", 2)   # sold in May 2026


def sweep(out_id, in_id, account, target_account, lots, day, fee_btc, group,
          txid=None, address=None, note_de="", note_en="", in_note_de="", in_note_en=""):
    """Move a batch of lots to cold storage: one send, one arrival.

    The allocations cover `amount + feeBtc` (§3.2), so the pair costs the
    portfolio exactly the network fee and nothing is left half-assigned.
    """
    moved = sum((lot["amount"] for lot in lots), D(0))
    amount = (moved - d(fee_btc)).quantize(D("0.00000001"))
    L.add(account, tx(
        out_id, "transfer_out", f"{day}T10:00:00.000Z", amount, fee_btc=fee_btc,
        lots=[(lot["id"], str(lot["amount"])) for lot in lots],
        counterparty=target_account, group=group, txid=txid,
        note_de=note_de, note_en=note_en))
    L.add(target_account, tx(
        in_id, "transfer_in", f"{day}T10:41:00.000Z", amount,
        counterparty=account, group=group, txid=txid, address=address,
        note_de=in_note_de, note_en=in_note_en))
    for lot in lots:
        lot["spent"] = True
    return amount


def due(lots, before):
    """Lots bought before a day that are neither swept nor reserved."""
    return [
        lot for lot in lots
        if lot["day"] < before and not lot["spent"] and not lot.get("reserved")
    ]


# Half-yearly sweeps of the weekly plan, quarterly ones of the daily plan.
for i, (day, fee, addr) in enumerate([
    ("2024-01-15", "0.00006", ADDR["cold2"]),
    ("2024-07-15", "0.00004", ADDR["cold1"]),
    ("2025-01-13", "0.00009", ADDR["cold2"]),
    ("2025-07-14", "0.00005", ADDR["cold1"]),
    ("2026-01-12", "0.00007", ADDR["cold2"]),
], start=1):
    lots = due(weekly, day)
    sweep(
        f"r-sweep-out-{i}", f"cc-sweep-in-{i}", "a-broker-weekly", "a-hardware2-vault",
        lots, day, fee, f"g-sweep-{i}", address=addr,
        note_de=f"Halbjahres-Abzug: {len(lots)} Sparplan-Käufe in einer Transaktion",
        note_en=f"Half-year sweep: {len(lots)} savings-plan buys in one transaction",
        in_note_de="Eingang des Sparplan-Bestands im Hardware-Wallet 2",
        in_note_en="Savings-plan holdings received on hardware wallet 2")

for i, (day, fee) in enumerate([
    ("2025-11-03", "0.00003"),
    ("2026-02-02", "0.00004"),
    ("2026-05-04", "0.00003"),
], start=1):
    lots = due(daily, day)
    sweep(
        f"r-sweep-daily-out-{i}", f"cc-sweep-daily-in-{i}", "a-broker-daily",
        "a-hardware2-vault", lots, day, fee, f"g-sweep-daily-{i}",
        address=ADDR["cold1"],
        note_de=f"Quartals-Abzug des Tages-Sparplans: {len(lots)} Käufe auf einmal",
        note_en=f"Quarterly sweep of the daily plan: {len(lots)} buys at once",
        in_note_de="Eingang des Tages-Sparplans",
        in_note_en="Daily savings plan received")


def dispose(tid, kind, account, day, lots, *, fee_fiat=None, note_de="", note_en=""):
    """A disposal of exactly the lots it names, so nothing is half-assigned."""
    amount = sum((lot["amount"] for lot in lots), D(0))
    price = price_at(day)
    L.add(account, tx(
        tid, kind, f"{day}T12:00:00.000Z", amount,
        price=price, total=eur(amount, price), fee_fiat=fee_fiat,
        lots=[(lot["id"], str(lot["amount"])) for lot in lots],
        note_de=note_de, note_en=note_en))
    for lot in lots:
        lot["spent"] = True


# Realised gains in two more tax years, so the exemption tracker and the
# realised/unrealised split have something to report.
dispose(
    "r-sell-2025", "sell", "a-broker-weekly", "2025-07-14", reserved_taxable,
    fee_fiat="0.85",
    note_de="Verkauf innerhalb der Haltefrist — steuerpflichtiger Gewinn im Steuerjahr 2025",
    note_en="Sold inside the holding period — a taxable gain in the 2025 tax year")
dispose(
    "r-sell-2026", "sell", "a-broker-weekly", "2026-05-04", reserved_taxfree,
    fee_fiat="0.90",
    note_de="Verkauf nach über einem Jahr Haltedauer — steuerfrei",
    note_en="Sold after more than a year — tax-free")

# Paying with BTC, more than once and from whole lots.
dispose(
    "r-spend-cafe", "spend", "a-broker-daily", "2026-06-29", due(daily, "2026-06-01")[:1],
    note_de="Mit Lightning bezahlt (Kaffee) — kleiner Betrag, vollständig gebucht",
    note_en="Paid over Lightning (coffee) — a small amount, fully booked")
dispose(
    "r-spend-server", "spend", "a-broker-daily", "2026-07-16", due(daily, "2026-06-15")[:2],
    note_de="Serverrechnung in BTC bezahlt",
    note_en="Server bill paid in BTC")

# ------------------------------------------- remaining documented cases
# A buy settled in US dollars rather than USDT, so the "settled in another
# currency" fields have an example of each shape (§3.2).
_price, _total = priced("2026-02-11", "0.012")
L.add("a-exchange2-spot", tx(
    "b-buy-usd", "buy", "2026-02-11T11:12:00.000Z", "0.012",
    price=_price, total=_total,
    orig=("USD", usd(_total), usd(_price)), eur_source="binance-klines",
    note_de="Kauf gegen USD; der EUR-Wert stammt aus dem Tageskurs, die Originalwährung ist nur Dokumentation",
    note_en="Bought against USD; the EUR value comes from that day's rate, the original currency is documentation only"))
# …and a sale settled in a foreign currency, which the ledger books in EUR too.
_price, _total = priced("2026-04-22", "0.012")
L.add("a-exchange2-spot", tx(
    "b-sell-usd", "sell", "2026-04-22T09:30:00.000Z", "0.012",
    price=_price, total=_total,
    fee_fiat="1.10", lots=[("b-buy-usd", "0.012")],
    orig=("USDT", usd(_total), usd(_price)), eur_source="binance-klines",
    note_de="Verkauf gegen USDT innerhalb der Haltefrist — steuerpflichtig, Bewertung in EUR",
    note_en="Sold against USDT inside the holding period — taxable, valued in EUR"))

# An outgoing leg that knows its address but not its txid, and an arrival that
# knows neither: both are what an exchange export actually looks like.
L.add("a-exchange-spot", tx(
    "k-out-partial", "transfer_out", "2026-05-12T08:05:00.000Z", "0.01", fee_btc="0.00004",
    lots=[("k-buy-3", "0.01004")],
    counterparty="a-hardware2-vault", group="g-partial-1", address=ADDR["cold1"],
    note_de="Auszahlung mit Adresse, aber ohne Txid im Export — die Txid trägt das Gegenstück nach",
    note_en="Withdrawal with an address but no txid in the export — the counterpart supplies it"))
L.add("a-hardware2-vault", tx(
    "cc-in-partial", "transfer_in", "2026-05-12T08:44:00.000Z", "0.01",
    counterparty="a-exchange-spot", group="g-partial-1", txid=TXID["t2"],
    note_de="Eingang im Hardware-Wallet 2; die Txid stammt hier aus der Wallet, die Adresse aus der Börse",
    note_en="Received on hardware wallet 2; the txid comes from the wallet here, the address from the exchange"))

# --------------------------------------------------------------- checks
for tid, claimed in L.allocated.items():
    have = L.credited.get(tid)
    assert have is not None, f"allocation points at a non-lot: {tid}"
    assert claimed <= have, f"lot {tid} over-allocated: {claimed} > {have}"
for acc, bal in L.balance.items():
    assert bal >= 0, f"negative balance in {acc}: {bal}"
print("balances:", {k: str(v) for k, v in L.balance.items()})
print("total:", sum(L.balance.values()))

# The dashboard the demo ships. It mirrors DEFAULT_BANDS in
# lib/dashboardLayout.ts — bands exactly 12 columns wide and uniform in height,
# which is what makes the arrangement a fixed point of the grid's compaction
# (otherwise merely looking at the demo would mark it as edited). A test
# compares the result against defaultDashboard(), so the two cannot drift.
BANDS = [
    (4, [("portfolioValue", 4), ("pnl", 4), ("btcPrice", 4)]),
    (5, [("satsStack", 4), ("avgCost", 4), ("custody", 4)]),
    (8, [("portfolioChart", 8), ("whatIf", 4)]),
    (8, [("priceEntries", 8), ("holdingPeriod", 4)]),
    (6, [("buyHeatmap", 8), ("dca", 4)]),
    (7, [("stackHistory", 6), ("holdingComposition", 6)]),
    (6, [("walletBreakdown", 6), ("feeBalance", 3), ("dataQuality", 3)]),
    (7, [("taxFreeProceeds", 6), ("exemptionLimit", 6)]),
    (6, [("utxoOverview", 4), ("watchlistStatus", 4), ("blockClock", 4)]),
    (6, [("milestones", 6), ("yearInReview", 6)]),
    (6, [("networkFees", 4), ("halving", 4), ("timeInMarket", 4)]),
]

WIDGETS = []
_y = 0
for _h, _band in BANDS:
    _x = 0
    for _wid, _w in _band:
        WIDGETS.append((_wid, _x, _y, _w, _h))
        _x += _w
    assert _x == 12, f"band at y={_y} is {_x} columns wide"
    _y += _h


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
                "label": "Hardware-Wallet – Empfangsadresse 1" if lang == "de" else "Hardware wallet – receiving address 1",
                "tags": ["hardware-wallet", "non-kyc"],
            },
            {
                "id": "wa-software-xpub", "type": "zpub",
                "value": "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs",
                "label": "Software-Wallet – Konto 1 (zpub)" if lang == "de" else "Software wallet – account 1 (zpub)",
                "tags": ["software-wallet"],
            },
            {
                "id": "wa-taproot", "type": "address", "value": ADDR["software"],
                "label": "Software-Wallet – Taproot-Empfang" if lang == "de" else "Software wallet – taproot receive",
                "tags": ["software-wallet", "non-kyc", "taproot"],
            },
            {
                "id": "wa-legacy", "type": "address", "value": ADDR["paper"],
                "label": "Papier-Backup (P2SH, altes Format)" if lang == "de" else "Paper backup (P2SH, legacy format)",
                "tags": ["paper-wallet", "legacy"],
            },
            {
                "id": "wa-cold-2", "type": "address", "value": ADDR["cold2"],
                "label": "Hardware-Wallet – Empfangsadresse 2" if lang == "de" else "Hardware wallet – receiving address 2",
                "tags": ["hardware-wallet", "non-kyc"],
            },
            {
                "id": "wa-second", "type": "address", "value": ADDR["second"],
                "label": "Hardware-Wallet – Zweitkonto" if lang == "de" else "Hardware wallet – second account",
                "tags": ["hardware-wallet"],
            },
            {
                "id": "wa-exchange-xpub", "type": "xpub",
                "value": "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz",
                "label": "Börsen-Auszahlungen (xpub, KYC)" if lang == "de" else "Exchange withdrawals (xpub, KYC)",
                "tags": ["kyc", "exchange"],
            },
        ],
        "explorerSettings": {"provider": "mempool.space"},
        "utxoLabels": [
            {
                "outpoint": f"{TXID['t1']}:0",
                "label": "Sammel-Auszahlung von der Börse" if lang == "de" else "Batched exchange withdrawal",
                "tags": ["kyc"],
            },
            {
                "outpoint": f"{TXID['ext']}:1",
                "label": "Auftragszahlung" if lang == "de" else "Invoice payment",
                "tags": ["non-kyc"],
            },
            {
                "outpoint": f"{TXID['split']}:0",
                "label": "Software-Wallet → Cold Storage" if lang == "de" else "Software wallet → cold storage",
                "tags": ["non-kyc", "consolidate"],
            },
            {
                "outpoint": f"{TXID['split']}:1",
                "label": "Software-Wallet → Zweitkonto" if lang == "de" else "Software wallet → second account",
                "tags": ["non-kyc"],
            },
            {
                "outpoint": f"{TXID['paper']}:0",
                "label": "Langfrist-Reserve, nicht anfassen" if lang == "de" else "Long-term reserve, do not touch",
                "tags": ["cold", "do-not-spend"],
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
            },
            {
                # Deliberately unlike the first one: semicolons, German dates,
                # amounts in sats, one fixed transaction type, and the fee
                # already inside the amount. Between the two, every question
                # the wizard can ask has an example.
                "id": "preset-demo-sparplan",
                "name": "Beispiel: Sparplan-Export (Sats, DE-Datum)" if lang == "de"
                        else "Example: savings-plan export (sats, DE dates)",
                "delimiter": ";",
                "decimalSeparator": ",",
                "encoding": "iso-8859-15",
                "dateFormat": "de",
                "timeFormat": "hms",
                "amountUnit": "sats",
                "feeUnit": "sats",
                "fixedType": "buy",
                "feeBtcModeIn": "notDeducted",
                "feeBtcModeOut": "notDeducted",
                "feeFiatMode": "gross",
                "mapping": {
                    "date": "Datum",
                    "time": "Uhrzeit",
                    "amountBtc": "Menge (sats)",
                    "totalFiatEur": "Betrag EUR",
                    "feeFiatEur": "Gebuehr EUR",
                    "note": "Bemerkung",
                },
                "typeValueMapping": {},
                "rowFilter": {
                    "combinator": "or",
                    "rules": [
                        {"column": "Ausfuehrung", "match": "isAnyOf",
                         "values": ["ausgefuehrt", "teilausgefuehrt"]},
                    ],
                },
            },
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
