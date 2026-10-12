"use client";

// The savings-plan calculator (docs/dca.md).
//
// Stands apart from the portfolio: it neither reads nor writes the file and
// never marks it as changed. Its own last inputs are remembered on the device
// (lib/dca/storage.ts). Prices are public market data, loaded only when the
// user presses "calculate", and kept for the session so a changed amount or a
// changed model parameter is recomputed without loading anything again.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  addCalendarYears,
  formatCalendarDate,
  localTimeZone,
  todayCalendarDate,
} from "@/lib/dates";
import { intlLocale, useI18n } from "@/lib/i18n";
import { buildChartData } from "@/lib/dca/chartData";
import { fitPowerLaw, SCENARIOS, type PowerLawParams } from "@/lib/dca/powerLaw";
import {
  EARLIEST_PRICE_DAY,
  hasCachedPrices,
  loadPriceHistory,
  type LoadProgress,
  type LoadedPrices,
} from "@/lib/dca/prices";
import { DCA_INTERVALS, MAX_PURCHASES, type DcaInterval } from "@/lib/dca/schedule";
import { simulateDca, usesProjection, type DcaPlan } from "@/lib/dca/simulate";
import { readStoredPlan, storePlan } from "@/lib/dca/storage";
import { MAX_YEARS, validatePlan, type ValidationError } from "@/lib/dca/validate";
import NumberInput from "../NumberInput";
import HelpButton from "../help/HelpButton";
import { Button, Card, SectionTitle, inputCls } from "../ui";
import DcaResultTiles, { type DcaResults } from "./DcaResults";
import InfoTip from "./InfoTip";
import SourcesModal from "./SourcesModal";

// The chart library touches `window` on import; the calculator renders on the
// client only anyway, and this keeps it out of the main bundle.
const DcaChart = dynamic(() => import("./DcaChart"), { ssr: false });

function defaultPlan(): DcaPlan {
  const today = todayCalendarDate(new Date(), localTimeZone());
  return {
    oneTimeEur: "",
    recurringEur: "100",
    interval: "monthly",
    start: addCalendarYears(today, -5),
    end: today,
    feePercent: "0",
  };
}

/**
 * A field with a short label and, optionally, an info button beside it. The
 * button sits outside the <label>: a label names its first labelable
 * descendant, and that would be the button instead of the input.
 */
function FormField({
  label,
  info,
  children,
}: {
  label: string;
  info?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1 text-xs text-muted">
        <label htmlFor={id}>{label}</label>
        {info && <InfoTip label={label} text={info} />}
      </div>
      {children(id)}
    </div>
  );
}

type Results = DcaResults;

export default function DcaView() {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);

  const [plan, setPlan] = useState<DcaPlan>(() => readStoredPlan() ?? defaultPlan());
  const [submitted, setSubmitted] = useState<DcaPlan | null>(null);
  const [prices, setPrices] = useState<LoadedPrices | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<ValidationError | null>(null);
  const [params, setParams] = useState<PowerLawParams | null>(null);
  const [logScale, setLogScale] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const fit = useMemo(() => (prices ? fitPowerLaw(prices.days, prices.closes) : null), [prices]);
  const model = params ?? fit;

  const results = useMemo<Results | null>(() => {
    if (!prices || !submitted || !model) return null;
    const mean = simulateDca(submitted, prices, model, "mean");
    if (!usesProjection(mean)) return { mean };
    const out: Results = { mean };
    for (const s of SCENARIOS) if (s !== "mean") out[s] = simulateDca(submitted, prices, model, s);
    return out;
  }, [prices, submitted, model]);

  const chartData = useMemo(
    () =>
      results && prices && submitted && model
        ? buildChartData(submitted, prices, results.mean, model)
        : null,
    [results, prices, submitted, model],
  );

  const set = <K extends keyof DcaPlan>(key: K, value: DcaPlan[K]) =>
    setPlan((p) => ({ ...p, [key]: value }));

  async function calculate() {
    const error = validatePlan(plan);
    setInvalid(error);
    if (error) return;
    storePlan(plan);
    setLoadError(null);
    if (prices) {
      setSubmitted(plan);
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    if (!hasCachedPrices()) setProgress({ done: 0, total: 1 });
    try {
      const loaded = await loadPriceHistory(setProgress, controller.signal);
      if (controller.signal.aborted) return;
      setPrices(loaded);
      setSubmitted(plan);
    } catch (e) {
      if (controller.signal.aborted) return;
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  const loading = progress !== null;
  const percent = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  const stale =
    submitted !== null && JSON.stringify(submitted) !== JSON.stringify(plan);

  const form = (
    // noValidate: the plan is checked by validatePlan, which says in the
    // app's language what is wrong instead of a browser bubble.
    <form
      noValidate
      className="grid grid-cols-2 gap-x-3 gap-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void calculate();
      }}
    >
      <FormField label={t("dca.form.recurring")}>
        {(id) => (
          <NumberInput
            id={id}
            kind="fiat"
            value={plan.recurringEur}
            onChange={(v) => set("recurringEur", v)}
          />
        )}
      </FormField>
      <FormField label={t("dca.form.interval")}>
        {(id) => (
          <select
            id={id}
            className={inputCls}
            value={plan.interval}
            onChange={(e) => set("interval", e.target.value as DcaInterval)}
          >
            {DCA_INTERVALS.map((i) => (
              <option key={i} value={i}>
                {t(`dca.interval.${i}`)}
              </option>
            ))}
          </select>
        )}
      </FormField>
      {/* A date input's value is stored as the string it is
          (docs/dates.md): a calendar date, never a Date. */}
      <FormField label={t("dca.form.start")}>
        {(id) => (
          <input
            id={id}
            type="date"
            className={inputCls}
            value={plan.start}
            min={EARLIEST_PRICE_DAY}
            onChange={(e) => set("start", e.target.value)}
          />
        )}
      </FormField>
      <FormField label={t("dca.form.end")} info={t("dca.form.endInfo")}>
        {(id) => (
          <input
            id={id}
            type="date"
            className={inputCls}
            value={plan.end}
            onChange={(e) => set("end", e.target.value)}
          />
        )}
      </FormField>
      <FormField label={t("dca.form.oneTime")} info={t("dca.form.oneTimeInfo")}>
        {(id) => (
          <NumberInput
            id={id}
            kind="fiat"
            value={plan.oneTimeEur}
            onChange={(v) => set("oneTimeEur", v)}
            placeholder={t("dca.form.optional")}
          />
        )}
      </FormField>
      <FormField label={t("dca.form.fee")} info={t("dca.form.feeInfo")}>
        {(id) => (
          <NumberInput
            id={id}
            kind="fiat"
            value={plan.feePercent}
            onChange={(v) => set("feePercent", v)}
          />
        )}
      </FormField>
      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
        <Button type="submit" variant="primary" disabled={loading}>
          {t("dca.form.calculate")}
        </Button>
        {stale && !loading && <span className="text-xs text-warning">{t("dca.form.stale")}</span>}
        {invalid && (
          <span role="alert" className="text-xs text-loss">
            {t(`dca.invalid.${invalid}`, {
              date: formatCalendarDate(EARLIEST_PRICE_DAY, loc),
              years: MAX_YEARS,
              max: MAX_PURCHASES,
            })}
          </span>
        )}
      </div>
    </form>
  );

  const resultPane = loading ? (
    <div className="flex h-full flex-col justify-center gap-2" aria-live="polite">
      <p className="text-xs text-muted">{t("dca.loading", { percent })}</p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t("dca.loadingLabel")}
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full bg-accent transition-[width] motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  ) : loadError ? (
    <p role="alert" className="rounded-lg border border-loss/40 bg-loss/5 p-3 text-xs text-loss">
      {t("dca.loadError", { message: loadError })}
    </p>
  ) : results && submitted && prices ? (
    <DcaResultTiles plan={submitted} results={results} lastPriceDay={prices.days.at(-1)!} />
  ) : (
    <p className="flex h-full items-center justify-center text-center text-sm text-muted">
      {t("dca.empty")}
    </p>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <div className="flex items-center gap-2">
          <SectionTitle level={1}>{t("dca.title")}</SectionTitle>
          <HelpButton anchor="dca-overview" label={t("dca.title")} className="mb-3" />
        </div>
        <button
          type="button"
          onClick={() => setSourcesOpen(true)}
          className="mb-3 text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-accent"
        >
          {t("dca.sourcesLink")}
        </button>
      </div>

      {/* Inputs and results side by side, equally tall; one column on narrow
          screens, in reading order: inputs, results, chart. */}
      <div className="grid gap-3 lg:grid-cols-[2fr_3fr] lg:items-stretch">
        <Card className="h-full">{form}</Card>
        <Card className="h-full min-h-48">{resultPane}</Card>
      </div>

      {chartData && results && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <li>{t("dca.chart.legendPrice")}</li>
              <li>{t("dca.chart.legendDeposits")}</li>
              <li>{t("dca.chart.legendValue")}</li>
              {chartData.priceMean.length > 0 && <li>{t("dca.chart.legendEstimate")}</li>}
            </ul>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={logScale}
                  onChange={(e) => setLogScale(e.target.checked)}
                />
                {t("dca.chart.logScale")}
              </label>
              <InfoTip label={t("dca.chart.logScale")} text={t("dca.chart.logInfo")} />
            </span>
          </div>
          <DcaChart data={chartData} purchases={results.mean.purchases} logScale={logScale} />
        </Card>
      )}

      {sourcesOpen && (
        <SourcesModal
          segments={prices?.segments ?? null}
          lastPriceDay={prices?.days.at(-1) ?? null}
          fit={fit}
          params={model}
          custom={params !== null}
          onApply={setParams}
          onReset={() => setParams(null)}
          onClose={() => setSourcesOpen(false)}
        />
      )}
    </div>
  );
}
