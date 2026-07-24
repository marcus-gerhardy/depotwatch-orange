// Live and historical BTC prices from the Binance public API (CORS-enabled).

import type { Currency } from "./types";

const BASE = "https://api.binance.com/api/v3";

const SYMBOLS: Record<Currency, string> = {
  EUR: "BTCEUR",
  USD: "BTCUSDT",
};

export async function fetchSpotPrice(currency: Currency): Promise<number> {
  const res = await fetch(`${BASE}/ticker/price?symbol=${SYMBOLS[currency]}`);
  if (!res.ok) throw new Error(`Binance ticker failed: ${res.status}`);
  const data = (await res.json()) as { price: string };
  return Number(data.price);
}

export interface DailyClose {
  /** UTC day start, ms epoch. */
  time: number;
  close: number;
}

/** Daily closes, oldest first. Binance caps limit at 1000 (~2.7 years). */
export async function fetchDailyCloses(
  currency: Currency,
  startTime?: number,
): Promise<DailyClose[]> {
  const out: DailyClose[] = [];
  let cursor = startTime;
  // Page forward until we reach today (each page ≤ 1000 days).
  for (let page = 0; page < 12; page++) {
    const params = new URLSearchParams({
      symbol: SYMBOLS[currency],
      interval: "1d",
      limit: "1000",
    });
    if (cursor !== undefined) params.set("startTime", String(cursor));
    const res = await fetch(`${BASE}/klines?${params}`);
    if (!res.ok) throw new Error(`Binance klines failed: ${res.status}`);
    const rows = (await res.json()) as [number, string, string, string, string, ...unknown[]][];
    for (const r of rows) out.push({ time: r[0], close: Number(r[4]) });
    if (rows.length < 1000) break;
    cursor = rows[rows.length - 1][0] + 86_400_000;
  }
  return out;
}
