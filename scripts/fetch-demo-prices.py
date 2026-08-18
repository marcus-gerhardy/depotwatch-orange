#!/usr/bin/env python3
"""Refreshes the price table the demo portfolio is generated from.

    python3 scripts/fetch-demo-prices.py        # npm run demo:prices

Writes scripts/data/btc-eur-daily.json: the daily BTC/EUR closes from Binance,
the very source the app charts (lib/binance.ts). That is the point of this
script.

The demo used to invent its prices — monthly anchors somebody typed out, plus a
wobble. Invented prices are wrong twice over: they are already wrong for months
that have been and gone, and they keep drifting from the market for as long as
the file ships. On the dashboard that shows up as a chart whose own buys and
sells float far above the price line: the line comes from Binance, the markers
from the file, and the two describe different markets. Every figure in the demo
that is quoted in euros has the same problem.

So the demo buys at the price bitcoin actually closed at that day. The table is
committed rather than fetched while building, because the generated files have
to be reproducible offline — and closes of days that are over never change, so
re-running this only ever appends.
"""
import json
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Comfortably before the demo's first transaction, so every day it names is
# covered even after the ledger grows backwards.
START = date(2022, 12, 1)
OUT = Path(__file__).resolve().parent / "data" / "btc-eur-daily.json"
API = "https://api.binance.com/api/v3/klines"
DAY_MS = 86_400_000


def fetch_page(start_ms):
    """One page of daily klines, oldest first. Binance caps `limit` at 1000."""
    url = f"{API}?symbol=BTCEUR&interval=1d&limit=1000&startTime={start_ms}"
    with urllib.request.urlopen(url, timeout=30) as res:
        return json.load(res)


def main():
    cursor = int(datetime.combine(START, datetime.min.time(), timezone.utc).timestamp() * 1000)
    closes = {}
    for _ in range(12):  # 1000 days a page is plenty for any demo history
        rows = fetch_page(cursor)
        for row in rows:
            day = datetime.fromtimestamp(row[0] / 1000, timezone.utc).date()
            # Two decimals: the demo quotes euros, not fractions of a cent.
            closes[day.isoformat()] = f"{float(row[4]):.2f}"
        if len(rows) < 1000:
            break
        cursor = rows[-1][0] + DAY_MS
        time.sleep(0.5)  # a public endpoint, and nobody is waiting for this

    if not closes:
        raise SystemExit("Binance returned no candles — nothing written")

    days = sorted(closes)
    # A gap would silently become "the day before" in price_at(); say so here
    # instead, where it can still be looked at.
    missing = []
    cur = date.fromisoformat(days[0])
    last = date.fromisoformat(days[-1])
    while cur <= last:
        if cur.isoformat() not in closes:
            missing.append(cur.isoformat())
        cur += timedelta(days=1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "source": "Binance BTCEUR, interval 1d, close",
                "fetched": datetime.now(timezone.utc).date().isoformat(),
                "closes": {day: closes[day] for day in days},
            },
            f,
            ensure_ascii=False,
            indent=1,
        )
        f.write("\n")

    print(f"wrote {OUT} — {len(days)} days, {days[0]} … {days[-1]}")
    if missing:
        print(f"  note: {len(missing)} day(s) without a candle, e.g. {missing[:3]}")


if __name__ == "__main__":
    main()
