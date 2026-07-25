"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n, intlLocale, formatDate, formatTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { flattenLedger, type LedgerEntry, type TransactionType } from "@/lib/types";
import { dec, formatBtc, formatFiat } from "@/lib/decimal";
import { computeFifo, daysUntilTaxFree, isLotTaxFree, type OpenLot } from "@/lib/fifo";
import { Amount, Button, Card, Field, Modal, SectionTitle, inputCls } from "./ui";
import TransactionForm, { type SellLotTarget } from "./TransactionForm";
import CsvImportWizard from "./CsvImportWizard";

type ColumnKey =
  | "date"
  | "type"
  | "taxStatus"
  | "walletAccount"
  | "note"
  | "amount"
  | "price"
  | "value";

type SortKey = ColumnKey;

const ALL_COLUMNS: ColumnKey[] = [
  "date",
  "type",
  "taxStatus",
  "walletAccount",
  "note",
  "amount",
  "price",
  "value",
];

const RIGHT_ALIGNED: ReadonlySet<ColumnKey> = new Set(["amount", "price", "value"]);

/** Device preference, not portfolio data — lives in localStorage (like CSV templates). */
const COLUMNS_STORAGE_KEY = "depotwatch.txColumns.v1";

function loadVisibleColumns(): Set<ColumnKey> {
  if (typeof window === "undefined") return new Set(ALL_COLUMNS);
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return new Set(ALL_COLUMNS);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(ALL_COLUMNS);
    const valid = parsed.filter((k): k is ColumnKey =>
      (ALL_COLUMNS as string[]).includes(k as string),
    );
    return valid.length > 0 ? new Set(valid) : new Set(ALL_COLUMNS);
  } catch {
    return new Set(ALL_COLUMNS);
  }
}

function saveVisibleColumns(cols: Set<ColumnKey>) {
  try {
    localStorage.setItem(
      COLUMNS_STORAGE_KEY,
      JSON.stringify(ALL_COLUMNS.filter((k) => cols.has(k))),
    );
  } catch {
    // Storage unavailable (private mode) — the choice just won't persist.
  }
}

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

/** Row value in EUR: prefer the actually paid total over price × amount. */
function rowValue(r: LedgerEntry) {
  return r.totalFiatEur != null
    ? dec(r.totalFiatEur)
    : r.pricePerBtcEur !== null
      ? dec(r.amountBtc).mul(dec(r.pricePerBtcEur))
      : null;
}

/** Tax-status badge for a lot-creating transaction with remaining balance. */
function TaxStatusBadge({ lot }: { lot: OpenLot }) {
  const { t } = useI18n();
  return isLotTaxFree(lot) ? (
    <span className="rounded-full bg-gain/15 px-2 py-0.5 text-[10px] text-gain">
      {t("tax.taxFreeNow")}
    </span>
  ) : (
    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
      {t("tax.taxableDaysLeft", { days: daysUntilTaxFree(lot) })}
    </span>
  );
}

/**
 * Bulk "change wallet/account" dialog. Internal transfer legs linked via
 * transferGroupId keep their pairing (the store retargets the counterpart's
 * counterpartyAccountId); a move that would put both legs of one transfer
 * into the same account is blocked here.
 */
function MoveDialog({
  all,
  selected,
  onClose,
  onMoved,
}: {
  all: LedgerEntry[];
  selected: LedgerEntry[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const moveTransactions = useAppStore((s) => s.moveTransactions);

  const [targetWalletId, setTargetWalletId] = useState("");
  const [targetAccountId, setTargetAccountId] = useState("");

  const targetWallet = portfolio.wallets.find((w) => w.id === targetWalletId);
  const targetAccount = targetWallet?.accounts.find((a) => a.id === targetAccountId);

  const analysis = useMemo(() => {
    const selectedIdSet = new Set(selected.map((s) => s.id));
    const byGroup = new Map<string, LedgerEntry[]>();
    for (const e of all) {
      if (!e.transferGroupId) continue;
      const legs = byGroup.get(e.transferGroupId) ?? [];
      legs.push(e);
      byGroup.set(e.transferGroupId, legs);
    }
    let linkedTransfers = 0;
    let legacyTransfers = 0;
    const conflicts = new Set<string>();
    for (const r of selected) {
      const internalTransfer =
        (r.type === "transfer_in" || r.type === "transfer_out") &&
        r.counterpartyAccountId;
      if (!internalTransfer) continue;
      if (!r.transferGroupId) {
        legacyTransfers++;
        if (targetAccountId && r.counterpartyAccountId === targetAccountId) {
          conflicts.add(r.id);
        }
        continue;
      }
      linkedTransfers++;
      if (!targetAccountId) continue;
      for (const other of byGroup.get(r.transferGroupId) ?? []) {
        if (other.id === r.id) continue;
        // Where the counterpart leg ends up after this move.
        const otherPostAccount = selectedIdSet.has(other.id)
          ? targetAccountId
          : other.accountId;
        if (otherPostAccount === targetAccountId) conflicts.add(r.transferGroupId);
      }
    }
    return { linkedTransfers, legacyTransfers, conflicts };
  }, [all, selected, targetAccountId]);

  const targetName = targetWallet && targetAccount
    ? `${targetWallet.name} / ${targetAccount.name}`
    : "";

  return (
    <Modal title={t("tx.changeWalletAccount")} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("tx.wallet")}>
            <select
              className={inputCls}
              value={targetWalletId}
              onChange={(e) => {
                setTargetWalletId(e.target.value);
                setTargetAccountId("");
              }}
            >
              <option value="">—</option>
              {portfolio.wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("tx.account")}>
            <select
              className={inputCls}
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              disabled={!targetWalletId}
            >
              <option value="">—</option>
              {targetWallet?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {targetAccount && (
          <p className="text-sm">
            {t("tx.moveConfirm", { count: selected.length, target: targetName })}
          </p>
        )}

        {analysis.linkedTransfers > 0 && (
          <p className="rounded-lg border border-border-c bg-surface-2/50 p-3 text-xs text-muted">
            {t("tx.moveTransferNote")}
          </p>
        )}
        {analysis.legacyTransfers > 0 && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            {t("tx.moveLegacyTransferWarning", { count: analysis.legacyTransfers })}
          </p>
        )}
        {analysis.conflicts.size > 0 && (
          <p className="rounded-lg border border-loss/40 bg-loss/10 p-3 text-xs text-loss">
            {t("tx.moveTransferConflict", { count: analysis.conflicts.size })}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={
              !targetAccount || selected.length === 0 || analysis.conflicts.size > 0
            }
            onClick={() => {
              moveTransactions(
                selected.map((s) => s.id),
                targetAccountId,
              );
              onMoved();
            }}
          >
            {t("tx.moveAction")}
          </Button>
        </div>
      </div>
    </Modal>
  );
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
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [showMove, setShowMove] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(loadVisibleColumns);
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!colMenuRef.current?.contains(e.target as Node)) setShowColMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showColMenu]);

  const all = useMemo(() => flattenLedger(portfolio.wallets), [portfolio]);

  // Open lot per buy/transfer_in transaction (only lots with remaining > 0).
  // A transfer_in can carry several moved lots under one transaction id —
  // aggregate them: remaining is summed, and the tax-free badge only turns
  // green once every part is past the holding period (latest taxFreeDate).
  const lotByTxId = useMemo(() => {
    const fifo = computeFifo(all, portfolio.settings.holdingPeriodDays);
    const map = new Map<string, OpenLot>();
    for (const l of fifo.openLots) {
      const prev = map.get(l.txId);
      if (!prev) {
        map.set(l.txId, { ...l });
        continue;
      }
      prev.remainingBtc = prev.remainingBtc.plus(l.remainingBtc);
      if (l.taxFreeDate.getTime() > prev.taxFreeDate.getTime()) {
        prev.taxFreeDate = l.taxFreeDate;
        prev.acquiredDate = l.acquiredDate;
      }
    }
    return map;
  }, [all, portfolio.settings.holdingPeriodDays]);

  // Sort key for the tax-status column: tax-free first, then by days left
  // ascending; rows without an open lot always go last.
  const taxSortKey = (r: LedgerEntry): number => {
    const lot = lotByTxId.get(r.id);
    if (!lot) return Number.POSITIVE_INFINITY;
    return isLotTaxFree(lot) ? -1 : daysUntilTaxFree(lot);
  };

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
    // Nullable numeric columns: null rows always sort last, regardless of direction.
    const cmpNullable = (a: ReturnType<typeof rowValue>, b: ReturnType<typeof rowValue>) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a.cmp(b) * dir;
    };
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "amount":
          return dec(a.amountBtc).cmp(dec(b.amountBtc)) * dir;
        case "type":
          return a.type.localeCompare(b.type) * dir;
        case "walletAccount":
          return (
            `${a.walletName} / ${a.accountName}`.localeCompare(
              `${b.walletName} / ${b.accountName}`,
              loc,
            ) * dir
          );
        case "note":
          return (a.note || "").localeCompare(b.note || "", loc) * dir;
        case "price":
          return cmpNullable(
            a.pricePerBtcEur === null ? null : dec(a.pricePerBtcEur),
            b.pricePerBtcEur === null ? null : dec(b.pricePerBtcEur),
          );
        case "value":
          return cmpNullable(rowValue(a), rowValue(b));
        case "taxStatus": {
          const ka = taxSortKey(a);
          const kb = taxSortKey(b);
          const aNone = !Number.isFinite(ka);
          const bNone = !Number.isFinite(kb);
          if (aNone || bNone) return aNone === bNone ? 0 : aNone ? 1 : -1;
          return (ka - kb) * dir;
        }
        default:
          return a.date.localeCompare(b.date) * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filterWallet, filterAccount, filterType, filterFrom, filterTo, onlyTaxFree, lotByTxId, sortKey, sortAsc, loc]);

  const wallet = portfolio.wallets.find((w) => w.id === filterWallet);

  const totalPages =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp instead of an effect so a shrinking result set can't strand the page.
  const currentPage = Math.min(page, totalPages);
  const paged =
    pageSize === "all"
      ? filtered
      : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Selection may hold ids of meanwhile deleted/filter-invisible rows; the
  // action bar and the move dialog only ever act on rows that still exist.
  const selectedEntries = useMemo(
    () => all.filter((e) => selectedIds.has(e.id)),
    [all, selectedIds],
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someFilteredSelected = filtered.some((r) => selectedIds.has(r.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveVisibleColumns(next);
      return next;
    });
  }

  const columnLabel = (key: ColumnKey): string => {
    switch (key) {
      case "date":
        return t("tx.date");
      case "type":
        return t("tx.type");
      case "taxStatus":
        return t("tx.taxStatus");
      case "walletAccount":
        return `${t("tx.wallet")} / ${t("tx.account")}`;
      case "note":
        return t("tx.note");
      case "amount":
        return t("tx.amountBtc");
      case "price":
        return t("tx.priceEur");
      case "value":
        return t("tx.valueEur");
    }
  };

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

  function header(key: SortKey) {
    if (!visibleCols.has(key)) return null;
    const right = RIGHT_ALIGNED.has(key);
    return (
      <th
        key={key}
        className={`cursor-pointer select-none py-2 pr-4 font-normal hover:text-foreground ${right ? "text-right" : "text-left"}`}
        onClick={() => {
          if (sortKey === key) setSortAsc(!sortAsc);
          else {
            setSortKey(key);
            setSortAsc(false);
          }
        }}
      >
        {columnLabel(key)} {sortKey === key ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  const visibleColSpan = visibleCols.size + 2; // + checkbox and actions columns

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

        <div className="mb-3 flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
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

          <div className="relative" ref={colMenuRef}>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-border-c bg-surface-2 px-2.5 py-1.5 text-xs text-muted hover:border-accent-dim hover:text-foreground"
              title={t("tx.columns")}
              aria-label={t("tx.columns")}
              aria-expanded={showColMenu}
              onClick={() => setShowColMenu((v) => !v)}
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
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
                <path d="M6.16 2.5v11M9.83 2.5v11" />
              </svg>
              {t("tx.columns")}
            </button>
            {showColMenu && (
              <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-border-c bg-surface p-1.5 shadow-2xl">
                {ALL_COLUMNS.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(key)}
                      onChange={() => toggleColumn(key)}
                    />
                    {columnLabel(key)}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedEntries.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            <span className="font-medium text-accent">
              {t("tx.selectedCount", { count: selectedEntries.length })}
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="primary" onClick={() => setShowMove(true)}>
                {t("tx.changeWalletAccount")}
              </Button>
              <Button variant="ghost" onClick={() => setSelectedIds(new Set())}>
                {t("tx.clearSelection")}
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-c text-xs text-muted">
                <th className="w-8 py-2 pr-3 text-left font-normal">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                    }}
                    disabled={filtered.length === 0}
                    aria-label={t("tx.selectAll")}
                    title={t("tx.selectAll")}
                    onChange={toggleSelectAll}
                  />
                </th>
                {header("date")}
                {header("type")}
                {header("taxStatus")}
                {header("walletAccount")}
                {header("note")}
                {header("amount")}
                {header("price")}
                {header("value")}
                <th className="py-2 text-right font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={visibleColSpan} className="py-6 text-center text-muted">
                    {t("tx.empty")}
                  </td>
                </tr>
              )}
              {paged.map((r) => {
                const value = rowValue(r);
                const d = new Date(r.date);
                const lot = lotByTxId.get(r.id);
                return (
                  <tr
                    key={`${r.accountId}-${r.id}`}
                    className={`cursor-pointer border-b border-border-c/50 hover:bg-surface-2/50 ${
                      selectedIds.has(r.id) ? "bg-accent/5" : ""
                    }`}
                    title={t("tx.edit")}
                    onClick={() => openEdit(r)}
                  >
                    <td
                      className="w-8 py-2 pr-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        aria-label={t("tx.selectRow")}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    {visibleCols.has("date") && (
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <span className="group/date relative cursor-default">
                          {formatDate(d, loc)}
                          <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-md border border-accent/40 bg-surface-2 px-2 py-1 text-xs text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/date:opacity-100">
                            <svg
                              aria-hidden
                              viewBox="0 0 16 16"
                              className="h-3 w-3 text-accent"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            >
                              <circle cx="8" cy="8" r="6.25" />
                              <path d="M8 4.5V8l2.5 1.5" />
                            </svg>
                            {t("tx.timeAt", { time: formatTime(d, loc) })}
                          </span>
                        </span>
                      </td>
                    )}
                    {visibleCols.has("type") && (
                      <td className={`py-2 pr-4 whitespace-nowrap ${TYPE_COLORS[r.type]}`}>
                        {t(`tx.types.${r.type}`)}
                      </td>
                    )}
                    {visibleCols.has("taxStatus") && (
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {lot ? (
                          <TaxStatusBadge lot={lot} />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
                    {visibleCols.has("walletAccount") && (
                      <td className="py-2 pr-4 text-muted">
                        {r.walletName} / {r.accountName}
                      </td>
                    )}
                    {visibleCols.has("note") && (
                      <td
                        className="max-w-40 truncate py-2 pr-4 text-xs text-muted"
                        title={r.note || undefined}
                      >
                        {r.note || "—"}
                      </td>
                    )}
                    {visibleCols.has("amount") && (
                      <td className="py-2 pr-4 text-right font-mono">
                        <Amount>{formatBtc(r.amountBtc, loc, 8)}</Amount>
                      </td>
                    )}
                    {visibleCols.has("price") && (
                      <td className="py-2 pr-4 text-right font-mono">
                        {r.pricePerBtcEur !== null ? (
                          <Amount>{formatFiat(r.pricePerBtcEur, "EUR", loc)}</Amount>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
                    {visibleCols.has("value") && (
                      <td className="py-2 pr-4 text-right font-mono">
                        {value !== null ? (
                          <Amount>{formatFiat(value, "EUR", loc)}</Amount>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
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

      {showMove && (
        <MoveDialog
          all={all}
          selected={selectedEntries}
          onClose={() => setShowMove(false)}
          onMoved={() => {
            setShowMove(false);
            setSelectedIds(new Set());
          }}
        />
      )}

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
