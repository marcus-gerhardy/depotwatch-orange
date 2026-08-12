"use client";

// The year in review (CLAUDE.md §4.2).
//
// A stepper of single figures, one card at a time, and a summary at the end.
// The arithmetic is not in here: `lib/yearInReview.ts` computes the whole
// review as one value, this file only decides how it reads. That split is what
// keeps the wording honest — a card can only show what the review actually
// contains, and a year that cannot fill a card never renders it (`review.cards`).
//
// Two things this view deliberately does not do: it never fetches a year of
// price history for being opened (the market comparison uses what is already
// cached, and offers a button otherwise), and it never states a verdict about a
// price. Everything here is something the user did.

import { useEffect, useMemo, useState } from "react";
import { useI18n, intlLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useNowDate } from "@/lib/clock";
import { Decimal, formatFiat, formatInt, formatPercent } from "@/lib/decimal";
import { formatAmount, satsOf } from "@/lib/displayUnit";
import { computeFifo } from "@/lib/fifo";
import { flattenLedger } from "@/lib/types";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { loadDailyCloses, peekDailyCloses } from "@/lib/marketData";
import {
  computeYearReview,
  reviewableYears,
  yearStart,
  type YearReview,
  type YearReviewCardId,
} from "@/lib/yearInReview";
import MilestoneIcon from "./MilestoneIcon";
import YearInReviewShare from "./YearInReviewShare";
import { Amount, Button, Card, PnlValue, SectionTitle } from "./ui";

/** What one card says: a headline figure, its label, and one sentence. */
interface CardContent {
  label: string;
  /** The figure itself — already formatted, because that is all it is. */
  value: string;
  /** True for a holding, a sum of money, a sats figure (privacy mode blurs it). */
  absolute?: boolean;
  sentence: string;
  /** Supporting rows under the sentence. */
  details?: { label: string; value: string; absolute?: boolean }[];
  /** Rendered instead of details where a card needs more than a table. */
  extra?: React.ReactNode;
  /** Tone of the headline figure, for gains and losses. */
  signed?: number;
}

function monthName(year: number, month: number, loc: string): string {
  return new Intl.DateTimeFormat(loc, { month: "long" }).format(new Date(year, month, 1));
}

function weekdayName(weekday: number, loc: string): string {
  // 1970-01-04 was a Sunday, which is index 0 of `getDay`.
  return new Intl.DateTimeFormat(loc, { weekday: "long" }).format(
    new Date(Date.UTC(1970, 0, 4 + weekday)),
  );
}

export default function YearInReview({
  initialYear,
}: {
  /** Year to open at — the dashboard hint jumps straight into its own year. */
  initialYear?: number;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const now = useNowDate();

  const entries = useMemo(() => flattenLedger(portfolio.wallets), [portfolio.wallets]);
  // Which years exist depends on today, so there are none until the clock is
  // there (lib/clock.ts) — an empty picker for one render beats a list with
  // 1970 in it.
  const years = useMemo(
    () => (now === null ? [] : reviewableYears(entries, now)),
    [entries, now],
  );
  const [year, setYear] = useState<number | null>(initialYear ?? null);
  // A year that is no longer offered (the current one, from a stale link) falls
  // back to the newest completed one rather than reviewing half a year.
  const activeYear = year !== null && years.includes(year) ? year : years[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <SectionTitle level={1}>{t("yearInReview.title")}</SectionTitle>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            {t("yearInReview.intro")}
          </p>
        </div>
        {years.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t("yearInReview.yearLabel")}</span>
            <select
              className="rounded-lg border border-border-c bg-surface-2 px-2.5 py-1.5 text-sm"
              value={activeYear}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Nothing to review until a year has actually ended (§4.2). */}
      {now !== null && years.length === 0 && (
        <Card className="space-y-2 text-center">
          <p className="text-lg font-semibold">{t("yearInReview.noYears.title")}</p>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted">
            {t("yearInReview.noYears.body", { year: now.getFullYear() })}
          </p>
        </Card>
      )}

      {/* Remounted per year, which resets the stepper to the first card — a
          year switched mid-review would otherwise open on step 7 of a review
          that may not have seven cards. */}
      {now !== null && years.length > 0 && (
        <YearBody key={activeYear} year={activeYear} entries={entries} now={now} loc={loc} />
      )}
    </div>
  );
}

function YearBody({
  year,
  entries,
  now,
  loc,
}: {
  year: number;
  entries: ReturnType<typeof flattenLedger>;
  now: Date;
  loc: string;
}) {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const currency = portfolio.settings.currencyDisplay;

  const fifo = useMemo(
    () => computeFifo(entries, portfolio.settings.holdingPeriodDays),
    [entries, portfolio.settings.holdingPeriodDays],
  );

  // Historical closes: whatever is already cached, never a request for merely
  // opening the page (§4.2). The button below asks for them on purpose.
  //
  // Read once, when this component mounts — which is once per year, because
  // the parent keys it by the year. A cache lookup during render would make
  // the component non-idempotent for exactly the reason `lib/clock.ts` exists.
  const [closes, setCloses] = useState<Map<number, number>>(() => {
    const cached = peekDailyCloses("EUR", yearStart(year));
    return new Map(cached?.map((c) => [c.time, c.close] as const) ?? []);
  });
  const [closesState, setClosesState] = useState<"idle" | "loading" | "error">("idle");

  function fetchCloses() {
    setClosesState("loading");
    loadDailyCloses("EUR", yearStart(year)).then(
      (series) => {
        setCloses(new Map(series.map((c) => [c.time, c.close])));
        setClosesState("idle");
      },
      () => setClosesState("error"),
    );
  }

  const review = useMemo(
    () =>
      computeYearReview({
        year,
        entries,
        fifo,
        wallets: portfolio.wallets,
        milestones: portfolio.milestones ?? [],
        closeByDay: closes,
        now,
      }),
    [year, entries, fifo, portfolio.wallets, portfolio.milestones, closes, now],
  );

  const [step, setStep] = useState(0);
  // With the tax features off, the two tax cards are not rendered at all —
  // the same rule the tax view and the tax widgets follow (CLAUDE.md §4).
  const cards = useMemo(
    () =>
      TAX_FEATURES_ENABLED
        ? review.cards
        : review.cards.filter((id) => id !== "taxFree" && id !== "realized"),
    [review.cards],
  );
  /** The cards, plus the summary as the last station. */
  const steps: (YearReviewCardId | "summary")[] = [...cards, "summary"];
  const current = steps[Math.min(step, steps.length - 1)];

  // Left/right arrows step through the review. Only when nothing is focused —
  // otherwise they would fight the year select and the share switch.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target !== document.body) return;
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length]);

  if (!review.hasData) {
    return (
      <Card className="space-y-2 text-center">
        <p className="text-lg font-semibold">{t("yearInReview.empty.title", { year })}</p>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted">
          {t("yearInReview.empty.body")}
        </p>
      </Card>
    );
  }

  const content =
    current === "summary" ? null : cardContent(current, review, { t, loc, currency });

  return (
    <div className="space-y-3">
      <Card className="min-h-72">
        {/* One short movement per step, and none at all for anyone who asked
            for less of it (motion-safe). The key restarts it per card. */}
        <div
          key={current}
          className="motion-safe:animate-[review-in_260ms_ease-out]"
          aria-live="polite"
        >
          {content ? (
            <CardFace content={content} />
          ) : (
            <Summary review={review} cards={cards} loc={loc} onJump={(i) => setStep(i)} />
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          {steps.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setStep(i)}
              title={String(i + 1)}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-accent" : "w-1.5 bg-border-c hover:bg-muted"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">
            {t("yearInReview.step", { current: step + 1, total: steps.length })}
          </span>
          <Button onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}>
            ← {t("yearInReview.back")}
          </Button>
          <Button
            variant="primary"
            onClick={() => setStep((s) => Math.min(s + 1, steps.length - 1))}
            disabled={step >= steps.length - 1}
          >
            {t("yearInReview.next")} →
          </Button>
        </div>
      </div>

      {/* The market comparison is the one figure that needs data the file does
          not contain. Asked for, never taken. */}
      {review.avgPrice !== null && review.avgPrice.marketAvgEur === null && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-border-c bg-surface/60 p-3 text-xs text-muted">
          <span>{t("yearInReview.market.missing")}</span>
          {closesState === "error" ? (
            <span className="text-loss">{t("yearInReview.market.error")}</span>
          ) : (
            <Button
              variant="ghost"
              onClick={fetchCloses}
              disabled={closesState === "loading"}
              className="underline decoration-dotted"
            >
              {closesState === "loading"
                ? t("yearInReview.market.loading")
                : t("yearInReview.market.load")}
            </Button>
          )}
        </p>
      )}

      {current === "summary" && <YearInReviewShare review={review} loc={loc} />}
    </div>
  );
}

/** The card itself: one figure, one sentence, and what supports them. */
function CardFace({ content }: { content: CardContent }) {
  return (
    <div className="flex min-h-64 flex-col justify-center gap-3 py-2 text-center">
      <p className="text-xs tracking-wider text-muted uppercase">{content.label}</p>
      <p className="font-heading text-4xl leading-tight font-bold break-words sm:text-5xl">
        {content.signed !== undefined ? (
          <PnlValue value={content.signed}>{content.value}</PnlValue>
        ) : content.absolute ? (
          <Amount className="text-accent">{content.value}</Amount>
        ) : (
          <span className="text-accent">{content.value}</span>
        )}
      </p>
      <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted">
        {content.sentence}
      </p>
      {content.details && content.details.length > 0 && (
        <dl className="mx-auto grid w-full max-w-md grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {content.details.map((d) => (
            <div key={d.label} className="col-span-2 flex justify-between gap-3 border-b border-border-c/40 py-1 last:border-0">
              <dt className="text-muted">{d.label}</dt>
              <dd className="font-mono">
                {d.absolute ? <Amount>{d.value}</Amount> : d.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {content.extra}
    </div>
  );
}

/** Everything at once, for the end of the stepper. */
function Summary({
  review,
  cards,
  loc,
  onJump,
}: {
  review: YearReview;
  cards: YearReviewCardId[];
  loc: string;
  onJump: (step: number) => void;
}) {
  const { t } = useI18n();
  const currency = useAppStore((s) => s.portfolio!.settings.currencyDisplay);
  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-xs tracking-wider text-muted uppercase">
          {t("yearInReview.summary.label")}
        </p>
        <p className="font-heading text-3xl font-bold">{review.year}</p>
        <p className="mt-1 text-sm text-muted">
          {t("yearInReview.summary.sentence", { count: review.transactionCount })}
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {cards.map((id, i) => {
          const c = cardContent(id, review, { t, loc, currency });
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onJump(i)}
                className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-border-c/60 px-3 py-2 text-left hover:border-accent-dim"
              >
                <span className="text-xs text-muted">{c.label}</span>
                <span className="font-mono text-sm">
                  {c.absolute ? <Amount>{c.value}</Amount> : c.value}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * One card's text. Everything is phrased as something that happened, never as
 * a judgement: a range instead of a best and a worst, "paid" instead of "well
 * bought" (§4.2).
 */
function cardContent(
  id: YearReviewCardId,
  review: YearReview,
  ctx: {
    t: ReturnType<typeof useI18n>["t"];
    loc: string;
    currency: "EUR" | "USD" | "BTC";
  },
): CardContent {
  const { t, loc, currency } = ctx;
  const key = `yearInReview.cards.${id}`;
  const amount = (btc: Decimal) => formatAmount(btc, loc, currency);
  const eur = (v: Decimal) => formatFiat(v, "EUR", loc);
  const pct = (v: number) => formatPercent(v, loc);

  switch (id) {
    case "stacked": {
      const sats = satsOf(review.stacked.netBtc);
      return {
        label: t(`${key}.label`),
        value: amount(review.stacked.netBtc),
        absolute: true,
        sentence:
          review.stacked.buyCount > 0
            ? t(`${key}.sentence`, { buys: formatInt(review.stacked.buyCount, loc) })
            : t(`${key}.sentenceNoBuys`),
        details: [
          {
            label: t(`${key}.buys`),
            value: formatInt(review.stacked.buyCount, loc),
          },
          {
            label: t(`${key}.inSats`),
            value: `${formatInt(sats, loc)} sats`,
            absolute: true,
          },
          ...(review.stacked.growth !== null
            ? [{ label: t(`${key}.growth`), value: pct(review.stacked.growth) }]
            : []),
        ],
      };
    }
    case "invested":
      return {
        label: t(`${key}.label`),
        value: eur(review.invested.investedEur),
        absolute: true,
        sentence: t(`${key}.sentence`, {
          buys: formatInt(review.invested.buyCount, loc),
        }),
        details: [
          ...(review.invested.buyCount > 0
            ? [
                {
                  label: t(`${key}.perBuy`),
                  value: eur(
                    review.invested.investedEur.div(review.invested.buyCount),
                  ),
                  absolute: true,
                },
              ]
            : []),
          ...(review.invested.buysWithoutEur > 0
            ? [
                {
                  label: t(`${key}.withoutEur`),
                  value: formatInt(review.invested.buysWithoutEur, loc),
                },
              ]
            : []),
        ],
      };
    case "avgPrice": {
      const a = review.avgPrice!;
      return {
        label: t(`${key}.label`),
        value: eur(a.yourAvgEur),
        sentence:
          a.vsMarket === null
            ? t(`${key}.sentenceNoMarket`)
            : t(a.vsMarket <= 0 ? `${key}.sentenceBelow` : `${key}.sentenceAbove`, {
                percent: pct(Math.abs(a.vsMarket)).replace("+", ""),
              }),
        details: [
          ...(a.marketAvgEur !== null
            ? [
                { label: t(`${key}.market`), value: eur(a.marketAvgEur) },
                {
                  label: t(`${key}.marketDays`),
                  value: formatInt(a.marketDays, loc),
                },
              ]
            : []),
        ],
      };
    }
    case "priceRange": {
      const r = review.priceRange!;
      return {
        label: t(`${key}.label`),
        value: `${eur(r.lowEur)} – ${eur(r.highEur)}`,
        sentence: t(`${key}.sentence`, { buys: formatInt(r.buyCount, loc) }),
        details: [
          { label: t(`${key}.spread`), value: eur(r.highEur.minus(r.lowEur)) },
        ],
      };
    }
    case "rhythm": {
      const r = review.rhythm!;
      return {
        label: t(`${key}.label`),
        value: monthName(review.year, r.busiestMonth, loc),
        sentence: t(`${key}.sentence`, {
          buys: formatInt(r.busiestMonthBuys, loc),
          weekday: weekdayName(r.busiestWeekday, loc),
        }),
        details: [
          {
            label: t(`${key}.monthAmount`),
            value: formatAmount(r.busiestMonthBtc, loc, currency),
            absolute: true,
          },
          {
            label: t(`${key}.weekdayBuys`),
            value: formatInt(r.busiestWeekdayBuys, loc),
          },
        ],
      };
    }
    case "streak": {
      const s = review.streak!;
      return {
        label: t(`${key}.label`),
        value: t(`${key}.value.${s.unit}`, { count: formatInt(s.length, loc) }),
        sentence: t(`${key}.sentence`),
      };
    }
    case "fees": {
      const f = review.fees;
      return {
        label: t(`${key}.label`),
        value: eur(f.totalEur),
        absolute: true,
        sentence:
          f.shareOfInvested === null
            ? t(`${key}.sentenceNoShare`)
            : t(`${key}.sentence`, {
                percent: pct(f.shareOfInvested).replace("+", ""),
              }),
        details: [
          { label: t(`${key}.trading`), value: eur(f.tradingEur), absolute: true },
          { label: t(`${key}.network`), value: eur(f.networkEur), absolute: true },
          ...(f.unvaluedBtc.gt(0)
            ? [
                {
                  label: t(`${key}.unvalued`),
                  value: formatAmount(f.unvaluedBtc, loc, currency),
                  absolute: true,
                },
              ]
            : []),
        ],
      };
    }
    case "taxFree":
      return {
        label: t(`${key}.label`),
        value: amount(review.taxFree.btc),
        absolute: true,
        sentence: t(`${key}.sentence`, {
          lots: formatInt(review.taxFree.lotCount, loc),
        }),
        details: [
          ...(review.taxFree.unresolvedBtc.gt(0)
            ? [
                {
                  label: t(`${key}.unresolved`),
                  value: formatAmount(review.taxFree.unresolvedBtc, loc, currency),
                  absolute: true,
                },
              ]
            : []),
        ],
        extra: (
          <p className="mx-auto max-w-lg text-[0.65rem] leading-relaxed text-muted">
            {t(`${key}.disclaimer`)}
          </p>
        ),
      };
    case "realized": {
      const r = review.realized;
      return {
        label: t(`${key}.label`),
        value: eur(r.totalGainEur),
        signed: r.totalGainEur.toNumber(),
        sentence: t(`${key}.sentence`, {
          count: formatInt(r.disposalCount, loc),
        }),
        details: [
          { label: t(`${key}.taxable`), value: eur(r.taxableGainEur), absolute: true },
          { label: t(`${key}.taxFree`), value: eur(r.taxFreeGainEur), absolute: true },
          ...(r.unresolvedOriginBtc.gt(0)
            ? [
                {
                  label: t(`${key}.unresolved`),
                  value: formatAmount(r.unresolvedOriginBtc, loc, currency),
                  absolute: true,
                },
              ]
            : []),
        ],
        extra: (
          <p className="mx-auto max-w-lg text-[0.65rem] leading-relaxed text-muted">
            {t(`${key}.disclaimer`)}
          </p>
        ),
      };
    }
    case "custody":
      return {
        label: t(`${key}.label`),
        value: pct(review.custody.shareAtYearEnd).replace("+", ""),
        sentence: t(`${key}.sentence`, {
          count: formatInt(review.custody.toSelfCustody, loc),
        }),
        details: [
          {
            label: t(`${key}.moved`),
            value: formatAmount(review.custody.btcToSelfCustody, loc, currency),
            absolute: true,
          },
        ],
      };
    case "milestones":
      return {
        label: t(`${key}.label`),
        value: formatInt(review.milestones.length, loc),
        sentence: t(`${key}.sentence`),
        extra: (
          <ul className="mx-auto flex max-w-lg flex-wrap justify-center gap-2">
            {review.milestones.map((id) => (
              <li
                key={id}
                className="flex items-center gap-1.5 rounded-full border border-border-c/60 px-2.5 py-1 text-xs"
              >
                <MilestoneIcon id={id} className="h-3.5 w-3.5 text-accent" />
                {t(`milestones.catalog.${id}.title`)}
              </li>
            ))}
          </ul>
        ),
      };
    case "closing": {
      const c = review.closing;
      return {
        label: t(`${key}.label`),
        value: amount(c.btc),
        absolute: true,
        sentence: t(`${key}.sentence`, { year: review.year }),
        details: [
          {
            label: t(`${key}.inSats`),
            value: `${formatInt(satsOf(c.btc), loc)} sats`,
            absolute: true,
          },
          {
            label: t(`${key}.start`),
            value: formatAmount(c.startBtc, loc, currency),
            absolute: true,
          },
        ],
      };
    }
  }
}
