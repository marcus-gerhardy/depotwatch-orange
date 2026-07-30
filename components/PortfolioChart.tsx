"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { fetchDailyCloses, type DailyClose } from "@/lib/binance";
import { dailyBalanceSeries } from "@/lib/portfolio";
import type { LedgerEntry } from "@/lib/types";
import { Button } from "./ui";

type Range = 90 | 365 | 0; // 0 = all

interface Point {
  time: number;
  value: number;
  btcPrice: number;
}

export default function PortfolioChart({ entries }: { entries: LedgerEntry[] }) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const privacyMode = useAppStore((s) => s.privacyMode);
  const currency = portfolio.settings.currencyDisplay;

  const [closes, setCloses] = useState<DailyClose[] | null>(null);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<Range>(365);
  const [compare, setCompare] = useState(false);

  const balances = useMemo(() => dailyBalanceSeries(entries), [entries]);

  useEffect(() => {
    if (balances.length === 0) return;
    let cancelled = false;
    fetchDailyCloses(currency, balances[0].time)
      .then((c) => !cancelled && (setCloses(c), setError(false)))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [currency, balances]);

  const data: Point[] = useMemo(() => {
    if (!closes || balances.length === 0) return [];
    const closeByDay = new Map(closes.map((c) => [c.time, c.close]));
    const points: Point[] = [];
    let lastClose: number | null = null;
    for (const b of balances) {
      const close: number | null = closeByDay.get(b.time) ?? lastClose;
      if (close === null) continue;
      lastClose = close;
      points.push({
        time: b.time,
        value: b.btc.toNumber() * close,
        btcPrice: close,
      });
    }
    if (range === 0) return points;
    return points.slice(-range);
  }, [closes, balances, range]);

  if (entries.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{t("dashboard.chartEmpty")}</p>;
  }

  // Axis ticks stay compact on purpose; the tooltip shows the full locale date.
  const fmtAxisDate = (ms: number) =>
    new Date(ms).toLocaleDateString(loc, { month: "short", day: "numeric", year: "2-digit" });
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat(loc, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(v);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {([90, 365, 0] as Range[]).map((r) => (
          <Button
            key={r}
            variant={range === r ? "primary" : "ghost"}
            onClick={() => setRange(r)}
          >
            {r === 90
              ? t("dashboard.range90")
              : r === 365
                ? t("dashboard.range365")
                : t("dashboard.rangeAll")}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
          />
          {t("dashboard.chartCompare")}
        </label>
      </div>
      {error ? (
        <p className="py-8 text-center text-sm text-muted">
          {t("dashboard.priceUnavailable")}
        </p>
      ) : data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t("common.loading")}</p>
      ) : (
        <div className={`h-64 ${privacyMode ? "privacy-blur" : ""}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="pfGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f7931a" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f7931a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2a2a30" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={fmtAxisDate}
                stroke="#98989f"
                fontSize={11}
                tickLine={false}
                minTickGap={60}
              />
              <YAxis
                yAxisId="pf"
                tickFormatter={(v: number) => fmtMoney(v)}
                stroke="#98989f"
                fontSize={11}
                tickLine={false}
                width={80}
              />
              {compare && (
                <YAxis
                  yAxisId="btc"
                  orientation="right"
                  tickFormatter={(v: number) => fmtMoney(v)}
                  stroke="#5b5b63"
                  fontSize={11}
                  tickLine={false}
                  width={80}
                />
              )}
              <Tooltip
                contentStyle={{
                  background: "#1d1d21",
                  border: "1px solid #2a2a30",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(ms) => formatDate(Number(ms), loc)}
                formatter={(v, name) => [
                  typeof v === "number" ? fmtMoney(v) : String(v ?? ""),
                  name === "value"
                    ? t("dashboard.chartPortfolio")
                    : t("dashboard.chartBtcPrice"),
                ]}
              />
              <Area
                yAxisId="pf"
                type="monotone"
                dataKey="value"
                stroke="#f7931a"
                strokeWidth={2}
                fill="url(#pfGradient)"
                dot={false}
              />
              {compare && (
                <Line
                  yAxisId="btc"
                  type="monotone"
                  dataKey="btcPrice"
                  stroke="#8a8a93"
                  strokeWidth={1.5}
                  dot={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
