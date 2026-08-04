"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useI18n,
  intlLocale,
  formatDate,
  formatDateTime,
  formatTime,
} from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  flattenLedger,
  type LedgerEntry,
  type LotAllocation,
  type PortfolioFile,
  type Transaction,
  type TransactionType,
} from "@/lib/types";
import {
  Decimal,
  btcString,
  dec,
  fiatString,
  formatBtc,
  formatFiat,
  formatFiatPlain,
  ZERO,
} from "@/lib/decimal";
import { computeFifo, daysUntilTaxFree, isLotTaxFree, type OpenLot } from "@/lib/fifo";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { SATS_PER_BTC, type AmountUnit } from "@/lib/csvImport";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/esplora";
import { DATA_ISSUES, hasIssue, type DataIssue } from "@/lib/dataQuality";
import { legacyTransactionColumns } from "@/lib/legacyUiPrefs";
import { deletionImpact } from "@/lib/deletion";
import { Amount, Button, Card, Field, Modal, SectionTitle, Switch, inputCls } from "./ui";
import TransactionForm, { type SellLotTarget } from "./TransactionForm";
import NumberInput, { decimalPlaceholder } from "./NumberInput";
import CsvImportWizard from "./CsvImportWizard";

type ColumnKey =
  | "date"
  | "type"
  | "taxStatus"
  | "walletAccount"
  | "amount"
  | "feeBtc"
  | "price"
  | "value"
  | "originalCurrency"
  | "txid"
  | "address";

type SortKey = ColumnKey;

/** On-chain columns: opt-in, and only ever filled for transfer legs. */
const ON_CHAIN_COLUMNS: ColumnKey[] = ["txid", "address"];

/**
 * Columns that stay hidden until the user picks them: not every ledger carries
 * a BTC fee, an original currency or on-chain data (CLAUDE.md §3.2). This only
 * drives the default; ALL_COLUMNS below decides where they sit.
 */
const OPTIONAL_COLUMNS: ColumnKey[] = [
  "feeBtc",
  "originalCurrency",
  ...ON_CHAIN_COLUMNS,
];

/**
 * Column order. taxStatus only exists while the tax features are enabled —
 * dropping it here also removes it from the picker, the header, the cells, and
 * (via loadVisibleColumns) from any previously stored preference.
 */
const ALL_COLUMNS: ColumnKey[] = [
  "date",
  "type",
  ...(TAX_FEATURES_ENABLED ? (["taxStatus"] as const) : []),
  "walletAccount",
  "amount",
  // Opt-in, but it belongs next to the amount it was charged on.
  "feeBtc",
  "price",
  "value",
  "originalCurrency",
  ...ON_CHAIN_COLUMNS,
];

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ALL_COLUMNS.filter(
  (k) => !OPTIONAL_COLUMNS.includes(k),
);

const RIGHT_ALIGNED: ReadonlySet<ColumnKey> = new Set([
  "amount",
  "feeBtc",
  "price",
  "value",
  "originalCurrency",
]);

/** Keep only keys this build actually has a column for. */
function validColumns(stored: unknown): Set<ColumnKey> | null {
  if (!Array.isArray(stored)) return null;
  const valid = stored.filter((k): k is ColumnKey =>
    (ALL_COLUMNS as string[]).includes(k as string),
  );
  return valid.length > 0 ? new Set(valid) : null;
}

/**
 * Which columns to show: the open portfolio's own setting (CLAUDE.md §3.5),
 * else the preference a previous version of the app left in localStorage, else
 * the default. Filtering through ALL_COLUMNS also drops columns this build no
 * longer has, e.g. the tax-status column while the tax features are off.
 */
function initialVisibleColumns(
  stored: string[] | undefined,
): Set<ColumnKey> {
  return (
    validColumns(stored) ??
    validColumns(legacyTransactionColumns()) ??
    new Set(DEFAULT_VISIBLE_COLUMNS)
  );
}

/** Colour by direction: everything that adds coins green, everything that removes them red. */
const TYPE_COLORS: Record<TransactionType, string> = {
  buy: "text-gain",
  transfer_in: "text-gain",
  sell: "text-loss",
  transfer_out: "text-loss",
  spend: "text-loss",
};

/** Compact per-type glyph for the transaction table's "Typ" column. */
function TypeIcon({ type }: { type: TransactionType }) {
  const svgProps = {
    viewBox: "0 0 16 16",
    className: "h-4 w-4",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (type) {
    case "buy":
      return (
        <svg {...svgProps}>
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 5.25v5.5M5.25 8h5.5" />
        </svg>
      );
    case "sell":
      return (
        <svg {...svgProps}>
          <circle cx="8" cy="8" r="6.25" />
          <path d="M5.25 8h5.5" />
        </svg>
      );
    case "transfer_in":
      return (
        <svg {...svgProps}>
          <path d="M8 3v6M5.5 6.5 8 9l2.5-2.5M3 12.5h10" />
        </svg>
      );
    case "transfer_out":
      return (
        <svg {...svgProps}>
          <path d="M8 9V3M5.5 5.5 8 3l2.5 2.5M3 12.5h10" />
        </svg>
      );
    case "spend":
      return (
        <svg {...svgProps}>
          <rect x="1.5" y="4.5" width="7" height="7" rx="1.2" />
          <path d="M8.5 8h5M11 5.5 13.5 8 11 10.5" />
        </svg>
      );
  }
}

/**
 * Small text tooltip on hover, portaled to document.body so it renders fully
 * opaque even inside a CSS-opacity-faded ancestor (e.g. a fully-transferred
 * lot row) — opacity on an ancestor otherwise washes out the whole subtree,
 * portaled content included, since it can't be un-done by a descendant.
 */
function IconTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function open() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
  }

  return (
    <span
      ref={triggerRef}
      className="inline-flex cursor-default items-center"
      onMouseEnter={open}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 rounded-md border border-accent/40 bg-surface px-2 py-1 text-xs whitespace-nowrap text-foreground shadow-lg"
            style={{ top: pos.top, left: pos.left }}
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}

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

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateInputToIso(v: string): string {
  return v.trim() === "" ? new Date().toISOString() : new Date(v).toISOString();
}

/**
 * Heuristic match score for linking an existing transaction as a transfer
 * leg — lower is closer. Combines date distance (days) with relative amount
 * distance so both a same-day/wrong-amount and a right-amount/wrong-day
 * candidate rank below an actual close match.
 */
function candidateScore(e: LedgerEntry, refDateIso: string, refAmount: Decimal): number {
  const dayDiff =
    Math.abs(new Date(e.date).getTime() - new Date(refDateIso).getTime()) / 86_400_000;
  const amt = dec(e.amountBtc);
  const amountDiffRatio = refAmount.gt(0)
    ? amt.minus(refAmount).abs().div(refAmount).toNumber()
    : amt.abs().toNumber();
  return dayDiff + amountDiffRatio * 30;
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

/** "4a5e1e4b…deda33b" — enough to recognize a value, tooltip has it in full. */
function truncateMiddle(value: string, edge = 8): string {
  return value.length <= edge * 2 + 1
    ? value
    : `${value.slice(0, edge)}…${value.slice(-edge)}`;
}

function CopyButton({ value }: { value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  return (
    <button
      title={copied ? t("tx.copied") : t("tx.copyValue")}
      aria-label={t("tx.copyValue")}
      className="shrink-0 rounded-md p-1 text-muted hover:bg-accent/10 hover:text-accent"
      onClick={(e) => {
        e.stopPropagation(); // the row itself opens the edit modal
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {}, // clipboard blocked (permissions/insecure context)
        );
      }}
    >
      {copied ? (
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 text-gain"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 8.5 6.5 11.5 12.5 5" />
        </svg>
      ) : (
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 3.5a1.5 1.5 0 0 0-1.5-1H4a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1 1.4" />
        </svg>
      )}
    </button>
  );
}

/**
 * Truncated txid/address with the full value on hover, a copy button, and an
 * optional explorer link. The link is a plain anchor the user has to click —
 * rendering the table must never send a txid or address to a third party.
 */
function OnChainCell({
  value,
  explorerUrl,
}: {
  value: string | undefined;
  explorerUrl: string | null;
}) {
  const { t } = useI18n();
  if (!value) return <span className="text-muted">—</span>;
  return (
    <span className="flex items-center gap-0.5">
      <IconTooltip label={value}>
        <span className="font-mono text-xs">{truncateMiddle(value)}</span>
      </IconTooltip>
      <CopyButton value={value} />
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={t("tx.openInExplorer")}
          aria-label={t("tx.openInExplorer")}
          className="shrink-0 rounded-md p-1 text-muted hover:bg-accent/10 hover:text-accent"
          onClick={(e) => e.stopPropagation()}
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
            <path d="M9.5 2.5H13.5V6.5" />
            <path d="M13.5 2.5 7.5 8.5" />
            <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
          </svg>
        </a>
      )}
    </span>
  );
}

/**
 * Tells the user which other transactions a deletion touches: stale lot
 * allocations are dropped and transfer legs that lose their counterpart become
 * external transactions (see lib/deletion.ts).
 */
function DeletionNote({ ids }: { ids: string[] }) {
  const { t } = useI18n();
  const wallets = useAppStore((s) => s.portfolio!.wallets);
  const impact = useMemo(() => deletionImpact(wallets, ids), [wallets, ids]);
  if (impact.releasedLegs.length === 0 && impact.clearedAllocations.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
      {impact.releasedLegs.length > 0 && (
        <p>{t("tx.deleteReleasesLegs", { count: impact.releasedLegs.length })}</p>
      )}
      {impact.clearedAllocations.length > 0 && (
        <p>
          {t("tx.deleteClearsAllocations", {
            count: impact.clearedAllocations.length,
          })}
        </p>
      )}
    </div>
  );
}

function accountLabel(portfolio: PortfolioFile, accountId: string): string {
  for (const w of portfolio.wallets) {
    const a = w.accounts.find((acc) => acc.id === accountId);
    if (a) return `${w.name} / ${a.name}`;
  }
  return "—";
}

/** One merged internal-transfer leg that moved (part of) a fully-transferred lot. */
interface TransferredLeg {
  transferOutTxId: string;
  transferGroupId: string;
  counterpartyAccountId: string;
  date: string;
  amountBtc: Decimal;
}

/**
 * Hover popover for a buy/transfer_in row whose entire remaining balance was
 * bundled into an internal transfer (see the "Übertragen zu…" bulk action) —
 * links back to the transfer_out leg(s) it ended up in. Triggered by a
 * forward icon next to the wallet/account cell (see `transferPopover` state
 * in the table) — this component only renders the popover content itself.
 */
const POPOVER_CLOSE_DELAY_MS = 250;

function TransferredPopover({
  legs,
  portfolio,
  loc,
  onJump,
  pos,
  onMouseEnter,
  onMouseLeave,
}: {
  legs: TransferredLeg[];
  portfolio: PortfolioFile;
  loc: string;
  onJump: (txId: string) => void;
  pos: { top: number; left: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { t } = useI18n();

  return createPortal(
    // Rendered outside the (possibly opacity-faded) row via a portal — an
    // ancestor's CSS opacity would otherwise wash out this popover too,
    // since opacity applies to the whole descendant subtree.
    <div
      className="fixed z-50 w-72 space-y-2 rounded-lg border border-accent/40 bg-surface p-3 text-xs text-foreground shadow-2xl"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {legs.map((leg, i) => (
        <div
          key={leg.transferGroupId}
          className={i > 0 ? "border-t border-border-c/50 pt-2" : ""}
        >
          <div className="flex justify-between gap-2">
            <span className="text-muted">{t("tx.transferredTarget")}</span>
            <span>{accountLabel(portfolio, leg.counterpartyAccountId)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted">{t("tx.transferredDate")}</span>
            <span>{formatDate(leg.date, loc)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted">{t("tx.transferredAmount")}</span>
            <span className="font-mono">{formatBtc(leg.amountBtc, loc)}</span>
          </div>
          <button
            className="mt-1 text-accent hover:underline"
            onClick={() => onJump(leg.transferOutTxId)}
          >
            {t("tx.transferredJump")} →
          </button>
        </div>
      ))}
    </div>,
    document.body,
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

/** Scrollable, radio-selectable list of candidate transactions to link a transfer leg to. */
function CandidatePicker({
  ranked,
  selectedId,
  onSelect,
  emptyLabel,
}: {
  ranked: { entry: LedgerEntry; score: number }[];
  selectedId: string;
  onSelect: (entry: LedgerEntry) => void;
  emptyLabel: string;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  if (ranked.length === 0) {
    return <p className="text-xs text-muted">{emptyLabel}</p>;
  }
  return (
    <div className="max-h-48 overflow-auto rounded-lg border border-border-c">
      {ranked.map(({ entry: c }, i) => (
        <label
          key={c.id}
          className={`flex cursor-pointer items-center gap-3 border-t border-border-c/50 px-3 py-2 text-sm first:border-t-0 ${
            selectedId === c.id ? "bg-accent/10" : "hover:bg-surface-2/50"
          }`}
        >
          <input type="radio" checked={selectedId === c.id} onChange={() => onSelect(c)} />
          <span className="w-36 shrink-0 whitespace-nowrap text-muted">
            {formatDateTime(c.date, loc)}
          </span>
          <span className="flex-1 truncate text-muted" title={c.note || undefined}>
            {c.note || "—"}
          </span>
          <span className="shrink-0 font-mono">{formatBtc(c.amountBtc, loc)}</span>
          {i === 0 && (
            <span className="shrink-0 rounded-full bg-gain/15 px-2 py-0.5 text-[10px] text-gain">
              {t("tx.transferBestMatch")}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}

/**
 * Bulk "transfer to..." dialog: bundles several open buy/transfer_in lots
 * into one real transfer, unlike MoveDialog which is a plain correction with
 * no transfer semantics. Creates a transfer_out (with lotAllocations for the
 * selected/adjusted lot amounts) in the shared source account and a linked
 * transfer_in in the target account via a common transferGroupId — the FIFO
 * engine then traces the original acquisition date/cost basis through, so no
 * new lot is created at today's transfer date (see CLAUDE.md §3.2).
 *
 * Either leg can instead be linked to an already-existing, independently
 * imported transaction (e.g. the exchange-side "sent" row and the hardware
 * wallet's "received" row from two separate CSV imports) rather than always
 * creating a fresh one — see CLAUDE.md §3.2 on transferGroupId.
 */
type LegMode = "new" | "existing";

function TransferDialog({
  all,
  selected,
  lotByTxId,
  onClose,
  onTransferred,
}: {
  all: LedgerEntry[];
  selected: LedgerEntry[];
  lotByTxId: Map<string, OpenLot>;
  onClose: () => void;
  onTransferred: () => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const update = useAppStore((s) => s.update);

  // Rows of the right type, regardless of currently-remaining balance — the
  // balance itself is resolved below via effectiveLotByTxId, since a
  // not-yet-linked transfer_out in the same account may currently be
  // "holding" that balance via the FIFO engine's dynamic fallback (see there).
  const typeEligible = useMemo(
    () => selected.filter((r) => r.type === "buy" || r.type === "transfer_in"),
    [selected],
  );
  const sourceAccountIds = useMemo(
    () => new Set(typeEligible.map((r) => r.accountId)),
    [typeEligible],
  );
  const multiSource = sourceAccountIds.size > 1;
  const sourceAccountId = typeEligible[0]?.accountId;

  // Existing-transaction candidates for the out-leg: same account, matching
  // direction, and not already part of another linked transfer.
  const outCandidates = useMemo(
    () =>
      sourceAccountId
        ? all.filter(
            (e) =>
              e.accountId === sourceAccountId &&
              e.type === "transfer_out" &&
              !e.transferGroupId,
          )
        : [],
    [all, sourceAccountId],
  );

  // A not-yet-linked transfer_out (e.g. an independently CSV-imported "sent"
  // row) has no lotAllocations, so the FIFO engine's dynamic fallback already
  // closed some lot against it — otherwise that lot wouldn't look "open" here
  // at all, defeating the whole point of being able to link it retroactively.
  // Since every outCandidate is exactly the set of transactions that might
  // become this bundle's out-leg, their provisional consumption is excluded
  // when computing which lots/how much is actually available to allocate.
  const effectiveLotByTxId = useMemo(() => {
    if (outCandidates.length === 0) return lotByTxId;
    const excluded = new Set(outCandidates.map((c) => c.id));
    const adjusted = all.filter((e) => !excluded.has(e.id));
    const fifo = computeFifo(adjusted, portfolio.settings.holdingPeriodDays);
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
  }, [all, outCandidates, lotByTxId, portfolio.settings.holdingPeriodDays]);

  const eligible = useMemo(
    () => typeEligible.filter((r) => effectiveLotByTxId.has(r.id)),
    [typeEligible, effectiveLotByTxId],
  );
  const ineligibleCount = selected.length - eligible.length;

  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      eligible.map((r) => [r.id, btcString(effectiveLotByTxId.get(r.id)!.remainingBtc)]),
    ),
  );
  const [feeBtc, setFeeBtc] = useState("");
  // Network fees are typically a few hundred to a few thousand sats — that is
  // the unit users type here. Adopting a candidate's stored fee switches the
  // selection to BTC, because that value is a BTC amount (see pickOutCandidate).
  const [feeUnit, setFeeUnit] = useState<AmountUnit>("sats");
  const [transferDate, setTransferDate] = useState(() => toLocalInput(new Date().toISOString()));
  const [targetWalletId, setTargetWalletId] = useState("");
  const [targetAccountId, setTargetAccountId] = useState("");

  const [outMode, setOutMode] = useState<LegMode>("new");
  const [selectedOutTxId, setSelectedOutTxId] = useState("");
  const [confirmOutMismatch, setConfirmOutMismatch] = useState(false);
  const [inMode, setInMode] = useState<LegMode>("new");
  const [selectedInTxId, setSelectedInTxId] = useState("");
  const [confirmInMismatch, setConfirmInMismatch] = useState(false);

  const targetWallet = portfolio.wallets.find((w) => w.id === targetWalletId);
  const targetAccount = targetWallet?.accounts.find((a) => a.id === targetAccountId);
  const targetName =
    targetWallet && targetAccount ? `${targetWallet.name} / ${targetAccount.name}` : "";
  const source = eligible[0];
  const sourceName = source ? `${source.walletName} / ${source.accountName}` : "";

  const rows = eligible.map((r) => {
    const lot = effectiveLotByTxId.get(r.id)!;
    const raw = amounts[r.id] ?? "";
    const amount = raw.trim() === "" ? null : dec(raw);
    const valid = amount !== null && amount.gt(0) && amount.lte(lot.remainingBtc);
    return { entry: r, lot, raw, valid };
  });
  const allAmountsValid = rows.length > 0 && rows.every((r) => r.valid);
  const totalBtc = rows.reduce(
    (acc, r) => (r.valid ? acc.plus(dec(r.raw)) : acc),
    ZERO,
  );
  // Quantity-weighted average cost, not a plain average of per-lot prices —
  // each lot's costPerBtcEur already traces back to its original acquisition
  // (through any prior transfers, see CLAUDE.md §3.2), so this is the true
  // cost basis of what's being moved, not a value re-derived from this
  // transfer's own (nonexistent) price.
  const costInfo = rows.reduce(
    (acc, r) => {
      if (!r.valid || r.lot.costPerBtcEur === null) return acc;
      const alloc = dec(r.raw);
      return {
        costEur: acc.costEur.plus(r.lot.costPerBtcEur.mul(alloc)),
        knownBasisBtc: acc.knownBasisBtc.plus(alloc),
      };
    },
    { costEur: ZERO, knownBasisBtc: ZERO },
  );
  const avgCostPerBtcEur = costInfo.knownBasisBtc.gt(0)
    ? costInfo.costEur.div(costInfo.knownBasisBtc)
    : null;
  const hasUnknownBasisLots = costInfo.knownBasisBtc.lt(totalBtc);
  const feeValid = feeBtc.trim() === "" || dec(feeBtc).gte(0);
  const fee =
    feeBtc.trim() === ""
      ? ZERO
      : feeUnit === "sats"
        ? dec(feeBtc).div(SATS_PER_BTC)
        : dec(feeBtc);
  const netBtc = totalBtc.minus(fee);
  const transferDateIso = dateInputToIso(transferDate);

  // Existing-transaction candidates for the in-leg: same account, matching
  // direction, and not already part of another linked transfer.
  const inCandidates = useMemo(
    () =>
      targetAccountId
        ? all.filter(
            (e) =>
              e.accountId === targetAccountId &&
              e.type === "transfer_in" &&
              !e.transferGroupId,
          )
        : [],
    [all, targetAccountId],
  );
  // Candidate lists are small (a portfolio's transfer-type transactions), so
  // this is left unmemoized rather than fighting the compiler over Decimal deps.
  // Candidates are ranked against the transfer amount (lots minus the network
  // fee), which is what an out-leg records.
  const rankedOutCandidates = outCandidates
    .map((entry) => ({ entry, score: candidateScore(entry, transferDateIso, netBtc) }))
    .sort((a, b) => a.score - b.score);
  const rankedInCandidates = inCandidates
    .map((entry) => ({ entry, score: candidateScore(entry, transferDateIso, netBtc) }))
    .sort((a, b) => a.score - b.score);
  const selectedOutTx = outCandidates.find((c) => c.id === selectedOutTxId);
  const selectedInTx = inCandidates.find((c) => c.id === selectedInTxId);

  const selectedOutAmount = selectedOutTx ? dec(selectedOutTx.amountBtc) : null;
  // The out-leg's own amount plus the network fee is what left the account, so
  // it has to match the selected lots (CLAUDE.md §3.2).
  const outMismatch =
    outMode === "existing" && selectedOutAmount !== null
      ? !selectedOutAmount.eq(netBtc)
      : false;
  const inMismatch =
    inMode === "existing" && selectedInTx
      ? !dec(selectedInTx.amountBtc).eq(netBtc)
      : false;

  const targetConflict = targetAccountId !== "" && targetAccountId === sourceAccountId;
  const outReady =
    outMode === "new" || (!!selectedOutTxId && (!outMismatch || confirmOutMismatch));
  const inReady =
    inMode === "new" || (!!selectedInTxId && (!inMismatch || confirmInMismatch));
  const canSubmit =
    !multiSource &&
    eligible.length > 0 &&
    allAmountsValid &&
    feeValid &&
    netBtc.gt(0) &&
    !!targetAccountId &&
    !targetConflict &&
    outReady &&
    inReady;

  function setAmount(id: string, value: string) {
    setAmounts((prev) => ({ ...prev, [id]: value }));
  }

  function pickOutCandidate(entry: LedgerEntry) {
    setSelectedOutTxId(entry.id);
    setConfirmOutMismatch(false);
    setTransferDate(toLocalInput(entry.date));
    // Adopt the transaction's own network fee unless the user typed one —
    // exports usually carry it, and it decides gross vs. net matching.
    if (feeBtc.trim() === "" && entry.feeBtc && dec(entry.feeBtc).gt(0)) {
      setFeeBtc(btcString(entry.feeBtc));
      setFeeUnit("btc");
    }
  }

  function pickInCandidate(entry: LedgerEntry) {
    setSelectedInTxId(entry.id);
    setConfirmInMismatch(false);
    setTransferDate(toLocalInput(entry.date));
  }

  function submit() {
    if (!canSubmit || !sourceAccountId) return;
    const allocations: LotAllocation[] = rows
      .filter((r) => r.valid)
      .map((r) => ({ lotTransactionId: r.entry.id, amountBtc: r.raw }));
    // Both legs carry the moved lots' quantity-weighted average cost and the
    // value of the transferred amount, so the transaction table shows a price
    // and a value for transfers too. This is display data only: the FIFO
    // engine keeps deriving cost basis from the moved lots themselves.
    const legPrice = avgCostPerBtcEur === null ? null : fiatString(avgCostPerBtcEur);
    const legTotal =
      avgCostPerBtcEur === null
        ? null
        : fiatString(avgCostPerBtcEur.mul(netBtc).toDecimalPlaces(2));
    // Candidates are filtered to ones without a transferGroupId already, so
    // this always mints a fresh one — for either a new or a linked leg.
    const transferGroupId = crypto.randomUUID();
    const linkOut = outMode === "existing" ? selectedOutTx : undefined;
    const linkIn = inMode === "existing" ? selectedInTx : undefined;

    update((p) => ({
      ...p,
      wallets: p.wallets.map((w) => ({
        ...w,
        accounts: w.accounts.map((a) => {
          if (a.id === sourceAccountId) {
            const transactions = linkOut
              ? a.transactions.map((tx) =>
                  tx.id === linkOut.id
                    ? {
                        ...tx,
                        // The transaction's own amount stays untouched — the
                        // lots it closes are its amount plus the network fee
                        // (CLAUDE.md §3.2), so only the fee is written back
                        // alongside the allocations. Price and value are filled
                        // in only when the transaction has none of its own.
                        feeBtc: fee.gt(0) ? fee.toString() : undefined,
                        pricePerBtcEur: tx.pricePerBtcEur ?? legPrice,
                        totalFiatEur: tx.totalFiatEur ?? legTotal,
                        lotAllocations: allocations,
                        transferGroupId,
                        counterpartyAccountId: targetAccountId,
                      }
                    : tx,
                )
              : [
                  ...a.transactions,
                  {
                    id: crypto.randomUUID(),
                    type: "transfer_out",
                    date: transferDateIso,
                    // Transferred amount; the fee below is charged on top and
                    // the allocations cover both.
                    amountBtc: netBtc.toString(),
                    pricePerBtcEur: legPrice,
                    totalFiatEur: legTotal,
                    feeBtc: fee.gt(0) ? fee.toString() : undefined,
                    lotAllocations: allocations,
                    counterpartyAccountId: targetAccountId,
                    transferGroupId,
                    note: "",
                  } satisfies Transaction,
                ];
            return { ...a, transactions };
          }
          if (a.id === targetAccountId) {
            const transactions = linkIn
              ? a.transactions.map((tx) =>
                  tx.id === linkIn.id
                    ? {
                        ...tx,
                        pricePerBtcEur: tx.pricePerBtcEur ?? legPrice,
                        totalFiatEur: tx.totalFiatEur ?? legTotal,
                        transferGroupId,
                        counterpartyAccountId: sourceAccountId,
                      }
                    : tx,
                )
              : [
                  ...a.transactions,
                  {
                    id: crypto.randomUUID(),
                    type: "transfer_in",
                    date: transferDateIso,
                    amountBtc: netBtc.toString(),
                    pricePerBtcEur: legPrice,
                    totalFiatEur: legTotal,
                    counterpartyAccountId: sourceAccountId,
                    transferGroupId,
                    note: "",
                  } satisfies Transaction,
                ];
            return { ...a, transactions };
          }
          return a;
        }),
      })),
    }));
    onTransferred();
  }

  return (
    <Modal title={t("tx.transferAction")} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted">{t("tx.transferIntro")}</p>

        {ineligibleCount > 0 && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            {t("tx.transferIneligible", { count: ineligibleCount })}
          </p>
        )}
        {multiSource && (
          <p className="rounded-lg border border-loss/40 bg-loss/10 p-3 text-xs text-loss">
            {t("tx.transferMultiSource")}
          </p>
        )}

        {eligible.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-lg border border-border-c">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-2 py-2 text-left font-normal">{t("tx.date")}</th>
                  <th className="px-2 py-2 text-left font-normal">
                    {t("tx.wallet")} / {t("tx.account")}
                  </th>
                  <th className="px-2 py-2 text-right font-normal">
                    {t("tx.transferRemaining")}
                  </th>
                  <th className="px-2 py-2 text-right font-normal">
                    {t("tx.transferAmount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry: r, lot, raw, valid }) => (
                  <tr key={r.id} className="border-t border-border-c/50">
                    <td className="px-2 py-1.5 whitespace-nowrap text-muted">
                      {formatDate(r.date, loc)}
                    </td>
                    <td className="px-2 py-1.5 text-muted">
                      {r.walletName} / {r.accountName}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted">
                      {formatBtc(lot.remainingBtc, loc)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <NumberInput
                        className={`${valid ? inputCls : `${inputCls} border-loss!`} w-32 text-right font-mono`}
                        value={raw}
                        onChange={(v) => setAmount(r.id, v)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
          <Field label={t("tx.transferFeeBtc")}>
            {/* Amount and unit share the grid cell 50/50, so the pair is as
                wide as the wallet select next to it. */}
            <div className="flex">
              <NumberInput
                className={`${feeValid ? inputCls : `${inputCls} border-loss!`} min-w-0 basis-1/2 rounded-r-none text-right font-mono`}
                // A sat amount is a whole number; only BTC gets 8 decimals.
                kind={feeUnit === "sats" ? "int" : "btc"}
                placeholder={feeUnit === "sats" ? "0" : decimalPlaceholder(loc, 8)}
                value={feeBtc}
                onChange={setFeeBtc}
              />
              <select
                className={`${inputCls} min-w-0 basis-1/2 rounded-l-none border-l-0`}
                value={feeUnit}
                onChange={(e) => setFeeUnit(e.target.value as AmountUnit)}
              >
                <option value="btc">{t("csvImport.unitBtc")}</option>
                <option value="sats">{t("csvImport.unitSats")}</option>
              </select>
            </div>
          </Field>
          <Field label={t("tx.transferDate")}>
            <input
              type="datetime-local"
              className={inputCls}
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
            />
          </Field>
        </div>

        {targetConflict && (
          <p className="text-xs text-loss">{t("tx.transferSameAccount")}</p>
        )}

        {/* Out-leg: source account, fixed by the selected lots — shown once a target is chosen */}
        {targetAccountId && (
          <div className="space-y-2 rounded-lg border border-border-c/60 p-3">
            <p className="text-xs font-medium text-muted">
              {t("tx.transferOutSectionTitle", { source: sourceName || "—" })}
            </p>
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="outMode"
                  checked={outMode === "new"}
                  onChange={() => setOutMode("new")}
                />
                {t("tx.transferOutModeNew")}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="outMode"
                  checked={outMode === "existing"}
                  onChange={() => setOutMode("existing")}
                />
                {t("tx.transferOutModeExisting")}
              </label>
            </div>
            {outMode === "existing" && (
              <CandidatePicker
                ranked={rankedOutCandidates}
                selectedId={selectedOutTxId}
                onSelect={pickOutCandidate}
                emptyLabel={t("tx.transferCandidateNone")}
              />
            )}
            {outMismatch && (
              <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
                <p>
                  {t("tx.transferMismatchOut", {
                    actual: formatBtc(selectedOutAmount!, loc),
                    expected: formatBtc(netBtc, loc),
                    lots: formatBtc(totalBtc, loc),
                    fee: formatBtc(fee, loc),
                  })}
                </p>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={confirmOutMismatch}
                    onChange={(e) => setConfirmOutMismatch(e.target.checked)}
                  />
                  {t("tx.transferMismatchConfirm")}
                </label>
              </div>
            )}
          </div>
        )}

        {/* In-leg: target account, chosen above */}
        {targetAccountId && (
          <div className="space-y-2 rounded-lg border border-border-c/60 p-3">
            <p className="text-xs font-medium text-muted">
              {t("tx.transferInSectionTitle", { target: targetName || "—" })}
            </p>
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="inMode"
                  checked={inMode === "new"}
                  onChange={() => setInMode("new")}
                />
                {t("tx.transferInModeNew")}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="inMode"
                  checked={inMode === "existing"}
                  onChange={() => setInMode("existing")}
                />
                {t("tx.transferInModeExisting")}
              </label>
            </div>
            {inMode === "existing" && (
              <CandidatePicker
                ranked={rankedInCandidates}
                selectedId={selectedInTxId}
                onSelect={pickInCandidate}
                emptyLabel={t("tx.transferCandidateNone")}
              />
            )}
            {inMismatch && (
              <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
                <p>
                  {t("tx.transferMismatchIn", {
                    actual: formatBtc(selectedInTx!.amountBtc, loc),
                    expected: formatBtc(netBtc, loc),
                  })}
                </p>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={confirmInMismatch}
                    onChange={(e) => setConfirmInMismatch(e.target.checked)}
                  />
                  {t("tx.transferMismatchConfirm")}
                </label>
              </div>
            )}
          </div>
        )}

        {eligible.length > 0 && !multiSource && (
          <dl className="space-y-2 rounded-lg border border-border-c bg-surface-2/50 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t("tx.transferSummaryLots")}</dt>
              <dd>{eligible.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t("tx.transferSummarySource")}</dt>
              <dd>{sourceName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t("tx.transferSummaryTarget")}</dt>
              <dd>{targetName || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t("tx.transferSummaryTotal")}</dt>
              <dd className="font-mono">{formatBtc(totalBtc, loc)}</dd>
            </div>
            {fee.gt(0) && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("tx.transferSummaryNet")}</dt>
                <dd className="font-mono">{formatBtc(netBtc, loc)}</dd>
              </div>
            )}
            {avgCostPerBtcEur !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("tx.transferSummaryAvgCost")}</dt>
                <dd className="font-mono">
                  <Amount>{formatFiat(avgCostPerBtcEur, "EUR", loc)}</Amount>
                </dd>
              </div>
            )}
            {costInfo.costEur.gt(0) && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t("tx.transferSummaryCostBasis")}</dt>
                <dd className="font-mono">
                  <Amount>{formatFiat(costInfo.costEur, "EUR", loc)}</Amount>
                </dd>
              </div>
            )}
            {hasUnknownBasisLots && costInfo.knownBasisBtc.gt(0) && (
              <p className="text-[11px] text-muted">
                {t("tx.transferSummaryUnknownBasisNote")}
              </p>
            )}
          </dl>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={submit}>
            {t("tx.transferSubmit")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function TransactionsView({
  initialFilter,
}: {
  /**
   * Pre-set filter when coming from a dashboard widget: a wallet/account, or
   * one of the data-quality issues (see lib/dataQuality.ts).
   */
  initialFilter?: {
    walletId?: string;
    accountId?: string;
    issue?: DataIssue;
  } | null;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const deleteTransaction = useAppStore((s) => s.deleteTransaction);
  const deleteTransactions = useAppStore((s) => s.deleteTransactions);

  const [filterWallet, setFilterWallet] = useState(initialFilter?.walletId ?? "");
  const [filterAccount, setFilterAccount] = useState(
    initialFilter?.accountId ?? "",
  );
  const [filterType, setFilterType] = useState("");
  /** Data-quality filter, e.g. after clicking a count on the dashboard. */
  const [filterIssue, setFilterIssue] = useState<DataIssue | "">(
    initialFilter?.issue ?? "",
  );
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [deleting, setDeleting] = useState<LedgerEntry | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [sellingLot, setSellingLot] = useState<SellLotTarget | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [onlyTaxFree, setOnlyTaxFree] = useState(false);
  const [pageSize, setPageSize] = useState<number | "all">(25);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [showMove, setShowMove] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const saveTransactionColumns = useAppStore((s) => s.saveTransactionColumns);
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(() =>
    initialVisibleColumns(portfolio.uiSettings?.transactionColumns),
  );
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // The column choice is written back once per visit to the picker, not per
  // checkbox: one save (and one re-encryption) instead of one per click. It is
  // compared against what the session started with, not against the file — a
  // file that carries no choice yet renders the default, and merely opening the
  // picker must not write that default back. The committer lives in a ref so
  // the outside-click listener and the unmount cleanup always see the current
  // selection.
  const columnsBaseline = useRef<string[]>(
    ALL_COLUMNS.filter((k) => visibleCols.has(k)),
  );
  const commitColumns = useRef<() => void>(() => {});
  useEffect(() => {
    commitColumns.current = () => {
      const next = ALL_COLUMNS.filter((k) => visibleCols.has(k));
      if (next.join() === columnsBaseline.current.join()) return;
      columnsBaseline.current = next;
      saveTransactionColumns(next);
    };
  }, [visibleCols, saveTransactionColumns]);
  useEffect(() => () => commitColumns.current(), []);

  function closeColMenu() {
    commitColumns.current();
    setShowColMenu(false);
  }

  useEffect(() => {
    if (!showColMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!colMenuRef.current?.contains(e.target as Node)) {
        commitColumns.current();
        setShowColMenu(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showColMenu]);

  // Hover popover for rows whose remaining balance was bundled into an
  // internal transfer, triggered by the forward icon next to the wallet/
  // account cell (see TransferredPopover). Fixed relative to that icon —
  // not to the cursor — so it stays put and stays reachable/clickable while
  // the pointer travels from the icon to the link inside. Only one row's
  // popover can be open at a time, so a single piece of state (keyed by row
  // id) is enough.
  const [transferPopover, setTransferPopover] = useState<{
    rowId: string;
    top: number;
    left: number;
  } | null>(null);
  const transferPopoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  function cancelTransferPopoverClose() {
    if (transferPopoverCloseTimer.current) {
      clearTimeout(transferPopoverCloseTimer.current);
      transferPopoverCloseTimer.current = null;
    }
  }
  // A short delay (rather than closing immediately on mouseleave) gives the
  // pointer time to travel from the icon to the popover — otherwise any gap
  // between them closes it before the user can reach a link inside.
  function scheduleTransferPopoverClose() {
    cancelTransferPopoverClose();
    transferPopoverCloseTimer.current = setTimeout(
      () => setTransferPopover(null),
      POPOVER_CLOSE_DELAY_MS,
    );
  }
  function openTransferPopover(rowId: string, rect: DOMRect) {
    cancelTransferPopoverClose();
    setTransferPopover({ rowId, top: rect.bottom + 6, left: rect.left });
  }
  useEffect(() => cancelTransferPopoverClose, []);

  const all = useMemo(() => flattenLedger(portfolio.wallets), [portfolio]);

  // Open lot per buy/transfer_in transaction (only lots with remaining > 0).
  // A transfer_in can carry several moved lots under one transaction id —
  // aggregate them: remaining is summed, and the tax-free badge only turns
  // green once every part is past the holding period (latest taxFreeDate).
  const fifoResult = useMemo(
    () => computeFifo(all, portfolio.settings.holdingPeriodDays),
    [all, portfolio.settings.holdingPeriodDays],
  );

  const lotByTxId = useMemo(() => {
    const map = new Map<string, OpenLot>();
    for (const l of fifoResult.openLots) {
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
  }, [fifoResult]);

  // Buy/transfer_in rows whose entire balance was bundled into an internal
  // transfer — faded in the table, with a hover popover to the transfer(s).
  // Legs are merged by transferGroupId (a lot re-created from a bundled
  // transfer_in can be consumed as several same-transfer parts internally).
  const transferredOutByTxId = useMemo(() => {
    const map = new Map<string, TransferredLeg[]>();
    for (const [txId, info] of fifoResult.fullyTransferredLots) {
      const byGroup = new Map<string, TransferredLeg>();
      for (const leg of info.transfers) {
        const existing = byGroup.get(leg.transferGroupId);
        if (existing) existing.amountBtc = existing.amountBtc.plus(leg.amountBtc);
        else byGroup.set(leg.transferGroupId, { ...leg });
      }
      map.set(
        txId,
        [...byGroup.values()].sort((a, b) => a.date.localeCompare(b.date)),
      );
    }
    return map;
  }, [fifoResult]);

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
    if (filterIssue) rows = rows.filter((r) => hasIssue(r, filterIssue));
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
        case "feeBtc":
          // Rows without a BTC fee sort last, like every other empty value.
          return cmpNullable(
            a.feeBtc === undefined ? null : dec(a.feeBtc),
            b.feeBtc === undefined ? null : dec(b.feeBtc),
          );
        case "type":
          return a.type.localeCompare(b.type) * dir;
        case "walletAccount":
          return (
            `${a.walletName} / ${a.accountName}`.localeCompare(
              `${b.walletName} / ${b.accountName}`,
              loc,
            ) * dir
          );
        case "price":
          return cmpNullable(
            a.pricePerBtcEur === null ? null : dec(a.pricePerBtcEur),
            b.pricePerBtcEur === null ? null : dec(b.pricePerBtcEur),
          );
        case "value":
          return cmpNullable(rowValue(a), rowValue(b));
        case "originalCurrency": {
          // By code, then by amount inside one currency; rows without a code
          // sort last like every other empty value.
          const ca = a.originalCurrency ?? "";
          const cb = b.originalCurrency ?? "";
          if (ca === "" || cb === "") return ca === cb ? 0 : ca === "" ? 1 : -1;
          if (ca !== cb) return ca.localeCompare(cb) * dir;
          return cmpNullable(
            a.originalAmount === undefined ? null : dec(a.originalAmount),
            b.originalAmount === undefined ? null : dec(b.originalAmount),
          );
        }
        case "txid":
        case "address": {
          // Rows without the field always sort last, like other empty values.
          const va = a[sortKey] ?? "";
          const vb = b[sortKey] ?? "";
          if (va === "" || vb === "") return va === vb ? 0 : va === "" ? 1 : -1;
          return va.localeCompare(vb) * dir;
        }
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
  }, [all, filterWallet, filterAccount, filterType, filterIssue, filterFrom, filterTo, onlyTaxFree, lotByTxId, sortKey, sortAsc, loc]);

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
      case "amount":
        return t("tx.amountBtc");
      case "feeBtc":
        return t("tx.feeBtc");
      case "price":
        return t("tx.priceEur");
      case "value":
        return t("tx.valueEur");
      case "originalCurrency":
        return t("tx.originalCurrency");
      case "txid":
        return t("tx.txid");
      case "address":
        return t("tx.address");
    }
  };

  function openEdit(r: LedgerEntry) {
    setEditing(r);
    setSellingLot(null);
    setShowForm(true);
  }

  function jumpToTransaction(txId: string) {
    const entry = all.find((e) => e.id === txId);
    if (entry) openEdit(entry);
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
    // Every column shrinks to its content except walletAccount, which
    // absorbs whatever width is left so the table fills the full width.
    const grow = key === "walletAccount";
    return (
      <th
        key={key}
        className={`cursor-pointer select-none py-2 pr-4 font-normal hover:text-foreground ${grow ? "w-full" : "whitespace-nowrap"} ${right ? "text-right" : "text-left"}`}
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
  const isFiltered = Boolean(
    filterWallet ||
      filterAccount ||
      filterType ||
      filterIssue ||
      filterFrom ||
      filterTo ||
      onlyTaxFree,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>
          {t("tx.title")}
          {isFiltered &&
            ` · ${t("tx.titleCount", { filtered: filtered.length, total: all.length })}`}
        </SectionTitle>
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
        {/* Seven controls in four columns, i.e. two rows: wallet, account,
            type and data quality on the first, the date range and the page
            size on the second. Squeezing all seven into one row leaves each
            select too narrow to read its own label. */}
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
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
          <select
            className={inputCls}
            title={t("tx.filterIssue")}
            value={filterIssue}
            onChange={(e) => {
              setFilterIssue(e.target.value as DataIssue | "");
              setPage(1);
            }}
          >
            <option value="">
              {t("tx.filterIssue")}: {t("tx.filterAll")}
            </option>
            {DATA_ISSUES.map((issue) => (
              <option key={issue} value={issue}>
                {t(`dashboard.widgets.issues.${issue}`)}
              </option>
            ))}
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
          {TAX_FEATURES_ENABLED && (
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
          )}

          <div className="relative ml-auto" ref={colMenuRef}>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-border-c bg-surface-2 px-2.5 py-1.5 text-xs text-muted hover:border-accent-dim hover:text-foreground"
              title={t("tx.columns")}
              aria-label={t("tx.columns")}
              aria-expanded={showColMenu}
              onClick={() => (showColMenu ? closeColMenu() : setShowColMenu(true))}
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

        {/* Fixed (not sticky) on purpose: this should stay visible at a fixed
            screen position for as long as a selection is active, regardless
            of scroll position — not just while its normal-flow spot happens
            to be scrolling past. The nested max-w-6xl/px-8 wrapper mirrors
            <main>'s own px-4 plus <Card>'s own p-4 (16px + 16px = 32px), so
            the bar's edges land exactly on the table's edges instead of the
            wider page column. */}
        {selectedEntries.length > 0 && (
          <div className="fixed inset-x-0 bottom-4 z-30 px-4">
            <div className="mx-auto max-w-6xl px-8">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm shadow-lg backdrop-blur">
                <span className="font-medium text-accent">
                  {t("tx.selectedCount", { count: selectedEntries.length })}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button variant="primary" onClick={() => setShowMove(true)}>
                    {t("tx.changeWalletAccount")}
                  </Button>
                  <Button variant="primary" onClick={() => setShowTransfer(true)}>
                    {t("tx.transferAction")}
                  </Button>
                  <Button variant="dangerSolid" onClick={() => setShowBulkDelete(true)}>
                    {t("common.delete")}
                  </Button>
                  <Button variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    {t("tx.clearSelection")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-c text-xs text-muted">
                <th className="py-2 pr-3 text-center font-normal">
                  <Switch
                    checked={allFilteredSelected}
                    indeterminate={someFilteredSelected && !allFilteredSelected}
                    disabled={filtered.length === 0}
                    label={t("tx.selectAll")}
                    onChange={toggleSelectAll}
                  />
                </th>
                {header("date")}
                {header("type")}
                {header("taxStatus")}
                {header("walletAccount")}
                {header("amount")}
                {header("feeBtc")}
                {header("price")}
                {header("value")}
                {header("originalCurrency")}
                {header("txid")}
                {header("address")}
                <th className="py-2 text-right font-normal whitespace-nowrap"></th>
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
                const transferredLegs = transferredOutByTxId.get(r.id);
                const rowSelected = selectedIds.has(r.id);
                return (
                  <tr
                    key={`${r.accountId}-${r.id}`}
                    className={`cursor-pointer border-b border-border-c/50 hover:bg-surface-2/50 ${
                      rowSelected ? "bg-accent/5" : ""
                    } ${transferredLegs ? "opacity-45" : ""}`}
                    title={t("tx.edit")}
                    onClick={() => openEdit(r)}
                  >
                    <td
                      className="py-2 pr-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Switch
                        checked={rowSelected}
                        label={t("tx.selectRow")}
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
                        <IconTooltip label={t(`tx.types.${r.type}`)}>
                          <span role="img" aria-label={t(`tx.types.${r.type}`)}>
                            <TypeIcon type={r.type} />
                          </span>
                        </IconTooltip>
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
                      <td className="w-full py-2 pr-4 text-muted">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="min-w-0 truncate"
                            title={`${r.walletName} / ${r.accountName}`}
                          >
                            {r.walletName} / {r.accountName}
                          </span>
                          {transferredLegs && (
                            <span
                              className="shrink-0 cursor-default rounded-md p-0.5 text-muted hover:bg-accent/10 hover:text-accent"
                              title={t("tx.transferredAway")}
                              role="img"
                              aria-label={t("tx.transferredAway")}
                              onMouseEnter={(e) =>
                                openTransferPopover(r.id, e.currentTarget.getBoundingClientRect())
                              }
                              onMouseLeave={scheduleTransferPopoverClose}
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
                                <path d="M9.5 4.5 13 8l-3.5 3.5" />
                                <path d="M13 8H3.5a2 2 0 0 1-2-2V5" />
                              </svg>
                            </span>
                          )}
                        </span>
                      </td>
                    )}
                    {visibleCols.has("amount") && (
                      <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                        <Amount>{formatBtc(r.amountBtc, loc)}</Amount>
                      </td>
                    )}
                    {visibleCols.has("feeBtc") && (
                      <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                        {r.feeBtc !== undefined && r.feeBtc !== "" ? (
                          <Amount>{formatBtc(r.feeBtc, loc)}</Amount>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
                    {visibleCols.has("price") && (
                      <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                        {r.pricePerBtcEur !== null ? (
                          <Amount>{formatFiatPlain(r.pricePerBtcEur, loc)}</Amount>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
                    {visibleCols.has("value") && (
                      <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                        {value !== null ? (
                          <>
                            {/* An EUR value derived from the historical close is
                                an estimate — keep that visible (§3.2). */}
                            {r.eurValuationSource === "binance-klines" && (
                              <IconTooltip label={t("tx.eurValuationDerived")}>
                                <span className="mr-0.5 cursor-default text-muted">≈</span>
                              </IconTooltip>
                            )}
                            <Amount>{formatFiatPlain(value, loc)}</Amount>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
                    {visibleCols.has("originalCurrency") && (
                      <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                        {r.originalCurrency && r.originalAmount ? (
                          <Amount>
                            {`${formatFiatPlain(r.originalAmount, loc)} ${r.originalCurrency}`}
                          </Amount>
                        ) : r.originalCurrency ? (
                          <span className="text-muted">{r.originalCurrency}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
                    {visibleCols.has("txid") && (
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <OnChainCell
                          value={r.txid}
                          explorerUrl={
                            r.txid
                              ? explorerTxUrl(portfolio.explorerSettings, r.txid)
                              : null
                          }
                        />
                      </td>
                    )}
                    {visibleCols.has("address") && (
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <OnChainCell
                          value={r.address}
                          explorerUrl={
                            r.address
                              ? explorerAddressUrl(
                                  portfolio.explorerSettings,
                                  r.address,
                                )
                              : null
                          }
                        />
                      </td>
                    )}
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
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
                    {transferredLegs && transferPopover?.rowId === r.id && (
                      <TransferredPopover
                        legs={transferredLegs}
                        portfolio={portfolio}
                        loc={loc}
                        onJump={jumpToTransaction}
                        pos={transferPopover}
                        onMouseEnter={cancelTransferPopoverClose}
                        onMouseLeave={scheduleTransferPopoverClose}
                      />
                    )}
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

        {/* Always reserved, not just while a selection is active — otherwise
            this spacer's own mount/unmount would shift the pagination by its
            height the instant a selection starts/ends, reading as a jump. */}
        <div className="h-16" aria-hidden />
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

      {showTransfer && (
        <TransferDialog
          all={all}
          selected={selectedEntries}
          lotByTxId={lotByTxId}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => {
            setShowTransfer(false);
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
                <dd>{formatDateTime(deleting.date, loc)}</dd>
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
                  <Amount>{formatBtc(deleting.amountBtc, loc)}</Amount>
                </dd>
              </div>
            </dl>
            <DeletionNote ids={[deleting.id]} />
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

      {showBulkDelete && (
        <Modal title={t("tx.deleteTitle")} onClose={() => setShowBulkDelete(false)}>
          <div className="space-y-4">
            <p className="text-sm">
              {t("tx.bulkDeleteConfirm", { count: selectedEntries.length })}
            </p>
            <DeletionNote ids={selectedEntries.map((e) => e.id)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowBulkDelete(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteTransactions(selectedEntries.map((e) => e.id));
                  setShowBulkDelete(false);
                  setSelectedIds(new Set());
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
