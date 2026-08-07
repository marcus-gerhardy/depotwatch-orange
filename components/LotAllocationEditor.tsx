"use client";

import { useMemo, useState } from "react";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { dec, formatBtc, formatFiatPlain } from "@/lib/decimal";
import {
  allocationSumBtc,
  allocationTargetBtc,
  lotAvailability,
} from "@/lib/transferLink";
import type { LedgerEntry, LotAllocation } from "@/lib/types";
import { Amount, Button, inputCls } from "./ui";
import NumberInput, { decimalPlaceholder } from "./NumberInput";
import LotPicker, { lotPricePerBtc } from "./LotPicker";

/**
 * Which source lots an outgoing transfer closes (CLAUDE.md §3.2), editable.
 *
 * The allocations belong to the transaction being edited, so they are form
 * state here and are written by the form's save, not per click. What the
 * component owns is the arithmetic around them: how much of each lot is still
 * free (all *other* transactions' claims counted, this one's own excluded), and
 * whether the assignments add up to what actually left the account.
 */
export default function LotAllocationEditor({
  entry,
  entries,
  allocations,
  amountBtc,
  feeBtc,
  onChange,
}: {
  /** The transfer_out being edited. */
  entry: LedgerEntry;
  entries: LedgerEntry[];
  allocations: LotAllocation[];
  /** Live form values, so the target follows what the user is typing. */
  amountBtc: string;
  feeBtc: string;
  onChange: (next: LotAllocation[]) => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const [picking, setPicking] = useState(false);

  const lots = useMemo(
    () => lotAvailability(entries, { accountId: entry.accountId, excludeTxId: entry.id }),
    [entries, entry.accountId, entry.id],
  );
  const lotById = useMemo(
    () => new Map(lots.map((l) => [l.entry.id, l])),
    [lots],
  );

  const target = allocationTargetBtc({ amountBtc, feeBtc });
  const assigned = allocationSumBtc(allocations);
  const diff = target.minus(assigned);

  /** Lots not yet in the list and with something left to give. */
  const pickable = lots.filter(
    (l) =>
      l.availableBtc.gt(0) && !allocations.some((a) => a.lotTransactionId === l.entry.id),
  );

  /** Newest purchase first — what one is looking for right after an import. */
  const rows = useMemo(
    () =>
      [...allocations].sort((a, b) =>
        (lotById.get(b.lotTransactionId)?.entry.date ?? "").localeCompare(
          lotById.get(a.lotTransactionId)?.entry.date ?? "",
        ),
      ),
    [allocations, lotById],
  );

  function setAmount(lotTxId: string, value: string) {
    onChange(
      allocations.map((a) =>
        a.lotTransactionId === lotTxId ? { ...a, amountBtc: value } : a,
      ),
    );
  }

  function remove(lotTxId: string) {
    onChange(allocations.filter((a) => a.lotTransactionId !== lotTxId));
  }

  /**
   * Any number of lots at once; the picker has already sized each share. The
   * merged list is kept oldest lot first — the FIFO engine takes the network
   * fee off the last allocation, so the stored order decides which lot pays it
   * and must not depend on the order the user happened to click in.
   */
  function add(picks: LotAllocation[]) {
    const dateOf = (a: LotAllocation) => lotById.get(a.lotTransactionId)?.entry.date ?? "";
    onChange(
      [...allocations, ...picks].sort((a, b) => dateOf(a).localeCompare(dateOf(b))),
    );
    setPicking(false);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-muted">{t("tx.allocations.intro")}</p>

      {allocations.length === 0 ? (
        <p className="text-xs text-muted">{t("tx.allocations.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-c text-left text-muted">
                <th className="py-1 pr-2 font-normal">{t("tx.allocations.acquired")}</th>
                <th className="py-1 pr-2 font-normal">{t("tx.allocations.source")}</th>
                <th className="py-1 pr-2 text-right font-normal">
                  {t("tx.allocations.price")}
                </th>
                <th className="py-1 pr-2 text-right font-normal">
                  {t("tx.allocations.available")}
                </th>
                <th className="py-1 pr-2 text-right font-normal">
                  {t("tx.allocations.amount")}
                </th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const lot = lotById.get(a.lotTransactionId);
                const value = dec(a.amountBtc);
                // Availability already excludes this transaction's own claim,
                // so the check is against what the lot could still give it.
                const tooMuch = lot !== undefined && value.gt(lot.availableBtc);
                const price = lot ? lotPricePerBtc(lot.entry) : null;
                return (
                  <tr key={a.lotTransactionId} className="border-b border-border-c/40">
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {lot ? formatDate(lot.entry.date, loc) : "—"}
                    </td>
                    <td className="py-1 pr-2 text-muted">
                      {lot ? `${lot.entry.walletName} / ${lot.entry.accountName}` : "—"}
                    </td>
                    <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">
                      {price === null ? (
                        <span className="text-muted">?</span>
                      ) : (
                        <Amount>{formatFiatPlain(price, loc)}</Amount>
                      )}
                    </td>
                    <td className="py-1 pr-2 text-right font-mono whitespace-nowrap text-muted">
                      {lot ? formatBtc(lot.availableBtc, loc) : "—"}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <NumberInput
                        className={`${tooMuch ? `${inputCls} border-loss!` : inputCls} w-32 text-right font-mono`}
                        placeholder={decimalPlaceholder(loc, 8)}
                        value={a.amountBtc}
                        onChange={(v) => setAmount(a.lotTransactionId, v)}
                      />
                      {tooMuch && (
                        <span className="mt-0.5 block text-[0.65rem] text-loss">
                          {t("tx.allocations.exceedsLot", {
                            available: formatBtc(lot!.availableBtc, loc),
                          })}
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        className="rounded-md p-1 text-muted hover:bg-loss/10 hover:text-loss"
                        title={t("tx.allocations.remove")}
                        aria-label={t("tx.allocations.remove")}
                        onClick={() => remove(a.lotTransactionId)}
                      >
                        <svg
                          aria-hidden
                          viewBox="0 0 16 16"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        >
                          <path d="M3.5 8h9" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Button onClick={() => setPicking(true)} disabled={pickable.length === 0}>
          + {t("tx.allocations.add")}
        </Button>
        <dl className="flex items-center gap-3 font-mono">
          <span>
            <dt className="inline text-muted">{t("tx.allocations.target")}: </dt>
            <dd className="inline">
              <Amount>{formatBtc(target, loc)}</Amount>
            </dd>
          </span>
          <span>
            <dt className="inline text-muted">{t("tx.allocations.assigned")}: </dt>
            <dd className={`inline ${diff.isZero() ? "" : "text-warning"}`}>
              <Amount>{formatBtc(assigned, loc)}</Amount>
            </dd>
          </span>
        </dl>
      </div>

      {/* How far the assignment has got, at a glance. Over-assignment fills the
          bar and colours it, so "too much" never looks like "done". */}
      {target.gt(0) && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${
              diff.isZero() ? "bg-gain" : diff.lt(0) ? "bg-loss" : "bg-accent"
            }`}
            style={{
              width: `${Math.min(100, Math.max(0, assigned.div(target).mul(100).toNumber()))}%`,
            }}
          />
        </div>
      )}

      {/* A deviation never blocks saving — an import can legitimately land
          here half-assigned — but it is stated in BTC, not just implied. */}
      {diff.isZero() ? (
        <p className="text-xs text-gain">✓ {t("tx.allocations.complete")}</p>
      ) : (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          ⚠{" "}
          {diff.gt(0)
            ? t("tx.allocations.unassigned", { amount: formatBtc(diff, loc) })
            : t("tx.allocations.over", { amount: formatBtc(diff.abs(), loc) })}
        </p>
      )}

      {picking && (
        <LotPicker
          lots={pickable}
          neededBtc={diff}
          onCancel={() => setPicking(false)}
          onConfirm={add}
        />
      )}
    </div>
  );
}
