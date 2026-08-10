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
import { formatInt } from "@/lib/decimal";
import { useAppStore } from "@/lib/store";
import { useDailyCloses } from "@/lib/marketData";
import { dailyValueSeries } from "@/lib/portfolio";
import { SATS_PER_BTC } from "@/lib/displayUnit";
import { priceCurrencyOf, type LedgerEntry } from "@/lib/types";
import { useThemeColors } from "@/lib/appearance";
import { Button } from "./ui";

type Range = 90 | 365 | 0; // 0 = all

export default function PortfolioChart({ entries }: { entries: LedgerEntry[] }) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const privacyMode = useAppStore((s) => s.privacyMode);
  const currency = portfolio.settings.currencyDisplay;
  // Prices exist in fiat; displaying BTC charts the holding itself, in sats.
  const priceCurrency = priceCurrencyOf(currency);
  const inSats = currency === "BTC";
  // Recharts needs literal colours (SVG attributes take no CSS variables), so
  // the chart reads the active theme's tokens from the same table the
  // stylesheet is checked against (lib/theme.ts).
  const c = useThemeColors();

  const [range, setRange] = useState<Range>(365);
  const [compare, setCompare] = useState(false);

  // Shared, cached fetch: several widgets chart the same daily closes.
  const startTime = entries.length > 0 ? Date.parse(entries[0].date) : null;
  const closes = useDailyCloses(priceCurrency, startTime);

  const data = useMemo(() => {
    if (!closes.data) return [];
    const points = dailyValueSeries(entries, closes.data).map((p) => ({
      time: p.time,
      // On a Bitcoin standard the portfolio's value is what it *is*: the stack
      // itself, in sats — the fiat rate no longer moves the line.
      value: inSats ? p.btc * SATS_PER_BTC : p.value,
      btcPrice: p.close,
    }));
    return range === 0 ? points : points.slice(-range);
  }, [closes.data, entries, range, inSats]);

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">{t("dashboard.chartEmpty")}</p>
    );
  }

  // Axis ticks stay compact on purpose; the tooltip shows the full locale date.
  const fmtAxisDate = (ms: number) =>
    new Date(ms).toLocaleDateString(loc, { month: "short", day: "numeric", year: "2-digit" });
  const fmtMoney = (v: number) =>
    inSats
      ? `${formatInt(v, loc)} sats`
      : new Intl.NumberFormat(loc, {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(v);
  // The comparison line is always the fiat price — that is what it is for.
  const fmtPrice = (v: number) =>
    new Intl.NumberFormat(loc, {
      style: "currency",
      currency: priceCurrency,
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
                  <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={fmtAxisDate}
                stroke={c.muted}
                fontSize={11}
                tickLine={false}
                minTickGap={60}
              />
              <YAxis
                yAxisId="pf"
                tickFormatter={(v: number) => fmtMoney(v)}
                stroke={c.muted}
                fontSize={11}
                tickLine={false}
                width={80}
              />
              {compare && (
                <YAxis
                  yAxisId="btc"
                  orientation="right"
                  tickFormatter={(v: number) => fmtPrice(v)}
                  stroke={c.border}
                  fontSize={11}
                  tickLine={false}
                  width={80}
                />
              )}
              <Tooltip
                contentStyle={{
                  background: c.surface2,
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(ms) => formatDate(Number(ms), loc)}
                formatter={(v, name) => [
                  typeof v !== "number"
                    ? String(v ?? "")
                    : name === "value"
                      ? fmtMoney(v)
                      : fmtPrice(v),
                  name === "value"
                    ? t("dashboard.chartPortfolio")
                    : t("dashboard.chartBtcPrice"),
                ]}
              />
              <Area
                yAxisId="pf"
                type="monotone"
                dataKey="value"
                stroke={c.accent}
                strokeWidth={2}
                fill="url(#pfGradient)"
                dot={false}
              />
              {compare && (
                <Line
                  yAxisId="btc"
                  type="monotone"
                  dataKey="btcPrice"
                  stroke={c.muted}
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
