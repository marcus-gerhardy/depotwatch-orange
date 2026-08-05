"use client";

import { useMemo } from "react";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { Decimal, formatBtc, formatFiatPlain } from "@/lib/decimal";
import { daysUntilTaxFree, isLotTaxFree, taxFreeDateOf } from "@/lib/fifo";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import {
  indexLedger,
  resolveProvenance,
  type OriginLot,
  type Provenance,
} from "@/lib/provenance";
import type { LedgerEntry } from "@/lib/types";
import { Amount, Button } from "./ui";

/**
 * Which original buys a transaction's coins came from (CLAUDE.md §3.2), shown
 * the same way wherever it appears: expanded under a transfer_in row in the
 * transaction table, and as a section in the transaction's detail view.
 *
 * The resolution itself lives in `lib/provenance.ts`; this only renders it —
 * including the two cases that must never be dressed up as a result: shares
 * that do not add up to the transaction's amount, and an arrival whose origin
 * is unknown, which gets the button that opens the assignment dialog instead of
 * an invented acquisition date.
 */
export default function ProvenanceList({
  entry,
  entries,
  holdingPeriodDays,
  onJump,
  onAssign,
}: {
  entry: LedgerEntry;
  entries: LedgerEntry[];
  holdingPeriodDays: number;
  /** Open the original buy transaction; omitted where navigation makes no sense. */
  onJump?: (txId: string) => void;
  /** Open the transfer dialog to link this leg; omitted when it cannot be fixed here. */
  onAssign?: () => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);

  const provenance = useMemo(
    () => resolveProvenance(entry, indexLedger(entries)),
    [entry, entries],
  );

  if (provenance.status === "origin") {
    return <p className="text-xs text-muted">{t("tx.origin.none")}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-muted">{t("tx.origin.intro")}</p>

      {provenance.origins.length > 0 && (
        <OriginTable
          provenance={provenance}
          holdingPeriodDays={holdingPeriodDays}
          loc={loc}
          onJump={onJump}
        />
      )}

      <Notices provenance={provenance} loc={loc} onAssign={onAssign} />
    </div>
  );
}

function OriginTable({
  provenance,
  holdingPeriodDays,
  loc,
  onJump,
}: {
  provenance: Provenance;
  holdingPeriodDays: number;
  loc: string;
  onJump?: (txId: string) => void;
}) {
  const { t } = useI18n();
  /** The shares do not account for the whole transaction (see the footer). */
  const short = !provenance.resolvedBtc.eq(provenance.amountBtc);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border-c text-left text-muted">
            <th className="py-1 pr-3 font-normal">{t("tx.origin.acquired")}</th>
            <th className="py-1 pr-3 text-right font-normal">{t("tx.origin.amount")}</th>
            <th className="py-1 pr-3 text-right font-normal">{t("tx.origin.price")}</th>
            <th className="py-1 pr-3 font-normal">{t("tx.origin.source")}</th>
            {TAX_FEATURES_ENABLED && (
              <th className="py-1 font-normal">{t("tx.origin.status")}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {provenance.origins.map((o) => (
            <OriginRow
              key={o.lotTxId}
              origin={o}
              holdingPeriodDays={holdingPeriodDays}
              loc={loc}
              onJump={onJump}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className={`border-t border-border-c font-medium ${short ? "text-warning" : ""}`}>
            <td className="py-1 pr-3">{t("tx.origin.total")}</td>
            <td className="py-1 pr-3 text-right font-mono whitespace-nowrap">
              <Amount>{formatBtc(provenance.resolvedBtc, loc)}</Amount>
            </td>
            {/* The transaction's own amount only appears when the shares fall
                short of it: printing it next to an identical sum reads as the
                same number twice, with nothing saying which is which. */}
            <td colSpan={TAX_FEATURES_ENABLED ? 3 : 2} className="py-1 whitespace-nowrap">
              {short && (
                <Amount>
                  {t("tx.origin.ofAmount", {
                    amount: formatBtc(provenance.amountBtc, loc),
                  })}
                </Amount>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function OriginRow({
  origin,
  holdingPeriodDays,
  loc,
  onJump,
}: {
  origin: OriginLot;
  holdingPeriodDays: number;
  loc: string;
  onJump?: (txId: string) => void;
}) {
  const { t } = useI18n();
  const lot = { taxFreeDate: taxFreeDateOf(origin.acquiredDate, holdingPeriodDays) };
  const free = isLotTaxFree(lot);

  return (
    <tr
      className={`border-b border-border-c/40 last:border-0 ${
        onJump ? "cursor-pointer hover:bg-surface-2/50" : ""
      }`}
      title={onJump ? t("tx.origin.jump") : undefined}
      onClick={onJump ? () => onJump(origin.lotTxId) : undefined}
    >
      <td className="py-1 pr-3 whitespace-nowrap">{formatDate(origin.acquiredDate, loc)}</td>
      <td className="py-1 pr-3 text-right font-mono whitespace-nowrap">
        <Amount>{formatBtc(origin.amountBtc, loc)}</Amount>
      </td>
      <td className="py-1 pr-3 text-right font-mono whitespace-nowrap">
        {origin.pricePerBtcEur === null ? (
          <span className="cursor-help text-muted" title={t("tx.origin.unknownPrice")}>
            ?
          </span>
        ) : (
          <Amount>{formatFiatPlain(origin.pricePerBtcEur, loc)}</Amount>
        )}
      </td>
      <td className="py-1 pr-3 text-muted">
        {origin.walletName} / {origin.accountName}
      </td>
      {TAX_FEATURES_ENABLED && (
        <td className="py-1 whitespace-nowrap">
          {free ? (
            <span className="rounded-full bg-gain/15 px-2 py-0.5 text-[10px] text-gain">
              {t("tax.taxFreeNow")}
            </span>
          ) : (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
              {t("tax.daysLeft", { days: daysUntilTaxFree(lot) })}
            </span>
          )}
        </td>
      )}
    </tr>
  );
}

/** Everything that is not a resolved share: gaps, breakage, missing links. */
function Notices({
  provenance,
  loc,
  onAssign,
}: {
  provenance: Provenance;
  loc: string;
  onAssign?: () => void;
}) {
  const { t } = useI18n();
  // What the resolver accounted for at all. Traced plus untraceable has to be
  // the transaction's own amount; anything else means the resolver itself lost
  // or invented coins, which is a different (and much worse) problem than a
  // gap in the data, so it gets its own message instead of being folded into
  // the "no traceable origin" line below.
  const accounted = provenance.resolvedBtc.plus(provenance.unresolvedBtc) as Decimal;
  const inconsistency = accounted.minus(provenance.amountBtc) as Decimal;

  return (
    <>
      {provenance.unresolvedBtc.gt(0) && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          ⚠{" "}
          {t("tx.origin.unresolvedAmount", {
            amount: formatBtc(provenance.unresolvedBtc, loc),
          })}
        </p>
      )}
      {!inconsistency.isZero() && (
        <p className="rounded-lg border border-loss/40 bg-loss/10 p-2 text-xs text-loss">
          ⚠ {t("tx.origin.mismatch", { amount: formatBtc(inconsistency.abs(), loc) })}
        </p>
      )}
      {provenance.truncated && (
        <p className="rounded-lg border border-loss/40 bg-loss/10 p-2 text-xs text-loss">
          ⚠ {t("tx.origin.truncated")}
        </p>
      )}
      {(provenance.status === "unlinked" || provenance.status === "unresolvable") && (
        <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-2">
          <p className="text-xs text-warning">
            {provenance.status === "unlinked"
              ? t("tx.origin.unlinkedHint")
              : t("tx.origin.unresolvable")}
          </p>
          {onAssign && (
            <Button variant="primary" onClick={onAssign}>
              {t("tx.origin.assign")}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
