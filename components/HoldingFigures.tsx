"use client";

// How a holding is written down, wherever one is shown.
//
// The figures themselves come from `lib/holdings.ts` (one computation, §1 of
// the holdings feature); this is the one way of rendering them, so the wallet
// detail view, the wallet list, the transaction table's summary row and its
// popover cannot end up disagreeing about what "cost basis" means or which
// figures carry a sign. Everything goes through `Amount`, so the privacy mode
// blurs a balance here exactly as it does everywhere else.

import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { formatPercent, type Decimal } from "@/lib/decimal";
import { daysUntilTaxFree } from "@/lib/fifo";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { useValueFormat } from "@/lib/displayUnit";
import type { Holding, HoldingLot } from "@/lib/holdings";
import { Amount, PnlValue } from "./ui";
import { WarnIcon } from "./icons";

/** One labelled figure. The label is muted, the figure is not. */
export function Figure({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-sm">{children}</div>
      {hint !== undefined && (
        <div className="mt-0.5 text-[0.65rem] leading-relaxed text-muted">{hint}</div>
      )}
    </div>
  );
}

/**
 * Amount, market value, cost basis and unrealized result.
 *
 * The result is deliberately the one over `basisBtc` rather than over the whole
 * holding (§4.1): coins whose acquisition price is unknown are part of the
 * holding but contribute no cost, and valuing them against a partial basis
 * would book their entire market value as profit. What they are is said
 * underneath instead of being averaged in.
 */
export function HoldingFigures({ holding }: { holding: Holding }) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const fmt = useValueFormat();
  const pnl = holding.unrealizedPnlEur;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Figure label={`${t("holdings.amount")} (${fmt.unit})`}>
        <Amount>{fmt.amount(holding.btc)}</Amount>
      </Figure>
      <Figure
        label={t("holdings.value")}
        hint={holding.valueEur === null ? t("holdings.noPrice") : undefined}
      >
        <Amount>{fmt.fiat(holding.valueEur)}</Amount>
      </Figure>
      <Figure
        label={t("holdings.costBasis")}
        hint={
          holding.unknownBasisBtc.gt(0)
            ? t("holdings.unknownBasis", {
                amount: fmt.amountWithUnit(holding.unknownBasisBtc),
              })
            : undefined
        }
      >
        <Amount>{fmt.fiat(holding.costBasisEur)}</Amount>
        {/* The average sits under the total rather than beside it: side by
            side the pair is wider than a quarter of a phone screen, and it was
            the average that got cut off. */}
        {holding.avgCostPerBtcEur !== null && (
          <span className="block text-xs text-muted">
            <Amount>{`Ø ${fmt.fiat(holding.avgCostPerBtcEur)}`}</Amount>
          </span>
        )}
      </Figure>
      <Figure label={t("holdings.pnl")}>
        {pnl === null ? (
          <span className="text-muted">—</span>
        ) : (
          <PnlValue value={pnl.toNumber()}>
            {fmt.fiat(pnl)}
            {holding.unrealizedPnlPct !== null && (
              <span className="ml-1.5 text-xs">
                {formatPercent(holding.unrealizedPnlPct, loc)}
              </span>
            )}
          </PnlValue>
        )}
      </Figure>
    </div>
  );
}

/**
 * The holding split into what is past the holding period and what is not.
 *
 * Three buckets, not two: a lot whose origin never resolved is counted as
 * neither (§3.2). Its acquisition date is an arrival, so calling it tax-free
 * would be the most favourable possible guess and calling it taxable would be
 * a different guess. It is named instead.
 */
export function TaxSplit({ holding }: { holding: Holding }) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const fmt = useValueFormat();
  if (!TAX_FEATURES_ENABLED) return null;
  const total = holding.openLotsBtc;
  if (!total.gt(0)) return null;

  const share = (part: typeof total) => `${part.div(total).mul(100).toFixed(1)}%`;
  const rows = [
    { key: "taxFree", btc: holding.taxFreeBtc, bar: "bg-gain", text: "text-gain" },
    { key: "taxable", btc: holding.taxableBtc, bar: "bg-warning", text: "text-warning" },
    { key: "unresolved", btc: holding.unresolvedBtc, bar: "bg-muted", text: "text-muted" },
  ].filter((r) => r.btc.gt(0));

  return (
    <div className="space-y-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
        {rows.map((r) => (
          <div
            key={r.key}
            className={`h-full ${r.bar}`}
            style={{ width: share(r.btc) }}
            title={t(`holdings.${r.key}`)}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {rows.map((r) => (
          <span key={r.key} className="flex items-center gap-1.5">
            {/* The colour is never the only carrier: every bucket is labelled. */}
            <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${r.bar}`} />
            <span className={r.text}>{t(`holdings.${r.key}`)}</span>
            <Amount className="font-mono">{fmt.amount(r.btc)}</Amount>
          </span>
        ))}
      </div>
      {holding.unresolvedBtc.gt(0) && (
        <p className="text-[0.65rem] leading-relaxed text-muted">
          {t("holdings.unresolvedHint")}
        </p>
      )}
      {holding.nextTaxFreeDate !== null && (
        <p className="text-[0.65rem] leading-relaxed text-muted">
          {t("holdings.nextTaxFree", {
            date: formatDate(holding.nextTaxFreeDate, loc),
          })}
        </p>
      )}
      <p className="text-[0.65rem] leading-relaxed text-muted">{t("holdings.taxNote")}</p>
    </div>
  );
}

/**
 * The gap between the ledger balance and the engine's open lots (§3.2).
 *
 * Not an error and not hidden: while disposals are unassigned the open lots
 * exceed the balance by exactly the unassigned amount, and saying so is the
 * only way the two figures on this page stop looking like a contradiction.
 */
export function UnassignedNote({ holding }: { holding: Holding }) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  if (!holding.unassignedBtc.gt(0)) return null;
  return (
    <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs leading-relaxed text-warning">
      <WarnIcon />{" "}
      {t("holdings.unassignedGap", {
        amount: fmt.amountWithUnit(holding.unassignedBtc),
      })}
    </p>
  );
}

/**
 * The holding-period verdict of one lot, in the same words and the same colours
 * the transaction table uses. `daysUntilTaxFree` decides it, so this badge and
 * the table's can never disagree about when a lot comes free.
 */
export function LotStatusBadge({ lot }: { lot: HoldingLot }) {
  const { t } = useI18n();
  if (lot.originUnresolved) {
    return (
      <span
        className="cursor-default rounded-full bg-warning/15 px-2 py-0.5 text-[10px] whitespace-nowrap text-warning"
        title={t("holdings.unresolvedHint")}
      >
        {t("tx.origin.badge")}
      </span>
    );
  }
  return lot.taxFree ? (
    <span className="rounded-full bg-gain/15 px-2 py-0.5 text-[10px] whitespace-nowrap text-gain">
      {t("tax.taxFreeNow")}
    </span>
  ) : (
    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] whitespace-nowrap text-warning">
      {t("tax.taxableDaysLeft", { days: daysUntilTaxFree(lot) })}
    </span>
  );
}

/**
 * "Holds this much, and this much afterwards" — the one line that turns a lot
 * assignment from bookkeeping into a decision one can check (§6 of the holdings
 * feature). Shared by the assignment table and the lot picker, so both say it
 * the same way.
 */
export function AccountBalanceLine({
  beforeBtc,
  afterBtc,
}: {
  beforeBtc: Decimal;
  afterBtc: Decimal;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border-c bg-surface-2/40 p-2 text-xs">
      <span>
        <span className="text-muted">{t("holdings.balanceBefore")}: </span>
        <Amount className="font-mono">{fmt.amountWithUnit(beforeBtc)}</Amount>
      </span>
      <span>
        <span className="text-muted">{t("holdings.balanceAfter")}: </span>
        <Amount className={`font-mono ${afterBtc.lt(0) ? "text-loss" : ""}`}>
          {fmt.amountWithUnit(afterBtc)}
        </Amount>
      </span>
      {/* A negative result is a data error, not a style: say it. */}
      {afterBtc.lt(0) && <span className="text-loss">{t("holdings.balanceNegative")}</span>}
    </p>
  );
}
