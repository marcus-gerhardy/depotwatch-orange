"use client";

import { useMemo, useState } from "react";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { Decimal, btcString, dec, formatBtc, formatFiatPlain, ZERO } from "@/lib/decimal";
import { buyLotBasis } from "@/lib/fifo";
import type { LotAvailability } from "@/lib/transferLink";
import type { LedgerEntry, LotAllocation } from "@/lib/types";
import { Amount, Button, Field, Modal, inputCls, stopEnterSubmit } from "./ui";

/** Cost per BTC of a lot-creating transaction (§3.2), or null when unknown. */
export function lotPricePerBtc(e: LedgerEntry): Decimal | null {
  if (e.type === "buy") return buyLotBasis(e).costPerBtcEur;
  return e.pricePerBtcEur === null || e.pricePerBtcEur === undefined
    ? null
    : dec(e.pricePerBtcEur);
}

type SortKey = "date" | "type" | "available" | "price";

/**
 * Picking the lots a disposal or an outgoing transfer closes.
 *
 * The lots of a real portfolio are neither few nor in a helpful order, so this
 * is a table rather than a list: newest first by default (that is what one is
 * usually looking for right after an import), sortable by every column,
 * narrowable by text and period, and multi-select — assigning six purchases to
 * one batched transfer should cost one dialog, not six.
 *
 * What each selected lot would contribute is computed and shown *before*
 * confirming (`planned`): as long as the transfer still needs BTC, the
 * selection is filled up in the table's current order and capped per lot, so
 * the sort order doubles as the priority. The result is a plain allocation
 * list, still freely editable afterwards.
 */
export default function LotPicker({
  lots,
  neededBtc,
  onCancel,
  onConfirm,
}: {
  /** Lots that can still be assigned (something left, not already assigned). */
  lots: LotAvailability[];
  /** What the transaction is still short of; zero or less means "no target". */
  neededBtc: Decimal;
  onCancel: () => void;
  onConfirm: (picks: LotAllocation[]) => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);

  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "date",
    desc: true,
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // With an open target the common case is "close the gap"; without one
  // (already fully assigned) every pick takes the lot's whole remainder.
  const [needOnly, setNeedOnly] = useState(true);

  const hasNeed = neededBtc.gt(0);
  const distributeNeed = hasNeed && needOnly;

  const sorted = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    return [...lots].sort((a, b) => {
      switch (sort.key) {
        case "type":
          return dir * a.entry.type.localeCompare(b.entry.type);
        case "available":
          return dir * a.availableBtc.comparedTo(b.availableBtc);
        case "price": {
          // Lots without a known cost basis sort last in either direction —
          // "?" is not a price and pretending it is zero would be a lie.
          const pa = lotPricePerBtc(a.entry);
          const pb = lotPricePerBtc(b.entry);
          if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1;
          return dir * pa.comparedTo(pb);
        }
        default:
          return dir * a.entry.date.localeCompare(b.entry.date);
      }
    });
  }, [lots, sort]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((l) => {
      const e = l.entry;
      if (type !== "" && e.type !== type) return false;
      if (from !== "" && e.date < from) return false;
      if (to !== "" && e.date > `${to}T23:59:59.999Z`) return false;
      if (q === "") return true;
      const haystack = [
        formatDate(e.date, loc),
        e.date,
        e.note ?? "",
        e.walletName,
        e.accountName,
        l.availableBtc.toString(),
        lotPricePerBtc(e)?.toString() ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sorted, query, type, from, to, loc]);

  /**
   * How much each selected lot would contribute. Computed over the full sorted
   * list, not just the visible rows, so narrowing the filter never silently
   * changes what an existing selection means.
   */
  const planned = useMemo(() => {
    const map = new Map<string, Decimal>();
    let remaining = distributeNeed ? neededBtc : null;
    for (const l of sorted) {
      if (!selected.has(l.entry.id)) continue;
      if (remaining === null) {
        map.set(l.entry.id, l.availableBtc);
        continue;
      }
      const take = Decimal.min(l.availableBtc, Decimal.max(ZERO, remaining));
      map.set(l.entry.id, take);
      remaining = remaining.minus(take);
    }
    return map;
  }, [sorted, selected, distributeNeed, neededBtc]);

  const plannedTotal = useMemo(
    () => [...planned.values()].reduce((s, v) => s.plus(v), ZERO),
    [planned],
  );

  const allVisibleSelected =
    visible.length > 0 && visible.every((l) => selected.has(l.entry.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const l of visible) {
        if (allVisibleSelected) next.delete(l.entry.id);
        else next.add(l.entry.id);
      }
      return next;
    });
  }

  function sortBy(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, desc: !s.desc } : { key, desc: key === "date" },
    );
  }

  function confirm() {
    const picks: LotAllocation[] = [];
    for (const l of sorted) {
      const amount = planned.get(l.entry.id);
      if (amount === undefined || !amount.gt(0)) continue;
      picks.push({ lotTransactionId: l.entry.id, amountBtc: btcString(amount) });
    }
    onConfirm(picks);
  }

  const header = (key: SortKey, label: string, right = false) => (
    <th
      className={`py-1.5 pr-2 font-normal ${right ? "text-right" : "text-left"}`}
      aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => sortBy(key)}
      >
        {label}
        <span aria-hidden className={sort.key === key ? "" : "opacity-0"}>
          {sort.desc ? "▾" : "▴"}
        </span>
      </button>
    </th>
  );

  return (
    <Modal title={t("tx.allocations.pickTitle")} onClose={onCancel} size="lg">
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          {t("tx.allocations.pickIntro")}
        </p>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Field label={t("tx.lotPicker.search")}>
            <input
              className={inputCls}
              value={query}
              placeholder={t("tx.lotPicker.searchPlaceholder")}
              onKeyDown={stopEnterSubmit}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <Field label={t("tx.type")}>
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">{t("tx.filterAll")}</option>
              <option value="buy">{t("tx.types.buy")}</option>
              <option value="transfer_in">{t("tx.types.transfer_in")}</option>
            </select>
          </Field>
          <Field label={t("tx.filterFrom")}>
            <input
              type="date"
              className={inputCls}
              value={from}
              onKeyDown={stopEnterSubmit}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label={t("tx.filterTo")}>
            <input
              type="date"
              className={inputCls}
              value={to}
              onKeyDown={stopEnterSubmit}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>

        {lots.length === 0 ? (
          <p className="text-sm text-muted">{t("tx.allocations.pickEmpty")}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted">{t("tx.lotPicker.noMatch")}</p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-lg border border-border-c">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-muted">
                <tr className="border-b border-border-c">
                  <th className="w-8 py-1.5 pl-2">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      aria-label={t("tx.selectAll")}
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                    />
                  </th>
                  {header("date", t("tx.allocations.acquired"))}
                  {header("type", t("tx.type"))}
                  {header("price", t("tx.allocations.price"), true)}
                  {header("available", t("tx.allocations.available"), true)}
                  <th className="py-1.5 pr-2 text-right font-normal">
                    {t("tx.lotPicker.planned")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => {
                  const e = l.entry;
                  const checked = selected.has(e.id);
                  const take = planned.get(e.id);
                  const price = lotPricePerBtc(e);
                  return (
                    <tr
                      key={e.id}
                      className={`cursor-pointer border-b border-border-c/40 ${
                        checked ? "bg-accent/10" : "hover:bg-surface-2/60"
                      }`}
                      onClick={() => toggle(e.id)}
                    >
                      <td className="py-1.5 pl-2">
                        <input
                          type="checkbox"
                          className="accent-accent"
                          aria-label={t("tx.allocations.pickAria", {
                            date: formatDate(e.date, loc),
                          })}
                          checked={checked}
                          onChange={() => toggle(e.id)}
                          onClick={(ev) => ev.stopPropagation()}
                        />
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        {formatDate(e.date, loc)}
                      </td>
                      <td className="py-1.5 pr-2 text-muted">{t(`tx.types.${e.type}`)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono whitespace-nowrap">
                        {price === null ? (
                          <span className="text-muted">?</span>
                        ) : (
                          <Amount>{formatFiatPlain(price, loc)}</Amount>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono whitespace-nowrap text-muted">
                        {formatBtc(l.availableBtc, loc)}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono whitespace-nowrap">
                        {take === undefined ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <Amount className={take.gt(0) ? "text-accent" : "text-muted"}>
                            {formatBtc(take, loc)}
                          </Amount>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasNeed && (
          <label className="flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5 accent-accent"
              checked={needOnly}
              onChange={(e) => setNeedOnly(e.target.checked)}
            />
            <span>
              {t("tx.lotPicker.needOnly", { amount: formatBtc(neededBtc, loc) })}
              <span className="block text-muted">{t("tx.lotPicker.needOnlyHint")}</span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {t("tx.lotPicker.selectedSummary", {
              count: selected.size,
              amount: formatBtc(plannedTotal, loc),
            })}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" disabled={!plannedTotal.gt(0)} onClick={confirm}>
              {t("tx.lotPicker.confirm")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
