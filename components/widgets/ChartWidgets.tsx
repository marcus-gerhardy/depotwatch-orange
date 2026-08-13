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
  ZAxis,
} from "recharts";
import { formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useNowDate } from "@/lib/clock";
import { useThemeColors as themeColors } from "@/lib/appearance";
import { dec, formatBtc, formatInt, ZERO } from "@/lib/decimal";
import { useDailyCloses } from "@/lib/marketData";
import { dailyBalanceSeries } from "@/lib/portfolio";
import { SATS_PER_BTC } from "@/lib/displayUnit";
import {
  buyHeatmap,
  stackSeries,
  tradeMarkersFor,
  type HeatmapDay,
  type TradeMarker,
} from "@/lib/dashboardStats";
import { Amount, Button, PnlValue } from "../ui";
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

/** One aggregated marker, in the currency the chart is drawn in. */
interface ChartMarker {
  time: number;
  price: number;
  btc: number;
  count: number;
  kind: "in" | "out";
  firstTime: number;
  lastTime: number;
}

/**
 * Widget 7: the BTC price with the user's own buys (green) and sells/spends
 * (red), so a decision can be seen in the context it was made in. Transfers
 * are left out — they move coins, they are not entries or exits.
 *
 * Two things this gets right that are easy to get wrong:
 *
 * A marker sits at the price the trade was **executed** at (`tradeMarkers`),
 * not at that day's close. The close is a different number, and putting a buy
 * on it claims an execution that never happened; it also silently dropped any
 * trade whose day the price source had no candle for.
 *
 * A daily DCA puts one dot per day on the chart, and several hundred dots draw
 * a band rather than information. So trades are folded into buckets — day,
 * week or month, the finest that stays readable — each marker sitting at the
 * volume-weighted average price of its bucket and sized by the BTC it covers.
 */
export function PriceEntriesWidget() {
  // The BTC price only means something in fiat, so this chart stays in the
  // fiat currency behind the display setting even on a Bitcoin standard.
  const { t, loc, priceCurrency: currency, entries, fmtAmount } = useDashboardData();
  const privacyMode = useAppStore((s) => s.privacyMode);
  const c = useThemeColors();
  const tooltipStyle = useTooltipStyle();
  const [range, setRange] = useState<Range>(365);

  const startTime = entries.length > 0 ? Date.parse(entries[0].date) : null;
  const closes = useDailyCloses(currency, startTime);
  // The ledger records EUR (§3.2). Drawing on a USD axis therefore needs the
  // EUR series as well, so a trade can be converted at the rate of *its own
  // day* rather than at today's. With EUR on the axis there is nothing to
  // convert and nothing to fetch.
  const eurCloses = useDailyCloses("EUR", currency === "EUR" ? null : startTime);

  const { line, buys, sells, bucket, withoutPrice, tradeCount } = useMemo(() => {
    const all: PricePoint[] = (closes.data ?? []).map((c) => ({
      time: c.time,
      price: c.close,
    }));
    // The range is measured from the newest candle, not from the wall clock:
    // both the line and the markers then come off the same day grid.
    const newest = all.length > 0 ? all[all.length - 1].time : 0;
    const cutoff = range === 0 ? 0 : newest - range * DAY;
    const line = all.filter((p) => p.time >= cutoff);

    // EUR → axis currency, per day, carried forward over days the source has
    // no candle for (the same rule dailyValueSeries uses).
    const rateByDay = new Map<number, number>();
    if (currency !== "EUR" && eurCloses.data) {
      const eurByDay = new Map(eurCloses.data.map((c) => [c.time, c.close]));
      let last: number | null = null;
      for (const p of all) {
        const eur = eurByDay.get(p.time);
        if (eur && eur > 0) last = p.price / eur;
        if (last !== null) rateByDay.set(p.time, last);
      }
    }
    const rateAt = (time: number): number | null => {
      if (currency === "EUR") return 1;
      if (rateByDay.size === 0) return null;
      const day = Math.floor(time / DAY) * DAY;
      const hit = rateByDay.get(day);
      if (hit !== undefined) return hit;
      // Before the first candle or after the last one: the nearest known rate
      // beats dropping the marker, and it is off by a day at most.
      let nearest: number | null = null;
      let bestDistance = Infinity;
      for (const [d, r] of rateByDay) {
        const distance = Math.abs(d - day);
        if (distance < bestDistance) {
          bestDistance = distance;
          nearest = r;
        }
      }
      return nearest;
    };

    const markers = tradeMarkersFor(entries, cutoff);
    const toChart = (m: TradeMarker): ChartMarker | null => {
      const rate = rateAt(m.time);
      if (rate === null) return null;
      return {
        time: m.time,
        price: m.priceEur.toNumber() * rate,
        btc: m.btc.toNumber(),
        count: m.count,
        kind: m.kind,
        firstTime: m.firstTime,
        lastTime: m.lastTime,
      };
    };
    const convert = (list: TradeMarker[]) =>
      list.map(toChart).filter((m): m is ChartMarker => m !== null);

    return {
      line,
      buys: convert(markers.buys),
      sells: convert(markers.sells),
      bucket: markers.bucket,
      withoutPrice: markers.withoutPrice,
      tradeCount: markers.tradeCount,
    };
  }, [closes.data, eurCloses.data, currency, entries, range]);

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
  // The axis stays compact; a tooltip is where an execution price is read, so
  // it keeps its decimals.
  const fmtPrecise = (v: number) =>
    new Intl.NumberFormat(loc, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);

  /** Marker sizes span this range of pixels, by BTC volume. */
  const markerRange: [number, number] =
    buys.length + sells.length > 25 ? [10, 120] : [24, 200];

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
          <span className="text-loss">▲ {t("dashboard.widgets.exits")}</span>
        </span>
      </div>
      {/* overflow-hidden against the one-frame tooltip overshoot, see
          PortfolioChart. */}
      <div
        className={`min-h-0 flex-1 overflow-hidden ${privacyMode ? "privacy-blur" : ""}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
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
            {/* Volume gives a marker its size: one big buy should not look like
                one small one. */}
            <ZAxis dataKey="btc" range={markerRange} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ stroke: c.border }}
              labelFormatter={(ms) => formatDate(Number(ms), loc)}
              formatter={(v, _name, item) => {
                const p = item?.payload as Partial<ChartMarker> | undefined;
                const value = typeof v === "number" ? fmtPrecise(v) : String(v ?? "");
                if (!p || p.count === undefined) {
                  return [value, t("dashboard.chartBtcPrice")];
                }
                return [
                  t("dashboard.widgets.markerSummary", {
                    price: value,
                    amount: fmtAmount(String(p.btc ?? 0)),
                    count: p.count,
                  }),
                  p.kind === "in"
                    ? t("dashboard.widgets.entries")
                    : t("dashboard.widgets.exits"),
                ];
              }}
            />
            <Line
              data={line}
              type="monotone"
              dataKey="price"
              stroke={c.accent}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Scatter
              data={buys}
              dataKey="price"
              fill={c.gain}
              fillOpacity={0.75}
              stroke={c.gain}
              shape="circle"
              isAnimationActive={false}
            />
            <Scatter
              data={sells}
              dataKey="price"
              fill={c.loss}
              fillOpacity={0.75}
              stroke={c.loss}
              shape="triangle"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* Said out loud: a dot that stands for 30 buys must not be read as one
          trade, and a trade with no price recorded is missing from the chart. */}
      {(bucket !== "day" || withoutPrice > 0) && (
        <p className="mt-1 text-[0.65rem] leading-snug text-muted">
          {bucket !== "day" &&
            t(`dashboard.widgets.markerBucket.${bucket}`, { count: tradeCount })}
          {bucket !== "day" && withoutPrice > 0 && " · "}
          {withoutPrice > 0 &&
            t("dashboard.widgets.markerWithoutPrice", { count: withoutPrice })}
        </p>
      )}
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
      {/* overflow-hidden against the one-frame tooltip overshoot, see
          PortfolioChart. */}
      <div
        className={`min-h-16 flex-1 overflow-hidden ${privacyMode ? "privacy-blur" : ""}`}
      >
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

/**
 * The stack itself over time: how many BTC, regardless of what they were
 * worth. A step curve, because a holding changes on the day a transaction
 * happens and is flat in between — interpolating would draw coins that were
 * never there.
 *
 * Transfers between one's own wallets do not move this line: `balanceDelta`
 * credits the in-leg exactly what the out-leg debited, so a pair costs the
 * portfolio only the network fee that was actually burnt (§3.2).
 */
export function StackHistoryWidget() {
  const { t, loc, currency, entries, balanceBtc, fmtAmount, fmtAmountPlain } =
    useDashboardData();
  const privacyMode = useAppStore((s) => s.privacyMode);
  const c = useThemeColors();
  const tooltipStyle = useTooltipStyle();
  const inSats = currency === "BTC";

  const data = useMemo(() => {
    const series = stackSeries(dailyBalanceSeries(entries));
    return series.map((p) => ({
      time: p.time,
      // One unit for the axis and the tooltip, the one the user picked (§6.3).
      amount: inSats ? p.btc * SATS_PER_BTC : p.btc,
    }));
  }, [entries, inSats]);

  if (data.length === 0) {
    return <WidgetEmpty message={t("dashboard.widgets.stackHistoryEmpty")} />;
  }

  const first = data[0].amount;
  const last = data[data.length - 1].amount;
  const grown = last - first;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div>
        <StatValue>
          <Amount>{fmtAmount(balanceBtc)}</Amount>
        </StatValue>
        <StatLabel>
          {t("dashboard.widgets.stackSince", {
            date: formatDate(data[0].time, loc),
          })}{" "}
          <PnlValue value={grown}>
            {fmtAmountPlain((inSats ? grown / SATS_PER_BTC : grown).toFixed(8), true)}
          </PnlValue>
        </StatLabel>
      </div>
      {/* overflow-hidden against the one-frame tooltip overshoot, see
          PortfolioChart. */}
      <div
        className={`min-h-0 flex-1 overflow-hidden ${privacyMode ? "privacy-blur" : ""}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="stackGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={(ms: number) =>
                new Date(ms).toLocaleDateString(loc, { month: "short", year: "2-digit" })
              }
              stroke={c.muted}
              fontSize={11}
              tickLine={false}
              minTickGap={50}
            />
            <YAxis
              tickFormatter={(v: number) =>
                inSats ? formatInt(Math.round(v), loc) : formatBtc(v.toFixed(8), loc)
              }
              stroke={c.muted}
              fontSize={11}
              tickLine={false}
              width={inSats ? 70 : 90}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(ms) => formatDate(Number(ms), loc)}
              formatter={(v) => [
                typeof v === "number"
                  ? inSats
                    ? `${formatInt(Math.round(v), loc)} sats`
                    : `${formatBtc(v.toFixed(8), loc)} BTC`
                  : String(v ?? ""),
                t("dashboard.widgets.stackAmount"),
              ]}
            />
            <Area
              type="stepAfter"
              dataKey="amount"
              stroke={c.accent}
              strokeWidth={2}
              fill="url(#stackGradient)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Weekday rows of the heatmap, Monday first. */
const HEATMAP_ROWS = 7;
/** Weekday rows that get a label; the rest would not fit at this cell size. */
const LABELLED_WEEKDAYS = [0, 2, 4];

/**
 * A year of buying, one square per day, in the classic calendar-strip form:
 * weeks as columns, weekdays as rows, intensity by volume.
 *
 * The strip is 53 columns wide at a readable cell size, so on a narrow tile it
 * scrolls sideways. That is the trade the form makes, and it is why the widget
 * asks for a wide default size — squeezing the year into any width instead
 * turns the squares into slivers that can carry neither a date nor a label.
 *
 * What the strip does carry: the months across the top and the weekdays down
 * the side, so it is clear what one square is, and a detail line below that
 * reports the day under the pointer in full.
 *
 * The colour scale is the accent at five opacities rather than five colours:
 * it stays inside whatever the active theme is, and intensity, not hue, is
 * what the eye reads on a calendar grid anyway.
 */
export function BuyHeatmapWidget() {
  const { t, loc, entries, fmtDisplay, fmtAmountPlain, unit } = useDashboardData();
  const now = useNowDate();
  const [hovered, setHovered] = useState<HeatmapDay | null>(null);

  const map = useMemo(
    () => (now === null ? null : buyHeatmap(entries, 12, now)),
    [entries, now],
  );

  if (map === null) return <WidgetSkeleton lines={4} />;
  if (map.totalBuys === 0) {
    return <WidgetEmpty message={t("dashboard.widgets.heatmapEmpty")} />;
  }

  // Columns are calendar weeks. The first column is padded so every row is one
  // weekday, which is what makes the grid readable.
  const weeks: (HeatmapDay | null)[][] = [];
  let current: (HeatmapDay | null)[] = [];
  const weekdayOf = (ms: number) => (new Date(ms).getDay() + 6) % 7; // Mon = 0
  for (let i = 0; i < map.days.length; i++) {
    const day = map.days[i];
    if (current.length === 0 && i === 0) {
      for (let p = 0; p < weekdayOf(day.time); p++) current.push(null);
    }
    current.push(day);
    if (current.length === HEATMAP_ROWS) {
      weeks.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    while (current.length < HEATMAP_ROWS) current.push(null);
    weeks.push(current);
  }

  // A month label sits above the week its month starts in, which is how a
  // calendar grid says what one is looking at.
  const monthLabels = weeks.map((week, i) => {
    const first = week.find((d): d is HeatmapDay => d !== null);
    if (!first) return null;
    const month = new Date(first.time).getMonth();
    const previous = weeks[i - 1]?.find((d): d is HeatmapDay => d !== null);
    if (previous && new Date(previous.time).getMonth() === month) return null;
    return new Date(first.time).toLocaleDateString(loc, { month: "short" });
  });

  // Weekday names come from the locale rather than a dictionary entry: they
  // are calendar data, and Intl already has them in both languages.
  const weekdayNames = Array.from({ length: HEATMAP_ROWS }, (_, row) => {
    // 2024-01-01 was a Monday, so row 0 lands on Monday in every locale.
    return new Date(2024, 0, 1 + row).toLocaleDateString(loc, { weekday: "short" });
  });

  const maxEur = map.maxEur.toNumber();
  /** Five steps, so a big day is visibly bigger than a small one. */
  const intensity = (day: HeatmapDay): number => {
    if (day.buyCount === 0) return 0;
    if (maxEur <= 0) return 0.55;
    const share = day.eur.toNumber() / maxEur;
    return share > 0.75 ? 1 : share > 0.5 ? 0.8 : share > 0.25 ? 0.6 : 0.4;
  };

  const totalEur = map.days.reduce((s, d) => s.plus(d.eur), ZERO).toNumber();
  const totalBtc = map.days.reduce((s, d) => s.plus(d.btc), ZERO);
  const buyingDays = map.days.filter((d) => d.buyCount > 0).length;

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2"
      onMouseLeave={() => setHovered(null)}
    >
      <div>
        <StatValue>{fmtDisplay(totalEur)}</StatValue>
        <StatLabel>
          {t("dashboard.widgets.heatmapSummary", { count: map.totalBuys })} ·{" "}
          {t("dashboard.widgets.heatmapCell")}
        </StatLabel>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex gap-1">
          {/* Weekday axis. Its top spacer matches the month-label row, so the
              rows line up with the cells beside them. */}
          <div className="flex shrink-0 flex-col gap-[2px] pt-[13px] text-[0.55rem] text-muted">
            {weekdayNames.map((name, row) => (
              <span key={name} className="h-2.5 leading-[0.625rem]">
                {LABELLED_WEEKDAYS.includes(row) ? name : ""}
              </span>
            ))}
          </div>

          <div>
            <div className="flex gap-[2px]">
              {monthLabels.map((label, i) => (
                <span
                  key={i}
                  // Wider than its column and deliberately allowed to run over
                  // the next one, so a label cannot widen the grid.
                  className="w-2.5 shrink-0 text-[0.55rem] whitespace-nowrap text-muted"
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="flex gap-[2px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[2px]">
                  {week.map((day, di) => {
                    if (day === null) return <span key={di} className="h-2.5 w-2.5" />;
                    const level = intensity(day);
                    return (
                      <span
                        key={di}
                        onMouseEnter={() => setHovered(day)}
                        className={`h-2.5 w-2.5 rounded-[2px] ${
                          hovered?.time === day.time ? "ring-1 ring-foreground" : ""
                        }`}
                        style={{
                          background:
                            level === 0
                              ? "var(--surface-2)"
                              : `color-mix(in srgb, var(--accent) ${level * 100}%, transparent)`,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed height, so moving the pointer over the grid does not make the
          tile jump. Without a pointer it carries the period's summary. */}
      <div className="min-h-8 shrink-0 text-[0.65rem] leading-snug">
        {hovered === null ? (
          <p className="text-muted">
            <Amount>
              {t("dashboard.widgets.heatmapFooter", {
                days: buyingDays,
                amount: `${fmtAmountPlain(totalBtc)} ${unit}`,
              })}
            </Amount>
          </p>
        ) : (
          <div>
            <p className="font-medium">
              {formatDate(hovered.time, loc)}
              <span className="ml-1 text-muted">
                {hovered.buyCount === 0
                  ? t("dashboard.widgets.heatmapNoBuy")
                  : t("dashboard.widgets.heatmapBuys", { count: hovered.buyCount })}
              </span>
            </p>
            {hovered.buyCount > 0 && (
              <p className="text-muted">
                <Amount>
                  {fmtDisplay(hovered.eur.toNumber())} ·{" "}
                  {fmtAmountPlain(hovered.btc)} {unit}
                  {hovered.priceEur !== null && (
                    <>
                      {" · ⌀ "}
                      {fmtDisplay(hovered.priceEur.toNumber())}
                      {t("dashboard.widgets.heatmapPerBtc")}
                    </>
                  )}
                </Amount>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1 text-[0.6rem] text-muted">
        {t("dashboard.widgets.heatmapLess")}
        {[0, 0.4, 0.6, 0.8, 1].map((o) => (
          <span
            key={o}
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{
              background:
                o === 0
                  ? "var(--surface-2)"
                  : `color-mix(in srgb, var(--accent) ${o * 100}%, transparent)`,
            }}
          />
        ))}
        {t("dashboard.widgets.heatmapMore")}
      </div>
    </div>
  );
}
