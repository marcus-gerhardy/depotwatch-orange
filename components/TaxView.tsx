"use client";

import { useMemo, useState } from "react";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { flattenLedger } from "@/lib/types";
import { computeFifo, daysUntilTaxFree, isLotTaxFree } from "@/lib/fifo";
import { formatFiat } from "@/lib/decimal";
import { useAmountFormat } from "@/lib/displayUnit";
import { downloadAsFile } from "@/lib/fileStorage";
import { Amount, Button, Card, PnlValue, SectionTitle, inputCls } from "./ui";

export default function TaxView() {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  // Holdings follow the display unit (BTC or sats, §6.3); the EUR figures
  // below are tax figures and stay in the ledger's currency.
  const amountFmt = useAmountFormat();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const achieveMilestone = useAppStore((s) => s.achieveMilestone);
  const holdingDays = portfolio.settings.holdingPeriodDays;

  const entries = useMemo(() => flattenLedger(portfolio.wallets), [portfolio]);
  const fifo = useMemo(
    () => computeFifo(entries, holdingDays),
    [entries, holdingDays],
  );

  const years = useMemo(() => {
    const ys = new Set(fifo.disposals.map((d) => new Date(d.date).getFullYear()));
    return [...ys].sort((a, b) => b - a);
  }, [fifo.disposals]);
  const [year, setYear] = useState<string>("");

  const disposals = useMemo(
    () =>
      fifo.disposals
        .filter((d) => !year || new Date(d.date).getFullYear() === Number(year))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [fifo.disposals, year],
  );

  const totals = useMemo(() => {
    let gain = 0;
    let taxable = 0;
    let free = 0;
    for (const d of disposals) {
      gain += d.gainEur.toNumber();
      taxable += d.taxableGainEur.toNumber();
      free += d.taxFreeGainEur.toNumber();
    }
    return { gain, taxable, free };
  }, [disposals]);

  const uncovered = fifo.disposals.filter((d) => d.uncoveredBtc.gt(0));

  /**
   * The year's disposals as CSV, for a tax adviser or one's own records. Plain
   * text, generated and downloaded locally like everything else here: an
   * export that uploaded the disposals somewhere would contradict the whole
   * app. Semicolons and a decimal comma, because that is what German
   * spreadsheet software expects from a file it is handed.
   */
  function exportCsv() {
    const de = (v: string | number) => String(v).replace(".", ",");
    const header = [
      t("tx.date"), t("tx.type"), t("tx.amountBtc"), t("tax.proceeds"),
      t("tax.cost"), t("tax.gain"), t("tax.taxableGain"), t("tax.taxFreeGain"),
    ];
    const lines = disposals.map((d) => [
      d.date.slice(0, 10),
      t(`tx.types.${d.type}`),
      de(d.amountBtc.toFixed(8)),
      de(d.proceedsEur.toFixed(2)),
      de(d.costBasisEur.toFixed(2)),
      de(d.gainEur.toFixed(2)),
      de(d.taxableGainEur.toFixed(2)),
      de(d.taxFreeGainEur.toFixed(2)),
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    downloadAsFile(`${csv}\r\n`, `${t("tax.exportFileName")}-${year}.csv`, "text/csv");
    achieveMilestone("taxExported");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle level={1}>{t("tax.title")}</SectionTitle>
        <Button
          variant="ghost"
          onClick={exportCsv}
          disabled={disposals.length === 0}
          title={t("tax.exportHint")}
        >
          ⭳ {t("tax.export")}
        </Button>
      </div>
      <p className="text-xs text-muted">{t("tax.disclaimer", { days: holdingDays })}</p>

      {uncovered.length > 0 && (
        <Card className="border-warning/50">
          {uncovered.map((d) => (
            <p key={d.txId} className="text-sm text-warning">
              ⚠ {t("tax.uncoveredWarning", { amount: amountFmt.formatWithUnit(d.uncoveredBtc) })}
            </p>
          ))}
        </Card>
      )}

      <Card>
        <SectionTitle level={2}>{t("tax.openLots")}</SectionTitle>
        {fifo.openLots.length === 0 ? (
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
                  <th className="py-2 pr-4 font-normal">{t("tax.taxFreeFrom")}</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                  <th className="py-2 font-normal">{t("tx.note")}</th>
                </tr>
              </thead>
              <tbody>
                {fifo.openLots.map((lot, i) => {
                  const free = isLotTaxFree(lot);
                  const days = daysUntilTaxFree(lot);
                  return (
                    <tr key={`${lot.txId}-${i}`} className="border-b border-border-c/50">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {formatDate(lot.acquiredDate, loc)}
                      </td>
                      <td className="py-2 pr-4 text-muted">
                        {lot.walletName} / {lot.accountName}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        <Amount>{amountFmt.format(lot.remainingBtc)}</Amount>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        {lot.costPerBtcEur ? (
                          <Amount>{formatFiat(lot.costPerBtcEur, "EUR", loc)}</Amount>
                        ) : (
                          <span
                            className="cursor-help text-muted"
                            title={t("tax.unknownBasis")}
                          >
                            ?
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {/* An unresolved origin leaves the arrival date as the
                            only date there is, and that one says nothing about
                            a holding period (CLAUDE.md §3.2). */}
                        {lot.originUnresolved ? "?" : formatDate(lot.taxFreeDate, loc)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {lot.originUnresolved ? (
                          <span
                            className="cursor-help rounded bg-warning/15 px-2 py-0.5 text-xs text-warning"
                            title={t("tx.origin.unlinkedHint")}
                          >
                            {t("tx.origin.badge")}
                          </span>
                        ) : free ? (
                          <span className="rounded bg-gain/15 px-2 py-0.5 text-xs text-gain">
                            {t("tax.taxFreeNow")}
                          </span>
                        ) : (
                          <span className="rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">
                            {t("tax.daysLeft", { days })}
                          </span>
                        )}
                      </td>
                      <td
                        className="max-w-40 truncate py-2 text-xs text-muted"
                        title={lot.note || undefined}
                      >
                        {lot.note || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionTitle level={2}>{t("tax.disposals")}</SectionTitle>
          {years.length > 0 && (
            <select
              className={`${inputCls} w-auto`}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="">
                {t("tax.year")}: {t("tx.filterAll")}
              </option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
        {disposals.length === 0 ? (
          <p className="text-sm text-muted">{t("tax.emptyDisposals")}</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted">{t("tax.totalRealized")}</div>
                <PnlValue value={totals.gain}>
                  {formatFiat(totals.gain, "EUR", loc)}
                </PnlValue>
              </div>
              <div>
                <div className="text-xs text-muted">{t("tax.taxableGain")}</div>
                <Amount>{formatFiat(totals.taxable, "EUR", loc)}</Amount>
              </div>
              <div>
                <div className="text-xs text-muted">{t("tax.taxFreeGain")}</div>
                <Amount>{formatFiat(totals.free, "EUR", loc)}</Amount>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-c text-left text-xs text-muted">
                    <th className="py-2 pr-4 font-normal">{t("tx.date")}</th>
                    <th className="py-2 pr-4 font-normal">{t("tx.type")}</th>
                    <th className="py-2 pr-4 text-right font-normal">{t("tax.amount")}</th>
                    <th className="py-2 pr-4 text-right font-normal">{t("tax.proceeds")}</th>
                    <th className="py-2 pr-4 text-right font-normal">{t("tax.cost")}</th>
                    <th className="py-2 pr-4 text-right font-normal">{t("tax.gain")}</th>
                    <th className="py-2 pr-4 text-right font-normal">{t("tax.taxableGain")}</th>
                    <th className="py-2 font-normal">{t("tx.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {disposals.map((d) => (
                    <tr key={d.txId} className="border-b border-border-c/50">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {formatDate(d.date, loc)}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="flex items-center gap-1.5">
                          {t(`tx.types.${d.type}`)}
                          {/* Part of this disposal came from lots whose origin
                              is unknown, so its taxable/tax-free split rests on
                              an arrival date. Name it instead of totalling it
                              in silently. */}
                          {d.unresolvedOriginBtc.gt(0) && (
                            <span
                              className="cursor-help rounded bg-warning/15 px-2 py-0.5 text-[10px] whitespace-nowrap text-warning"
                              title={t("tax.unresolvedOriginHint", {
                                amount: amountFmt.formatWithUnit(d.unresolvedOriginBtc),
                              })}
                            >
                              {t("tx.origin.badge")}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        <Amount>{amountFmt.format(d.amountBtc)}</Amount>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        <Amount>{formatFiat(d.proceedsEur, "EUR", loc)}</Amount>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        <Amount>{formatFiat(d.costBasisEur, "EUR", loc)}</Amount>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        <PnlValue value={d.gainEur.toNumber()}>
                          {formatFiat(d.gainEur, "EUR", loc)}
                        </PnlValue>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">
                        <Amount>{formatFiat(d.taxableGainEur, "EUR", loc)}</Amount>
                      </td>
                      <td
                        className="max-w-40 truncate py-2 text-xs text-muted"
                        title={d.note || undefined}
                      >
                        {d.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
