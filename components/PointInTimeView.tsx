"use client";

// The portfolio as it stood on a past date (CLAUDE.md §4.3).
//
// "What did I hold on 31 December" is a question the tax return asks every
// year and the live view cannot answer. The figures come from
// `lib/pointInTime.ts`, which runs the *same* engine over the same ledger with
// everything after the cut-off left out — so this view can never disagree with
// the live one about a lot, a holding period or a cost basis.
//
// Two things it insists on. It says what it is, loudly: a historical figure
// that could be mistaken for the current one is worse than no figure. And it
// reads only — there is no action here that could write anything, and the
// store would refuse it anyway.

import { useMemo, useState } from "react";
import HelpButton from "./help/HelpButton";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { flattenLedger } from "@/lib/types";
import { periodBetween, portfolioAsOf, yearEndOptions } from "@/lib/pointInTime";
import { isLotTaxFree } from "@/lib/fifo";
import { formatFiat } from "@/lib/decimal";
import { useAmountFormat } from "@/lib/displayUnit";
import { downloadAsFile } from "@/lib/fileStorage";
import { loadDailyCloses, peekDailyCloses } from "@/lib/marketData";
import { useNowDate } from "@/lib/clock";
import { Amount, Button, Card, PnlValue, SectionTitle, inputCls } from "./ui";
import PrintHeader from "./PrintHeader";
import { DownloadIcon, WarnIcon } from "./icons";

/** Open lots shown before "show more" — the same figure the tax view uses. */
const PAGE_SIZE = 50;

/** yyyy-mm-dd for a date input, in local time. */
function inputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function PointInTimeView({
  /** Back to the tax page, which is where this view is reached from (§4.3). */
  onBack,
}: {
  onBack?: () => void;
} = {}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const amountFmt = useAmountFormat();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const now = useNowDate();

  const entries = useMemo(() => flattenLedger(portfolio.wallets), [portfolio]);
  const yearEnds = useMemo(
    () => (now ? yearEndOptions(entries, now) : []),
    [entries, now],
  );
  const [date, setDate] = useState<string>(() =>
    inputValue(yearEndOptions(entries)[0] ?? new Date()),
  );
  /**
   * Optional start of a period (§4.3).
   *
   * Empty is the normal case and the simpler question: "what did I hold on
   * this day". Filled in, the same day becomes the *end* of a span, and the
   * view additionally reports what happened in it — which is the other half of
   * what a tax return asks about a year.
   */
  const [fromDate, setFromDate] = useState<string>("");
  /**
   * Rows shown on screen. A savings plan puts hundreds of open lots here, and
   * rendered whole they make a page tens of thousands of pixels tall (§5.3).
   *
   * On paper the opposite is true: a report that stops after fifty lots is not
   * a report. So the rest is *rendered and hidden*, and print shows it — the
   * one case where hiding with CSS rather than not rendering is the right
   * trade, because the printed document needs the rows to exist.
   */
  const [lotLimit, setLotLimit] = useState(PAGE_SIZE);

  const chosen = useMemo(() => {
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [date]);

  const start = useMemo(() => {
    if (fromDate === "") return null;
    const parsed = new Date(`${fromDate}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [fromDate]);

  /** Set only while a period is asked for *and* it runs the right way round. */
  const period = useMemo(
    () =>
      chosen && start && start.getTime() <= chosen.getTime()
        ? periodBetween(entries, start, chosen, portfolio.settings.holdingPeriodDays)
        : null,
    [entries, start, chosen, portfolio.settings.holdingPeriodDays],
  );

  const at = useMemo(
    () =>
      period
        ? period.closing
        : chosen
          ? portfolioAsOf(entries, chosen, portfolio.settings.holdingPeriodDays)
          : null,
    [period, entries, chosen, portfolio.settings.holdingPeriodDays],
  );

  /**
   * The BTC price of that day, for the market value.
   *
   * Only what is already cached — the same rule the year in review follows
   * (§4.2): merely opening a view must not fetch a year of history. Asked for
   * on purpose with the button below, which reuses the dashboard's cache key.
   */
  const [closes, setCloses] = useState(() =>
    peekDailyCloses("EUR", entries.length > 0 ? Date.parse(entries[0].date) : Date.now()),
  );
  const [loadingPrice, setLoadingPrice] = useState(false);
  const priceAt = useMemo(() => {
    if (!closes || !chosen) return null;
    const day = Math.floor(chosen.getTime() / 86_400_000) * 86_400_000;
    // The closest close at or before that day: a weekend has no candle, and
    // the last price before it is what the coins were worth.
    let best: number | null = null;
    for (const c of closes) if (c.time <= day + 86_400_000) best = c.close;
    return best;
  }, [closes, chosen]);

  if (!at || !chosen) return null;

  const marketValue = priceAt === null ? null : at.balanceBtc.mul(priceAt);

  function exportCsv() {
    if (!at || !chosen) return;
    const de = (v: string | number) => String(v).replace(".", ",");
    const rows: string[][] = [
      ...(period
        ? [
            [t("pit.from"), formatDate(period.from, loc)],
            [t("pit.to"), formatDate(period.to, loc)],
            [t("pit.opening"), de(period.opening.balanceBtc.toFixed(8))],
            [t("pit.closing"), de(period.closing.balanceBtc.toFixed(8))],
            [t("pit.change"), de(period.changeBtc.toFixed(8))],
            [t("pit.realized"), de(period.realizedGainEur.toFixed(2))],
            [t("tax.taxableGain"), de(period.realizedTaxableGainEur.toFixed(2))],
            [t("tax.taxFreeGain"), de(period.realizedTaxFreeGainEur.toFixed(2))],
            [],
          ]
        : [[t("pit.exportAsOf"), formatDate(at.asOf, loc)]]),
      [t("pit.holding"), de(at.balanceBtc.toFixed(8))],
      [t("pit.costBasis"), de(at.costBasisEur.toFixed(2))],
      ...(marketValue ? [[t("pit.marketValue"), de(marketValue.toFixed(2))]] : []),
      [],
      [t("dashboard.wallet"), t("dashboard.account"), "BTC"],
      ...at.balances.map((b) => [b.walletName, b.accountName, de(b.btc.toFixed(8))]),
      [],
      [
        t("tax.acquired"),
        t("tx.wallet"),
        t("tx.account"),
        t("tax.remaining"),
        t("tax.costPerBtc"),
        "Status",
      ],
      ...at.openLots.map((l) => [
        l.acquiredDate.slice(0, 10),
        l.walletName,
        l.accountName,
        de(l.remainingBtc.toFixed(8)),
        l.costPerBtcEur ? de(l.costPerBtcEur.toFixed(2)) : "",
        l.originUnresolved
          ? t("tx.origin.badge")
          : isLotTaxFree(l, at.asOf)
            ? t("tax.taxFreeNow")
            : t("pit.stillLocked"),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    downloadAsFile(
      `${csv}\r\n`,
      `${t("pit.exportFileName")}-${fromDate ? `${fromDate}_` : ""}${date}.csv`,
      "text/csv",
    );
  }

  /**
   * "PDF" without a PDF library: the browser's own print dialog, which offers
   * "save as PDF" everywhere. A megabyte of dependency to render what the page
   * already renders would be a poor trade, and print styles are something the
   * app maintains anyway (§5, print uses the light theme).
   */
  function printPdf() {
    window.print();
  }

  const asOfLabel = period
    ? `${formatDate(period.from, loc)} – ${formatDate(period.to, loc)}`
    : formatDate(at.asOf, loc);

  return (
    <div className="space-y-4">
      {/* The sheet identifies itself; the screen's own header does that job
          on screen and is gone here (§5.4). */}
      <PrintHeader title={t("pit.title")} subtitle={asOfLabel} />
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-3 rounded-lg px-1.5 py-0.5 text-sm text-muted transition-colors hover:text-foreground print:hidden"
            >
              ← {t("nav.tax")}
            </button>
          )}
          <SectionTitle level={1}>{t("pit.title")}</SectionTitle>
          <HelpButton anchor="pit-what" label={t("pit.title")} className="mb-3" />
        </div>
        <div className="flex gap-2 print:hidden">
          <Button onClick={exportCsv} title={t("pit.exportHint")}>
            <DownloadIcon /> {t("pit.exportCsv")}
          </Button>
          <Button onClick={printPdf} title={t("pit.printHint")}>
            {t("pit.printPdf")}
          </Button>
        </div>
      </div>

      {/* Said before any figure is read: everything below is history. */}
      <p className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm leading-relaxed text-accent print:hidden">
        {period
          ? t("pit.bannerPeriod", {
              from: formatDate(period.from, loc),
              to: formatDate(period.to, loc),
            })
          : t("pit.banner", { date: formatDate(at.asOf, loc) })}
      </p>

      <Card className="space-y-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          {/* Optional, and second: the common question is a single day. With
              a start date the same field becomes the end of a span. */}
          <label className="block">
            <span className="mb-1 block text-xs text-muted">{t("pit.from")}</span>
            <input
              type="date"
              className={inputCls}
              value={fromDate}
              max={date}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              {period ? t("pit.to") : t("pit.date")}
            </span>
            <input
              type="date"
              className={inputCls}
              value={date}
              max={inputValue(new Date())}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {fromDate !== "" && (
            <Button className="px-2 py-1 text-xs" onClick={() => setFromDate("")}>
              {t("pit.clearFrom")}
            </Button>
          )}
          {yearEnds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {/* The 31st of December is what a tax return asks for, so it is
                  one click rather than a date to type. */}
              {yearEnds.slice(0, 6).map((d) => (
                <Button
                  key={d.getFullYear()}
                  variant={date === inputValue(d) ? "primary" : "default"}
                  className="px-2 py-1 text-xs"
                  onClick={() => {
                    setDate(inputValue(d));
                    // A year is asked about as a whole far more often than as
                    // its last instant, so picking one sets both ends — and
                    // the period cards can still be dropped with one click.
                    setFromDate(inputValue(new Date(d.getFullYear(), 0, 1)));
                  }}
                >
                  {d.getFullYear()}
                </Button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* What the period did, above what it ended at: with a span selected,
          the movement is the question and the closing state is the context. */}
      {period && (
        <Card className="space-y-3">
          <SectionTitle level={2}>{t("pit.periodTitle")}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted">{t("pit.opening")}</p>
              <p className="mt-1 font-mono text-lg">
                <Amount>{amountFmt.formatWithUnit(period.opening.balanceBtc)}</Amount>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("pit.closing")}</p>
              <p className="mt-1 font-mono text-lg">
                <Amount>{amountFmt.formatWithUnit(period.closing.balanceBtc)}</Amount>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("pit.change")}</p>
              <p className="mt-1 font-mono text-lg">
                <PnlValue value={period.changeBtc.toNumber()}>
                  {amountFmt.format(period.changeBtc)}
                </PnlValue>
              </p>
              <p className="mt-1 text-xs text-muted">
                {t("pit.boughtSold", {
                  bought: amountFmt.format(period.boughtBtc),
                  sold: amountFmt.format(period.disposedBtc),
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("pit.realized")}</p>
              <p className="mt-1 font-mono text-lg">
                <PnlValue value={period.realizedGainEur.toNumber()}>
                  {formatFiat(period.realizedGainEur, "EUR", loc)}
                </PnlValue>
              </p>
              <p className="mt-1 text-xs text-muted">
                {t("pit.realizedSplit", {
                  taxable: formatFiat(period.realizedTaxableGainEur, "EUR", loc),
                  free: formatFiat(period.realizedTaxFreeGainEur, "EUR", loc),
                })}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted">
            {t("pit.periodCounts", {
              transactions: period.entriesInPeriod.length,
              disposals: period.disposals.length,
            })}
            {/* Neither is a private disposal (§3.2), so neither is in the
                realised figure — but leaving them unmentioned in a period
                report would hide coins that moved. */}
            {period.giftsOut.length > 0 &&
              ` · ${t("pit.periodGifts", { count: period.giftsOut.length })}`}
            {period.incomeReceipts.length > 0 &&
              ` · ${t("pit.periodIncome", { count: period.incomeReceipts.length })}`}
          </p>
        </Card>
      )}

      <div
        className={`grid gap-3 sm:grid-cols-2 ${period ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
      >
        {/* Only without a period: with one, the card above already gives the
            holding at both ends, and saying it a third time is noise. */}
        {!period && (
          <Card>
            <p className="text-xs text-muted">{t("pit.holding")}</p>
            <p className="mt-1 text-xl font-bold">
              <Amount>{amountFmt.formatWithUnit(at.balanceBtc)}</Amount>
            </p>
          </Card>
        )}
        <Card>
          <p className="text-xs text-muted">{t("pit.costBasis")}</p>
          <p className="mt-1 text-xl font-bold">
            <Amount>{formatFiat(at.costBasisEur, "EUR", loc)}</Amount>
          </p>
          {/* The cost basis covers only the lots that have one — saying so is
              the difference between a figure and a wrong figure (§4.1). */}
          {at.basisBtc.lt(at.balanceBtc) && (
            <p className="mt-1 text-xs text-warning">
              <WarnIcon />{" "}
              {t("pit.basisPartial", {
                amount: amountFmt.formatWithUnit(at.balanceBtc.minus(at.basisBtc)),
              })}
            </p>
          )}
        </Card>
        <Card>
          <p className="text-xs text-muted">{t("pit.marketValue")}</p>
          {marketValue === null ? (
            <div className="mt-1 space-y-2">
              <p className="text-sm text-muted">{t("pit.noPrice")}</p>
              <Button
                className="print:hidden"
                disabled={loadingPrice}
                onClick={() => {
                  setLoadingPrice(true);
                  void loadDailyCloses(
                    "EUR",
                    entries.length > 0 ? Date.parse(entries[0].date) : Date.now(),
                  )
                    .then(setCloses)
                    .catch(() => {})
                    .finally(() => setLoadingPrice(false));
                }}
              >
                {loadingPrice ? t("common.loading") : t("pit.loadPrice")}
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-xl font-bold">
                <Amount>{formatFiat(marketValue, "EUR", loc)}</Amount>
              </p>
              <p className="mt-1 text-xs text-muted">
                {t("pit.atPrice", { price: formatFiat(priceAt ?? 0, "EUR", loc) })}
              </p>
            </>
          )}
        </Card>
        <Card>
          <p className="text-xs text-muted">{t("pit.taxFreeThen")}</p>
          <p className="mt-1 text-xl font-bold text-gain">
            <Amount>{amountFmt.formatWithUnit(at.taxFreeBtc)}</Amount>
          </p>
          <p className="mt-1 text-xs text-muted">
            {t("pit.lockedThen", { amount: amountFmt.formatWithUnit(at.lockedBtc) })}
          </p>
          {at.unresolvedBtc.gt(0) && (
            <p className="mt-1 text-xs text-warning">
              <WarnIcon />{" "}
              {t("pit.unresolvedThen", {
                amount: amountFmt.formatWithUnit(at.unresolvedBtc),
              })}
            </p>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle level={2}>{t("pit.byAccount")}</SectionTitle>
        {at.balances.length === 0 ? (
          <p className="text-sm text-muted">{t("pit.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-c text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-normal">{t("dashboard.wallet")}</th>
                  <th className="py-2 pr-4 font-normal">{t("dashboard.account")}</th>
                  <th className="py-2 text-right font-normal">{amountFmt.unit}</th>
                </tr>
              </thead>
              <tbody>
                {at.balances.map((b) => (
                  <tr key={b.accountId} className="border-b border-border-c/50">
                    <td className="py-2 pr-4 whitespace-nowrap">{b.walletName}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-muted">{b.accountName}</td>
                    <td className="py-2 text-right font-mono whitespace-nowrap">
                      <Amount>{amountFmt.format(b.btc)}</Amount>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle level={2}>{t("pit.openLots")}</SectionTitle>
        {at.openLots.length === 0 ? (
          <p className="text-sm text-muted">{t("tax.emptyLots")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-c text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-normal">{t("tax.acquired")}</th>
                  <th className="py-2 pr-4 font-normal">
                    {t("tx.wallet")} / {t("tx.account")}
                  </th>
                  <th className="py-2 pr-4 text-right font-normal">{t("tax.remaining")}</th>
                  <th className="py-2 pr-4 text-right font-normal">{t("tax.costPerBtc")}</th>
                  <th className="py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {at.openLots.map((lot, i) => (
                  <tr
                    key={`${lot.txId}-${i}`}
                    className={`border-b border-border-c/50 ${
                      i >= lotLimit ? "hidden print:table-row" : ""
                    }`}
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {formatDate(lot.acquiredDate, loc)}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-muted">
                      {lot.walletName} / {lot.accountName}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                      <Amount>{amountFmt.format(lot.remainingBtc)}</Amount>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                      {lot.costPerBtcEur ? (
                        <Amount>{formatFiat(lot.costPerBtcEur, "EUR", loc)}</Amount>
                      ) : (
                        <span className="cursor-help text-muted" title={t("tax.unknownBasis")}>
                          ?
                        </span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {lot.originUnresolved ? (
                        <span className="rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">
                          {t("tx.origin.badge")}
                        </span>
                      ) : isLotTaxFree(lot, at.asOf) ? (
                        <span className="rounded bg-gain/15 px-2 py-0.5 text-xs text-gain">
                          {t("tax.taxFreeNow")}
                        </span>
                      ) : (
                        <span className="rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">
                          {t("pit.stillLocked")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {at.openLots.length > lotLimit && (
              <div className="pt-3 text-center print:hidden">
                <Button onClick={() => setLotLimit((n) => n + PAGE_SIZE)}>
                  {t("common.showMore", {
                    count: Math.min(at.openLots.length - lotLimit, PAGE_SIZE),
                  })}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <p className="text-xs text-muted">{t("pit.disclaimer")}</p>
      {/* Only on paper: a sheet that leaves the app has to carry it. */}
      <p className="hidden text-[9pt] print:block">{t("print.disclaimer")}</p>
    </div>
  );
}
