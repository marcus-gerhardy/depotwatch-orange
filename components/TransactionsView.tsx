"use client";

import { useMemo, useState } from "react";
import { useI18n, intlLocale, formatDate, formatTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { flattenLedger, type LedgerEntry, type TransactionType } from "@/lib/types";
import { dec, formatBtc, formatFiat } from "@/lib/decimal";
import { computeFifo, daysUntilTaxFree, isLotTaxFree } from "@/lib/fifo";
import { Amount, Button, Card, Modal, SectionTitle, inputCls } from "./ui";
import TransactionForm, { type SellLotTarget } from "./TransactionForm";
import CsvImportWizard from "./CsvImportWizard";

type SortKey = "date" | "amount" | "type";

const TYPE_COLORS: Record<TransactionType, string> = {
  buy: "text-gain",
  sell: "text-loss",
  transfer_in: "text-muted",
  transfer_out: "text-muted",
  spend: "text-warning",
};

const PAGE_SIZES = [25, 50, 75, 100, 125, 150, 175, 200, 225, 250] as const;

/** Windowed page numbers, null = ellipsis (e.g. 1 2 … 7 8 9 … 41 42). */
function pageNumbers(total: number, current: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const shown = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const list: (number | null)[] = [];
  let prev = 0;
  for (let p = 1; p <= total; p++) {
    if (!shown.has(p)) continue;
    if (prev && p - prev > 1) list.push(null);
    list.push(p);
    prev = p;
  }
  return list;
}

export default function TransactionsView({
  initialFilter,
}: {
  /** Pre-set wallet/account filter (e.g. when coming from the dashboard). */
  initialFilter?: { walletId: string; accountId: string } | null;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const deleteTransaction = useAppStore((s) => s.deleteTransaction);

  const [filterWallet, setFilterWallet] = useState(initialFilter?.walletId ?? "");
  const [filterAccount, setFilterAccount] = useState(
    initialFilter?.accountId ?? "",
  );
  const [filterType, setFilterType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [deleting, setDeleting] = useState<LedgerEntry | null>(null);
  const [sellingLot, setSellingLot] = useState<SellLotTarget | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [onlyTaxFree, setOnlyTaxFree] = useState(false);
  const [pageSize, setPageSize] = useState<number | "all">(25);
  const [page, setPage] = useState(1);

  const all = useMemo(() => flattenLedger(portfolio.wallets), [portfolio]);

  // Open lot per buy/transfer_in transaction (only lots with remaining > 0).
  const lotByTxId = useMemo(() => {
    const fifo = computeFifo(all, portfolio.settings.holdingPeriodDays);
    return new Map(fifo.openLots.map((l) => [l.txId, l]));
  }, [all, portfolio.settings.holdingPeriodDays]);

  const filtered = useMemo(() => {
    let rows = all;
    if (filterWallet) rows = rows.filter((r) => r.walletId === filterWallet);
    if (filterAccount) rows = rows.filter((r) => r.accountId === filterAccount);
    if (filterType) rows = rows.filter((r) => r.type === filterType);
    if (filterFrom) rows = rows.filter((r) => r.date >= filterFrom);
    if (filterTo) rows = rows.filter((r) => r.date <= `${filterTo}T23:59:59.999Z`);
    if (onlyTaxFree) {
      rows = rows.filter((r) => {
        const lot = lotByTxId.get(r.id);
        return lot !== undefined && isLotTaxFree(lot);
      });
    }
    const dir = sortAsc ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "amount":
          return dec(a.amountBtc).cmp(dec(b.amountBtc)) * dir;
        case "type":
          return a.type.localeCompare(b.type) * dir;
        default:
          return a.date.localeCompare(b.date) * dir;
      }
    });
  }, [all, filterWallet, filterAccount, filterType, filterFrom, filterTo, onlyTaxFree, lotByTxId, sortKey, sortAsc]);

  const wallet = portfolio.wallets.find((w) => w.id === filterWallet);

  const totalPages =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp instead of an effect so a shrinking result set can't strand the page.
  const currentPage = Math.min(page, totalPages);
  const paged =
    pageSize === "all"
      ? filtered
      : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function openEdit(r: LedgerEntry) {
    setEditing(r);
    setSellingLot(null);
    setShowForm(true);
  }

  function openSellLot(r: LedgerEntry) {
    const lot = lotByTxId.get(r.id);
    if (!lot) return;
    setEditing(null);
    setSellingLot({
      lotTxId: lot.txId,
      maxAmountBtc: lot.remainingBtc.toString(),
      accountId: lot.accountId,
    });
    setShowForm(true);
  }

  function header(key: SortKey, label: string, right = false) {
    return (
      <th
        className={`cursor-pointer select-none py-2 pr-4 font-normal hover:text-foreground ${right ? "text-right" : "text-left"}`}
        onClick={() => {
          if (sortKey === key) setSortAsc(!sortAsc);
          else {
            setSortKey(key);
            setSortAsc(false);
          }
        }}
      >
        {label} {sortKey === key ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>{t("tx.title")}</SectionTitle>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setSellingLot(null);
              setShowForm(true);
            }}
          >
            + {t("tx.add")}
          </Button>
          <Button onClick={() => setShowImport(true)}>
            ⬆ {t("csvImport.button")}
          </Button>
        </div>
      </div>

      <Card>
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <select
            className={inputCls}
            value={filterWallet}
            onChange={(e) => {
              setFilterWallet(e.target.value);
              setFilterAccount("");
              setPage(1);
            }}
          >
            <option value="">
              {t("tx.wallet")}: {t("tx.filterAll")}
            </option>
            {portfolio.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            value={filterAccount}
            onChange={(e) => {
              setFilterAccount(e.target.value);
              setPage(1);
            }}
            disabled={!filterWallet}
          >
            <option value="">
              {t("tx.account")}: {t("tx.filterAll")}
            </option>
            {wallet?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            className={inputCls}
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {t("tx.type")}: {t("tx.filterAll")}
            </option>
            {(["buy", "sell", "transfer_in", "transfer_out", "spend"] as const).map(
              (ty) => (
                <option key={ty} value={ty}>
                  {t(`tx.types.${ty}`)}
                </option>
              ),
            )}
          </select>
          <input
            type="date"
            className={inputCls}
            title={t("tx.filterFrom")}
            value={filterFrom}
            onChange={(e) => {
              setFilterFrom(e.target.value);
              setPage(1);
            }}
          />
          <input
            type="date"
            className={inputCls}
            title={t("tx.filterTo")}
            value={filterTo}
            onChange={(e) => {
              setFilterTo(e.target.value);
              setPage(1);
            }}
          />
          <select
            className={inputCls}
            title={t("tx.rowsPerPage")}
            value={pageSize === "all" ? "all" : String(pageSize)}
            onChange={(e) => {
              setPageSize(e.target.value === "all" ? "all" : Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {t("tx.rowsPerPage")}: {n}
              </option>
            ))}
            <option value="all">
              {t("tx.rowsPerPage")}: {t("tx.allRows")}
            </option>
          </select>
        </div>

        <label className="mb-3 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={onlyTaxFree}
            onChange={(e) => {
              setOnlyTaxFree(e.target.checked);
              setPage(1);
            }}
          />
          {t("tx.onlyTaxFree")}
        </label>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-c text-xs text-muted">
                {header("date", t("tx.date"))}
                {header("type", t("tx.type"))}
                <th className="py-2 pr-4 text-left font-normal">
                  {t("tx.wallet")} / {t("tx.account")}
                </th>
                <th className="py-2 pr-4 text-left font-normal">{t("tx.note")}</th>
                {header("amount", t("tx.amountBtc"), true)}
                <th className="py-2 pr-4 text-right font-normal">{t("tx.priceEur")}</th>
                <th className="py-2 pr-4 text-right font-normal">{t("tx.valueEur")}</th>
                <th className="py-2 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted">
                    {t("tx.empty")}
                  </td>
                </tr>
              )}
              {paged.map((r) => {
                // Prefer the actually paid total over price × amount.
                const value =
                  r.totalFiatEur != null
                    ? dec(r.totalFiatEur)
                    : r.pricePerBtcEur !== null
                      ? dec(r.amountBtc).mul(dec(r.pricePerBtcEur))
                      : null;
                const d = new Date(r.date);
                const lot = lotByTxId.get(r.id);
                return (
                  <tr
                    key={`${r.accountId}-${r.id}`}
                    className="cursor-pointer border-b border-border-c/50 hover:bg-surface-2/50"
                    title={t("tx.edit")}
                    onClick={() => openEdit(r)}
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {formatDate(d, loc)}{" "}
                      <span className="text-muted">{formatTime(d, loc)}</span>
                    </td>
                    <td className={`py-2 pr-4 whitespace-nowrap ${TYPE_COLORS[r.type]}`}>
                      {t(`tx.types.${r.type}`)}
                      {lot &&
                        (isLotTaxFree(lot) ? (
                          <span className="ml-2 rounded-full bg-gain/15 px-2 py-0.5 text-[10px] text-gain">
                            {t("tax.taxFreeNow")}
                          </span>
                        ) : (
                          <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
                            {t("tax.daysLeft", { days: daysUntilTaxFree(lot) })}
                          </span>
                        ))}
                    </td>
                    <td className="py-2 pr-4 text-muted">
                      {r.walletName} / {r.accountName}
                    </td>
                    <td
                      className="max-w-40 truncate py-2 pr-4 text-xs text-muted"
                      title={r.note || undefined}
                    >
                      {r.note || "—"}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      <Amount>{formatBtc(r.amountBtc, loc, 8)}</Amount>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {r.pricePerBtcEur !== null ? (
                        <Amount>{formatFiat(r.pricePerBtcEur, "EUR", loc)}</Amount>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">
                      {value !== null ? (
                        <Amount>{formatFiat(value, "EUR", loc)}</Amount>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {lot && (
                        <button
                          className="mr-1 rounded-md p-1.5 text-muted hover:bg-accent/10 hover:text-accent"
                          title={t("tx.sellLotAction")}
                          aria-label={t("tx.sellLotAction")}
                          onClick={(e) => {
                            e.stopPropagation();
                            openSellLot(r);
                          }}
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 16 16"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="8" cy="8" r="6" />
                            <path d="M5.5 8h5M8.5 5.5 11 8l-2.5 2.5" />
                          </svg>
                        </button>
                      )}
                      <button
                        className="mr-1 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-accent"
                        title={t("common.edit")}
                        aria-label={t("common.edit")}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(r);
                        }}
                      >
                        <svg
                          aria-hidden
                          viewBox="0 0 16 16"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m11.5 2.5 2 2L6 12l-2.7.7L4 10l7.5-7.5Z" />
                        </svg>
                      </button>
                      <button
                        className="rounded-md p-1.5 text-muted hover:bg-loss/10 hover:text-loss"
                        title={t("common.delete")}
                        aria-label={t("common.delete")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(r);
                        }}
                      >
                        <svg
                          aria-hidden
                          viewBox="0 0 16 16"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4M6.5 7v4M9.5 7v4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-c/50 pt-3 text-sm">
            <span className="text-xs text-muted">
              {t("tx.pageOf", { current: currentPage, total: totalPages })}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="rounded-md px-2 py-1 text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                disabled={currentPage <= 1}
                aria-label={t("tx.prevPage")}
                title={t("tx.prevPage")}
                onClick={() => setPage(currentPage - 1)}
              >
                ‹
              </button>
              {pageNumbers(totalPages, currentPage).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="px-1 text-muted">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-7 rounded-md px-2 py-1 text-center ${
                      p === currentPage
                        ? "bg-accent/15 font-semibold text-accent"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                className="rounded-md px-2 py-1 text-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                disabled={currentPage >= totalPages}
                aria-label={t("tx.nextPage")}
                title={t("tx.nextPage")}
                onClick={() => setPage(currentPage + 1)}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </Card>

      {showForm && (
        <TransactionForm
          existing={editing}
          sellLot={sellingLot}
          onClose={() => {
            setShowForm(false);
            setSellingLot(null);
          }}
        />
      )}
      {showImport && <CsvImportWizard onClose={() => setShowImport(false)} />}

      {deleting && (
        <Modal title={t("tx.deleteTitle")} onClose={() => setDeleting(null)}>
          <div className="space-y-4">
            <p className="text-sm">{t("tx.deleteConfirm")}</p>
            <dl className="space-y-2 rounded-lg border border-border-c bg-surface-2/50 p-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("tx.date")}</dt>
                <dd>
                  {formatDate(deleting.date, loc)} {formatTime(deleting.date, loc)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("tx.type")}</dt>
                <dd className={TYPE_COLORS[deleting.type]}>
                  {t(`tx.types.${deleting.type}`)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("tx.amountBtc")}</dt>
                <dd className="font-mono">
                  <Amount>{formatBtc(deleting.amountBtc, loc, 8)}</Amount>
                </dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteTransaction(deleting.id);
                  setDeleting(null);
                }}
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
