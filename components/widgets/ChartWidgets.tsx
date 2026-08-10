"use client";

// Chart widgets: the portfolio value curve, the BTC price with the user's own
// entries and exits, and the DCA overview.

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useThemeColors as themeColors } from "@/lib/appearance";
import { dec, formatBtc, formatInt } from "@/lib/decimal";
import { useDailyCloses } from "@/lib/marketData";
import { Amount, Button } from "../ui";
import PortfolioChart from "../PortfolioChart";
import { useDashboardData } from "./context";
import { StatLabel, StatValue, WidgetEmpty, WidgetError, WidgetSkeleton } from "./WidgetFrame";

const DAY = 86_400_000;

/**
 * The active theme's colours. Recharts needs literal colours (SVG attributes
 * take no CSS variables), so charts read the same table the stylesheet is
 * checked against (lib/theme.ts) instead of the tokens.
 */
function useThemeColors() {
  return themeColors();
}

/** Tooltip styling in those colours. */
function useTooltipStyle() {
  const c = useThemeColors();
  return {
    background: c.surface2,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    fontSize: 12,
  } as const;
}

/** The value-over-time chart, unchanged in substance, now as a widget. */
export function PortfolioChartWidget() {
  const { entries } = useDashboardData();
  return <PortfolioChart entries={entries} />;
}

type Range = 90 | 365 | 0;

interface PricePoint {
  time: number;
  price: number;
}

interface TradeMarker {
  time: number;
  price: number;
  amountBtc: string;
  kind: "in" | "out";
}

/**
 * Widget 7: the BTC price with the user's own buys (green) and sells/spends
 * (red) as markers, so a decision can be seen in the context it was made in.
 * Transfers are left out — they move coins, they are not entries or exits.
 */
export function PriceEntriesWidget() {
  // The BTC price only means something in fiat, so this chart stays in the
  // fiat currency behind the display setting even on a Bitcoin standard.
  const { t, loc, priceCurrency: currency, entries } = useDashboardData();
  const privacyMode = useAppStore((s) => s.privacyMode);
  const c = useThemeColors();
  const tooltipStyle = useTooltipStyle();
  const [range, setRange] = useState<Range>(365);

  const startTime = entries.length > 0 ? Date.parse(entries[0].date) : null;
  const closes = useDailyCloses(currency, startTime);

  const { line, buys, sells } = useMemo(() => {
    const line: PricePoint[] = (closes.data ?? []).map((c) => ({
      time: c.time,
      price: c.close,
    }));
    // The range is measured from the newest candle, not from the wall clock:
    // both the line and the markers then come off the same day grid.
    const newest = line.length > 0 ? line[line.length - 1].time : 0;
    const cutoff = range === 0 ? 0 : newest - range * DAY;
    const visible = line.filter((p) => p.time >= cutoff);
    const closeByDay = new Map(line.map((p) => [p.time, p.price]));
    const buys: TradeMarker[] = [];
    const sells: TradeMarker[] = [];
    for (const e of entries) {
      if (e.type !== "buy" && e.type !== "sell" && e.type !== "spend") continue;
      const ts = Date.parse(e.date);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      const day = Math.floor(ts / DAY) * DAY;
      const price = closeByDay.get(day);
      if (price === undefined) continue;
      const marker: TradeMarker = {
        time: day,
        price,
        amountBtc: e.amountBtc,
        kind: e.type === "buy" ? "in" : "out",
      };
      (marker.kind === "in" ? buys : sells).push(marker);
    }
    return { line: visible, buys, sells };
  }, [closes.data, entries, range]);

  if (entries.length === 0) {
    return <WidgetEmpty message={t("dashboard.chartEmpty")} />;
  }
  if (closes.error) {
    return (
      <WidgetError
        message={t("dashboard.priceUnavailable")}
        onRetry={closes.reload}
        retryLabel={t("common.refresh")}
      />
    );
  }
  if (closes.loading || line.length === 0) return <WidgetSkeleton lines={4} />;

  const fmtMoney = (v: number) =>
    new Intl.NumberFormat(loc, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(v);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        {([90, 365, 0] as Range[]).map((r) => (
          <Button
            key={r}
            variant={range === r ? "primary" : "ghost"}
            onClick={() => setRange(r)}
            className="px-2 py-0.5 text-xs"
          >
            {r === 90
              ? t("dashboard.range90")
              : r === 365
                ? t("dashboard.range365")
                : t("dashboard.rangeAll")}
          </Button>
        ))}
        <span className="ml-auto flex gap-2 text-[0.65rem] text-muted">
          <span className="text-gain">● {t("dashboard.widgets.entries")}</span>
          <span className="text-loss">● {t("dashboard.widgets.exits")}</span>
        </span>
      </div>
      <div className={`min-h-0 flex-1 ${privacyMode ? "privacy-blur" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={line} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ms: number) =>
                new Date(ms).toLocaleDateString(loc, {
                  month: "short",
                  year: "2-digit",
                })
              }
              stroke={c.muted}
              fontSize={11}
              tickLine={false}
              minTickGap={50}
            />
            <YAxis
              dataKey="price"
              tickFormatter={fmtMoney}
              stroke={c.muted}
              fontSize={11}
              tickLine={false}
              width={70}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(ms) => formatDate(Number(ms), loc)}
              formatter={(v, _name, item) => {
                const p = item?.payload as TradeMarker | undefined;
                const label =
                  p && "kind" in (p ?? {})
                    ? p.kind === "in"
                      ? t("dashboard.widgets.entries")
                      : t("dashboard.widgets.exits")
                    : t("dashboard.chartBtcPrice");
                const value =
                  typeof v === "number" ? fmtMoney(v) : String(v ?? "");
                return [
                  p && "amountBtc" in (p ?? {})
                    ? `${value} · ${formatBtc(p.amountBtc, loc)} BTC`
                    : value,
                  label,
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke={c.accent}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Scatter data={buys} dataKey="price" fill={c.gain} shape="circle" />
            <Scatter data={sells} dataKey="price" fill={c.loss} shape="triangle" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Widget 11: the buying rhythm. Counts only buys — a DCA plan is about what
 * was put in, so transfers and sells are deliberately not part of the average.
 */
export function DcaWidget() {
  const { t, loc, entries, fmtDisplay } = useDashboardData();
  const privacyMode = useAppStore((s) => s.privacyMode);
  const c = useThemeColors();
  const tooltipStyle = useTooltipStyle();

  const stats = useMemo(() => {
    const buys = entries
      .filter((e) => e.type === "buy")
      .map((e) => {
        const amount = dec(e.amountBtc).minus(dec(e.feeBtc));
        const total =
          e.totalFiatEur != null
            ? dec(e.totalFiatEur)
            : e.pricePerBtcEur != null
              ? dec(e.amountBtc).mul(dec(e.pricePerBtcEur))
              : null;
        return {
          time: Date.parse(e.date),
          btc: amount,
          eur: total === null ? null : total.plus(dec(e.feeFiatEur)),
        };
      })
      .filter((b) => !Number.isNaN(b.time))
      .sort((a, b) => a.time - b.time);

    if (buys.length === 0) return null;

    const first = buys[0].time;
    const last = buys[buys.length - 1].time;
    const spanDays = Math.max(1, Math.round((last - first) / DAY));
    const avgIntervalDays = buys.length > 1 ? spanDays / (buys.length - 1) : null;

    const spanMonths = Math.max(
      1,
      (new Date(last).getUTCFullYear() - new Date(first).getUTCFullYear()) * 12 +
        (new Date(last).getUTCMonth() - new Date(first).getUTCMonth()) +
        1,
    );
    const totalEur = buys.reduce(
      (s, b) => (b.eur === null ? s : s.plus(b.eur)),
      dec(0),
    );

    let runningBtc = dec(0);
    const cumulative = buys.map((b) => {
      runningBtc = runningBtc.plus(b.btc);
      return { time: b.time, btc: runningBtc.toNumber() };
    });

    return {
      count: buys.length,
      avgIntervalDays,
      avgPerMonthEur: totalEur.div(spanMonths).toNumber(),
      totalEur: totalEur.toNumber(),
      cumulative,
    };
  }, [entries]);

  if (!stats) return <WidgetEmpty message={t("dashboard.widgets.dcaEmpty")} />;

  const fmtEur = (v: number) => fmtDisplay(v);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <StatValue>{fmtEur(stats.avgPerMonthEur)}</StatValue>
        <StatLabel>{t("dashboard.widgets.avgPerMonth")}</StatLabel>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-[0.65rem] text-muted">{t("dashboard.widgets.buyCount")}</dt>
          <dd className="font-mono">{formatInt(stats.count, loc)}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] text-muted">
            {t("dashboard.widgets.avgInterval")}
          </dt>
          <dd className="font-mono">
            {stats.avgIntervalDays === null
              ? "—"
              : t("dashboard.widgets.everyNDays", {
                  days: stats.avgIntervalDays.toFixed(1),
                })}
          </dd>
        </div>
        <div>
          <dt className="text-[0.65rem] text-muted">
            {t("dashboard.widgets.totalInvested")}
          </dt>
          <dd className="truncate font-mono">
            <Amount>{fmtEur(stats.totalEur)}</Amount>
          </dd>
        </div>
      </dl>
      <div className={`min-h-16 flex-1 ${privacyMode ? "privacy-blur" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={stats.cumulative}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="dcaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ms: number) =>
                new Date(ms).toLocaleDateString(loc, {
                  month: "short",
                  year: "2-digit",
                })
              }
              stroke={c.muted}
              fontSize={10}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(ms) => formatDate(Number(ms), loc)}
              formatter={(v) => [
                `${formatBtc(String(v ?? 0), loc)} BTC`,
                t("dashboard.widgets.cumulativeBtc"),
              ]}
            />
            <Area
              type="stepAfter"
              dataKey="btc"
              stroke={c.accent}
              strokeWidth={1.5}
              fill="url(#dcaGradient)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
