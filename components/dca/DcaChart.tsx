"use client";

// The savings-plan chart, drawn with TradingView Lightweight Charts (the
// open-source library, Apache-2.0; its attribution logo stays on as the
// licence asks).
//
// Price on the left scale (switchable to logarithmic), amounts on the right:
// cumulative deposits as steps, portfolio value as a line. Past the last real
// close everything projected changes colour and line style, the price becomes
// a band, and a vertical rule marks where the history ends — so a modelled
// stretch can never be read as a recorded one.

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  LineType,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { useThemeColors } from "@/lib/appearance";
import { formatCalendarDate, serializeCalendarDate, type CalendarDate } from "@/lib/dates";
import { formatBtc, formatFiat } from "@/lib/decimal";
import { intlLocale, useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { DcaChartData } from "@/lib/dca/chartData";
import type { Purchase } from "@/lib/dca/simulate";

function timeToDay(time: Time): CalendarDate {
  if (typeof time === "string") return time;
  if (typeof time === "number") {
    // UTC timestamp in seconds; not produced by this chart, handled anyway.
    const ms = time * 1000;
    const dt = new Date(ms);
    return serializeCalendarDate({
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
    });
  }
  return serializeCalendarDate(time);
}

interface Tooltip {
  x: number;
  y: number;
  day: CalendarDate;
  price: number | null;
  projected: boolean;
  deposits: number | null;
  value: number | null;
  purchases: Purchase[];
}

export default function DcaChart({
  data,
  purchases,
  logScale,
}: {
  data: DcaChartData;
  /** Mean-scenario purchases, for markers and the tooltip. */
  purchases: Purchase[];
  logScale: boolean;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const colors = useThemeColors();
  const privacyMode = useAppStore((s) => s.privacyMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  /** Where the boundary rule sits, and whether its label goes to its left. */
  const [rule, setRule] = useState<{ x: number; flip: boolean } | null>(null);
  const [tip, setTip] = useState<Tooltip | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const [cPrice, cDeposit, cValue, cProjection] = [
      colors.chart[0],
      colors.chart[1],
      colors.chart[2],
      colors.chart[3],
    ];
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: colors.surface },
        textColor: colors.muted,
        fontFamily: getComputedStyle(el).fontFamily,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: colors.border },
        horzLines: { color: colors.border },
      },
      rightPriceScale: { visible: true, borderColor: colors.border },
      leftPriceScale: {
        visible: true,
        borderColor: colors.border,
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
      // Decades of daily points have to fit the width: the default minimum
      // spacing would cut the start of the plan off.
      timeScale: {
        borderColor: colors.border,
        minBarSpacing: 0.01,
        // A rotated phone or a resized window keeps showing the whole plan.
        lockVisibleTimeRangeOnResize: true,
      },
      crosshair: {
        vertLine: { color: colors.muted, labelBackgroundColor: colors.surface2 },
        horzLine: { color: colors.muted, labelBackgroundColor: colors.surface2 },
      },
      localization: {
        locale: loc,
        priceFormatter: (p: number) =>
          new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(p),
      },
    });
    chartRef.current = chart;

    const line = (
      color: string,
      scale: "left" | "right",
      extra: Partial<{ lineStyle: LineStyle; lineWidth: 1 | 2 | 3; lineType: LineType }> = {},
    ): ISeriesApi<"Line"> =>
      chart.addSeries(LineSeries, {
        color,
        priceScaleId: scale,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        ...extra,
      });

    const priceHistory = line(cPrice, "left");
    const priceUpper = line(cProjection, "left", { lineStyle: LineStyle.Dotted, lineWidth: 1 });
    const priceLower = line(cProjection, "left", { lineStyle: LineStyle.Dotted, lineWidth: 1 });
    const priceMean = line(cProjection, "left", { lineStyle: LineStyle.Dashed });
    const deposits = line(cDeposit, "right", { lineType: LineType.WithSteps });
    const valueHistory = line(cValue, "right");
    const valueProjection = line(cValue, "right", { lineStyle: LineStyle.LargeDashed });

    priceHistory.setData(data.priceHistory);
    priceUpper.setData(data.priceUpper);
    priceLower.setData(data.priceLower);
    priceMean.setData(data.priceMean);
    deposits.setData(data.deposits);
    valueHistory.setData(data.valueHistory);
    valueProjection.setData(data.valueProjection);

    // Purchase markers sit on the price line they bought at. Only the real
    // ones: projected purchases, dense on a compressed future, would bury the
    // dashed mean under a solid bar. The tooltip still lists them.
    createSeriesMarkers(
      priceHistory,
      purchases
        .filter((p) => p.origin === "history")
        .map((p) => ({
          time: p.date as Time,
          position: "inBar" as const,
          shape: "circle" as const,
          color: cPrice,
          size: 0.25,
        })),
    );

    chart.timeScale().fitContent();

    // The boundary rule is an overlay, positioned from the time scale.
    const placeRule = () => {
      if (data.boundary === null) return setRule(null);
      // Relative to the plot area, which starts after the left price scale.
      const x = chart.timeScale().timeToCoordinate(data.boundary as Time);
      const plotWidth = chart.timeScale().width();
      // Scrolled out of view: no rule rather than one outside the chart.
      setRule(
        x === null || x < 0 || x > plotWidth
          ? null
          : { x: x + chart.priceScale("left").width(), flip: plotWidth - x < 90 },
      );
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(placeRule);
    chart.timeScale().subscribeSizeChange(placeRule);
    // autoSize resizes the canvas a frame after the container changes; place
    // the rule once that has happened.
    const resize = new ResizeObserver(() => requestAnimationFrame(placeRule));
    resize.observe(el);
    // The first layout happens after this effect (autoSize measures later).
    const frame = requestAnimationFrame(() => {
      chart.timeScale().fitContent();
      placeRule();
    });

    const byDay = new Map<CalendarDate, Purchase[]>();
    for (const p of purchases) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);

    const valueOf = (param: MouseEventParams, series: ISeriesApi<"Line">) => {
      const v = param.seriesData.get(series);
      return v && "value" in v ? v.value : null;
    };
    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.point) return setTip(null);
      const day = timeToDay(param.time);
      const histPrice = valueOf(param, priceHistory);
      const projected = histPrice === null;
      setTip({
        // Kept inside the chart: flipped left of the cursor near the edge.
        x: Math.max(
          0,
          Math.min(param.point.x + chart.priceScale("left").width() + 12, el.clientWidth - 180),
        ),
        y: param.point.y,
        day,
        price: histPrice ?? valueOf(param, priceMean),
        projected: projected && valueOf(param, priceMean) !== null,
        deposits: valueOf(param, deposits),
        value: valueOf(param, valueHistory) ?? valueOf(param, valueProjection),
        purchases: byDay.get(day) ?? [],
      });
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      chart.unsubscribeCrosshairMove(onMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(placeRule);
      chart.timeScale().unsubscribeSizeChange(placeRule);
      chart.remove();
      chartRef.current = null;
    };
    // The log switch is applied below without rebuilding the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, purchases, colors, loc]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      leftPriceScale: { mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal },
    });
  }, [logScale]);

  const fiat = (v: number) => formatFiat(String(v), "EUR", loc);

  return (
    <div className={`relative overflow-hidden ${privacyMode ? "privacy-blur" : ""}`}>
      <div
        ref={containerRef}
        role="img"
        aria-label={t("dca.chart.label")}
        className="h-80 w-full sm:h-96"
      />
      {rule !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-7 z-[5] border-l-2 border-dashed border-warning"
          style={{ left: rule.x }}
        >
          <span
            className={`absolute top-1 whitespace-nowrap rounded bg-surface-2/90 px-1.5 py-0.5 text-[0.65rem] text-warning ${
              rule.flip ? "right-1.5" : "left-1.5"
            }`}
          >
            {t("dca.chart.estimate")} →
          </span>
        </div>
      )}
      {tip && (
        <div
          className="pointer-events-none absolute z-10 min-w-40 rounded-lg border border-border-c bg-surface px-2.5 py-2 text-xs shadow-lg"
          style={{
            left: tip.x,
            top: Math.max(0, tip.y - 10),
          }}
        >
          <p className="font-medium text-foreground">
            {formatCalendarDate(tip.day, loc)}
            {tip.projected && (
              <span className="ml-1 text-warning">· {t("dca.chart.estimated")}</span>
            )}
          </p>
          {tip.price !== null && (
            <p className="text-muted">
              {t("dca.chart.price")}: <span className="text-foreground">{fiat(tip.price)}</span>
            </p>
          )}
          {tip.deposits !== null && (
            <p className="text-muted">
              {t("dca.chart.deposits")}:{" "}
              <span className="text-foreground">{fiat(tip.deposits)}</span>
            </p>
          )}
          {tip.value !== null && (
            <p className="text-muted">
              {t("dca.chart.value")}: <span className="text-foreground">{fiat(tip.value)}</span>
            </p>
          )}
          {tip.purchases.map((p, i) => (
            <p key={i} className="mt-1 border-t border-border-c/60 pt-1 text-muted">
              {t("dca.chart.bought")}:{" "}
              <span className="text-foreground">{formatBtc(p.btc, loc)} BTC</span>
              {" @ "}
              <span className="text-foreground">{formatFiat(p.price, "EUR", loc)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
