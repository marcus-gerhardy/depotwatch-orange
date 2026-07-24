"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n, intlLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { flattenLedger } from "@/lib/types";
import { computeFifo } from "@/lib/fifo";
import { accountBalances } from "@/lib/portfolio";
import { fetchSpotPrice } from "@/lib/binance";
import { formatBtc, formatFiat } from "@/lib/decimal";
import { Amount, Card, PnlValue, SectionTitle } from "./ui";
import PortfolioChart from "./PortfolioChart";

export default function Dashboard({
  onSelectAccount,
}: {
  /** Jump to the transactions view filtered to this wallet/account. */
  onSelectAccount?: (walletId: string, accountId: string) => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const currency = portfolio.settings.currencyDisplay;

  const [priceEur, setPriceEur] = useState<number | null>(null);
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [priceError, setPriceError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [eur, usd] = await Promise.all([
          fetchSpotPrice("EUR"),
          fetchSpotPrice("USD"),
        ]);
        if (!cancelled) {
          setPriceEur(eur);
          setPriceUsd(usd);
          setPriceError(false);
        }
      } catch {
        if (!cancelled) setPriceError(true);
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const entries = useMemo(() => flattenLedger(portfolio.wallets), [portfolio]);
  const fifo = useMemo(
    () => computeFifo(entries, portfolio.settings.holdingPeriodDays),
    [entries, portfolio.settings.holdingPeriodDays],
  );
  const balances = useMemo(() => accountBalances(entries), [entries]);

  // Ledger costs are EUR; convert for USD display via the BTC cross rate.
  const eurToDisplay =
    currency === "EUR" ? 1 : priceEur && priceUsd ? priceUsd / priceEur : null;
  const displayPrice = currency === "EUR" ? priceEur : priceUsd;

  const totalBtc = fifo.totalBtc.toNumber();
  const totalValue = displayPrice !== null ? totalBtc * displayPrice : null;
  const openCostEur = fifo.openCostBasisEur.toNumber();
  const unrealizedEur =
    priceEur !== null ? totalBtc * priceEur - openCostEur : null;

  const fmtDisplay = (vEur: number | null) =>
    vEur === null || eurToDisplay === null
      ? "—"
      : formatFiat(vEur * eurToDisplay, currency, loc);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <div className="text-xs text-muted">{t("dashboard.totalValue")}</div>
          <div className="mt-1 text-xl font-bold">
            <Amount>
              {totalValue !== null
                ? formatFiat(totalValue, currency, loc)
                : "—"}
            </Amount>
          </div>
          <div className="mt-1 text-xs text-muted">
            <Amount>{formatBtc(fifo.totalBtc, loc)} BTC</Amount>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-muted">{t("dashboard.price")}</div>
          <div className="mt-1 text-xl font-bold text-accent">
            {displayPrice !== null
              ? formatFiat(displayPrice, currency, loc)
              : priceError
                ? t("dashboard.priceUnavailable")
                : "…"}
          </div>
          <div className="mt-1 text-xs text-muted">
            {t("dashboard.avgCost")}:{" "}
            <Amount>
              {fifo.avgCostPerBtcEur
                ? fmtDisplay(fifo.avgCostPerBtcEur.toNumber())
                : "—"}
            </Amount>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-muted">{t("dashboard.unrealizedPnl")}</div>
          <div className="mt-1 text-xl font-bold">
            <PnlValue value={unrealizedEur ?? 0}>
              {fmtDisplay(unrealizedEur)}
            </PnlValue>
          </div>
          <div className="mt-1 text-xs text-muted">
            {t("dashboard.costBasis")}: <Amount>{fmtDisplay(openCostEur)}</Amount>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-muted">{t("dashboard.realizedPnl")}</div>
          <div className="mt-1 text-xl font-bold">
            <PnlValue value={fifo.realizedGainEur.toNumber()}>
              {fmtDisplay(fifo.realizedGainEur.toNumber())}
            </PnlValue>
          </div>
          <div className="mt-1 flex gap-3 text-xs text-muted">
            <span>
              {t("tax.taxFreeGain")}:{" "}
              <Amount>{fmtDisplay(fifo.realizedTaxFreeGainEur.toNumber())}</Amount>
            </span>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>{t("dashboard.chartTitle")}</SectionTitle>
        <PortfolioChart entries={entries} />
      </Card>

      {balances.length > 0 && (
        <Card>
          <SectionTitle>{t("dashboard.byWallet")}</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-c text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-normal">{t("dashboard.wallet")}</th>
                  <th className="py-2 pr-4 font-normal">{t("dashboard.account")}</th>
                  <th className="py-2 pr-4 text-right font-normal">
                    {t("dashboard.balance")} (BTC)
                  </th>
                  <th className="py-2 text-right font-normal">
                    {t("dashboard.value")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr
                    key={b.accountId}
                    className="cursor-pointer border-b border-border-c/50 hover:bg-surface-2/50"
                    title={t("dashboard.showTransactions")}
                    onClick={() => onSelectAccount?.(b.walletId, b.accountId)}
                  >
                    <td className="py-2 pr-4">{b.walletName}</td>
                    <td className="py-2 pr-4 text-muted">{b.accountName}</td>
                    <td className="py-2 pr-4 text-right font-mono">
                      <Amount>{formatBtc(b.btc, loc)}</Amount>
                    </td>
                    <td className="py-2 text-right font-mono">
                      <Amount>
                        {displayPrice !== null
                          ? formatFiat(
                              b.btc.toNumber() * displayPrice,
                              currency,
                              loc,
                            )
                          : "—"}
                      </Amount>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
