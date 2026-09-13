"use client";

// The holding above the transaction table, and the one in the popover on a
// wallet/account cell.
//
// Both read `lib/holdings.ts` like every other holding surface. What is special
// here is the *fallback*: a filter that is not a scope (a type, a data-quality
// issue, a period) selects transactions rather than coins, so there is no
// holding to state. Saying one anyway would be the worst of the three options
// available — better to show what the rows on screen add up to and say in so
// many words that this is what it is.

import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { useValueFormat } from "@/lib/displayUnit";
import type { Holding, RowTotals } from "@/lib/holdings";
import { Amount, PnlValue } from "./ui";

/** One figure of a summary line: label above, value below. */
function Cell({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="truncate text-[0.65rem] text-muted">{label}</div>
      <div className="truncate font-mono text-xs">{children}</div>
    </div>
  );
}

/**
 * The holding of whatever the filters currently select, above the table.
 *
 * `holding` is set when the filter is a scope (a wallet, one of its accounts,
 * or nothing at all, which is the whole portfolio). Otherwise it is null and
 * the row totals take over, labelled as the sums they are.
 */
export function HoldingSummaryBar({
  scopeName,
  holding,
  totals,
  onOpenDetail,
}: {
  /** Wallet or wallet/account the holding is about; null for everything. */
  scopeName: string | null;
  holding: Holding | null;
  totals: RowTotals;
  onOpenDetail?: () => void;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();

  if (holding === null) {
    return (
      <div className="mb-3 rounded-lg border border-border-c bg-surface-2/40 p-3">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-medium">{t("holdings.summaryRows")}</span>
          <span className="text-[0.65rem] text-muted">
            {t("holdings.summaryRowsHint")}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Cell label={t("holdings.rowsCount")}>{totals.count}</Cell>
          <Cell label={`${t("holdings.rowsIn")} (${fmt.unit})`}>
            <Amount>{fmt.amount(totals.inflowBtc)}</Amount>
          </Cell>
          <Cell label={`${t("holdings.rowsOut")} (${fmt.unit})`}>
            <Amount>{fmt.amount(totals.outflowBtc)}</Amount>
          </Cell>
          {/* A net figure is a change, so its sign comes from the formatter. */}
          <Cell label={`${t("holdings.rowsNet")} (${fmt.unit})`}>
            <Amount>{fmt.amount(totals.netBtc, true)}</Amount>
          </Cell>
          <Cell label={`${t("holdings.rowsFees")} (${fmt.unit})`}>
            <Amount>{fmt.amount(totals.feeBtc)}</Amount>
          </Cell>
          <Cell
            label={t("holdings.rowsValue")}
            hint={t("holdings.rowsValueHint", {
              count: totals.valuedCount,
              total: totals.count,
            })}
          >
            <Amount>{fmt.fiat(totals.valueEur)}</Amount>
          </Cell>
        </div>
      </div>
    );
  }

  const pnl = holding.unrealizedPnlEur;
  return (
    <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="text-xs font-medium">
          {scopeName === null
            ? t("holdings.summaryAll")
            : t("holdings.summaryScope", { name: scopeName })}
        </span>
        {onOpenDetail && (
          <button className="text-[0.65rem] text-accent hover:underline" onClick={onOpenDetail}>
            {t("holdings.openDetail")} →
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Cell label={`${t("holdings.amount")} (${fmt.unit})`}>
          <Amount>{fmt.amount(holding.btc)}</Amount>
        </Cell>
        <Cell label={t("holdings.value")}>
          <Amount>{fmt.fiat(holding.valueEur)}</Amount>
        </Cell>
        <Cell
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
        </Cell>
        <Cell label={t("holdings.pnl")}>
          {pnl === null ? (
            <span className="text-muted">—</span>
          ) : (
            <PnlValue value={pnl.toNumber()}>{fmt.fiat(pnl)}</PnlValue>
          )}
        </Cell>
        {TAX_FEATURES_ENABLED && (
          <>
            <Cell label={`${t("holdings.taxFree")} (${fmt.unit})`}>
              <Amount className="text-gain">{fmt.amount(holding.taxFreeBtc)}</Amount>
            </Cell>
            <Cell label={`${t("holdings.taxable")} (${fmt.unit})`}>
              <Amount className="text-warning">{fmt.amount(holding.taxableBtc)}</Amount>
            </Cell>
            {/* A cell of its own rather than an appendix to the taxable one:
                appended, it was the first thing the column truncated away, and
                this is precisely the figure that must not go missing (§3.2). */}
            {holding.unresolvedBtc.gt(0) && (
              <Cell
                label={`${t("holdings.unresolved")} (${fmt.unit})`}
                hint={t("holdings.unresolvedHint")}
              >
                <Amount className="text-muted">{fmt.amount(holding.unresolvedBtc)}</Amount>
              </Cell>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The short version, hovering the wallet/account cell of a row.
 *
 * Same behaviour as the other popovers in the table (§5 of the feature): an
 * opaque background, hoverable itself, and closed with a delay so the pointer
 * can reach the link inside. Rendered through a portal for the same reason the
 * transfer popover is: an ancestor row may be faded, and CSS opacity applies
 * to the whole subtree.
 */
export function AccountHoldingPopover({
  holding,
  title,
  pos,
  onOpenDetail,
  onMouseEnter,
  onMouseLeave,
}: {
  holding: Holding;
  title: string;
  pos: { top: number; left: number };
  onOpenDetail: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();

  return createPortal(
    <div
      className="fixed z-50 w-64 space-y-1.5 rounded-lg border border-accent/40 bg-surface p-3 text-xs text-foreground shadow-2xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="truncate font-medium">{title}</p>
      <div className="flex justify-between gap-2">
        <span className="text-muted">{t("holdings.amount")}</span>
        <Amount className="font-mono">{fmt.amountWithUnit(holding.btc)}</Amount>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted">{t("holdings.value")}</span>
        <Amount className="font-mono">{fmt.fiat(holding.valueEur)}</Amount>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted">{t("holdings.lotCount")}</span>
        <span className="font-mono">{holding.lots.length}</span>
      </div>
      <button className="mt-1 text-accent hover:underline" onClick={onOpenDetail}>
        {t("holdings.openDetail")} →
      </button>
    </div>,
    document.body,
  );
}
