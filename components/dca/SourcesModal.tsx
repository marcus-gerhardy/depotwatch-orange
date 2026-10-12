"use client";

// "Price sources": where the prices come from, from when which source
// applies, how the estimate for the future is made and why it is no forecast,
// in plain sentences. The estimate's settings live here as well, folded away:
// they are for whoever wants to see how sensitive the result is, not part of
// using the calculator.

import { useId, useState } from "react";
import { formatCalendarDate } from "@/lib/dates";
import { intlLocale, useI18n } from "@/lib/i18n";
import type { PowerLawFit, PowerLawParams } from "@/lib/dca/powerLaw";
import {
  BTC_EUR_SINCE,
  EARLIEST_PRICE_DAY,
  type SourceSegment,
} from "@/lib/dca/prices";
import { Button, Modal, Section, inputCls } from "../ui";
import InfoTip from "./InfoTip";

const FIELDS: (keyof PowerLawParams)[] = ["slope", "band", "intercept"];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  );
}

export default function SourcesModal({
  segments,
  lastPriceDay,
  fit,
  params,
  custom,
  onApply,
  onReset,
  onClose,
}: {
  /** Known once prices are loaded; before that the usual dates are shown. */
  segments: SourceSegment[] | null;
  lastPriceDay: string | null;
  fit: PowerLawFit | null;
  params: PowerLawParams | null;
  custom: boolean;
  onApply: (p: PowerLawParams) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const date = (d: string) => formatCalendarDate(d, loc);

  const usd = segments?.find((s) => s.source === "binance-usdt-ecb") ?? {
    from: EARLIEST_PRICE_DAY,
    to: null,
  };
  const eurFrom = segments?.find((s) => s.source === "binance-eur")?.from ?? BTC_EUR_SINCE;

  return (
    <Modal title={t("dca.sources.title")} onClose={onClose} size="lg" help="dca-prices">
      <div className="space-y-4 text-sm leading-relaxed text-muted">
        <Block title={t("dca.sources.historyTitle")}>
          <p>{t("dca.sources.history")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("dca.sources.eur", { from: date(eurFrom) })}</li>
            <li>
              {t("dca.sources.usd", {
                from: date(usd.from),
                to: usd.to ? date(usd.to) : t("dca.sources.eurStart"),
              })}
            </li>
            <li>{t("dca.sources.earliest", { date: date(EARLIEST_PRICE_DAY) })}</li>
          </ul>
          <p>{t("dca.sources.gaps")}</p>
          <p>{t("dca.sources.loading")}</p>
        </Block>

        <Block title={t("dca.sources.estimateTitle")}>
          <p>
            {t("dca.sources.estimate", {
              date: lastPriceDay ? date(lastPriceDay) : t("dca.sources.lastKnown"),
            })}
          </p>
          <p>{t("dca.sources.estimateBand")}</p>
        </Block>

        <Block title={t("dca.sources.warningTitle")}>
          <p className="text-warning">{t("dca.sources.warning")}</p>
        </Block>

        <Block title={t("dca.sources.privacyTitle")}>
          <p>{t("dca.sources.privacy")}</p>
        </Block>

        {fit && params && (
          <ModelSettings
            fit={fit}
            params={params}
            custom={custom}
            onApply={onApply}
            onReset={onReset}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * The estimate's three numbers. Applied with a button, not per keystroke: a
 * long daily plan takes a moment to recompute, and half-typed numbers are not
 * a model.
 */
function ModelSettings({
  fit,
  params,
  custom,
  onApply,
  onReset,
}: {
  fit: PowerLawFit;
  params: PowerLawParams;
  custom: boolean;
  onApply: (p: PowerLawParams) => void;
  onReset: () => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const show = (v: number) => String(Number(v.toPrecision(5)));
  const [draft, setDraft] = useState<Record<keyof PowerLawParams, string>>({
    intercept: show(params.intercept),
    slope: show(params.slope),
    band: show(params.band),
  });
  const value = (f: keyof PowerLawParams) => Number(draft[f].replace(",", "."));
  const valid = FIELDS.every((f) => Number.isFinite(value(f))) && value("band") >= 0;

  return (
    <Section title={t("dca.model.title")} summary={custom ? t("dca.model.custom") : undefined}>
      <p className="text-xs leading-relaxed text-muted">
        {t("dca.model.intro", { from: formatCalendarDate(fit.from, loc) })}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <ParamField
            key={f}
            label={t(`dca.model.${f}`)}
            info={t(`dca.model.${f}Info`)}
            value={draft[f]}
            onChange={(v) => setDraft((d) => ({ ...d, [f]: v }))}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() =>
            onApply({ intercept: value("intercept"), slope: value("slope"), band: value("band") })
          }
        >
          {t("dca.model.apply")}
        </Button>
        <Button
          disabled={!custom}
          onClick={() => {
            setDraft({
              intercept: show(fit.intercept),
              slope: show(fit.slope),
              band: show(fit.band),
            });
            onReset();
          }}
        >
          {t("dca.model.reset")}
        </Button>
      </div>
    </Section>
  );
}

/** Label and info button side by side; the button stays outside the label. */
function ParamField({
  label,
  info,
  value,
  onChange,
}: {
  label: string;
  info: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-xs text-muted">
        <label htmlFor={id}>{label}</label>
        <InfoTip label={label} text={info} />
      </div>
      <input
        id={id}
        className={`${inputCls} font-mono`}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
