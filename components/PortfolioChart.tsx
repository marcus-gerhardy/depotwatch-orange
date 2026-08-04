"use client";

import { useMemo, useState } from "react";
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
import { useDailyCloses } from "@/lib/marketData";
import { dailyValueSeries } from "@/lib/portfolio";
import type { LedgerEntry } from "@/lib/types";
import { Button } from "./ui";

type Range = 90 | 365 | 0; // 0 = all

export default function PortfolioChart({ entries }: { entries: LedgerEntry[] }) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const privacyMode = useAppStore((s) => s.privacyMode);
  const currency = portfolio.settings.currencyDisplay;

  const [range, setRange] = useState<Range>(365);
  const [compare, setCompare] = useState(false);

  // Shared, cached fetch: several widgets chart the same daily closes.
  const startTime = entries.length > 0 ? Date.parse(entries[0].date) : null;
  const closes = useDailyCloses(currency, startTime);

  const data = useMemo(() => {
    if (!closes.data) return [];
    const points = dailyValueSeries(entries, closes.data).map((p) => ({
      time: p.time,
      value: p.value,
      btcPrice: p.close,
    }));
    return range === 0 ? points : points.slice(-range);
  }, [closes.data, entries, range]);

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">{t("dashboard.chartEmpty")}</p>
    );
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
    <div className="flex h-full min-h-0 flex-col">
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
      {closes.error ? (
        <p className="py-8 text-center text-sm text-muted">
          {t("dashboard.priceUnavailable")}
        </p>
      ) : data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t("common.loading")}</p>
      ) : (
        <div className={`min-h-40 flex-1 ${privacyMode ? "privacy-blur" : ""}`}>
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
