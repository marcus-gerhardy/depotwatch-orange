"use client";

// The wallet list: where the coins are, grouped by who holds the keys.
//
// Every balance on this page comes from `lib/holdings.ts` — per wallet and per
// account from `portfolioHoldings`, per group from `computeHolding` over that
// group's accounts — so nothing here can add up a figure of its own. What the
// page adds is arrangement and bookkeeping about the wallets themselves: the
// custody groups, the split of the total, the archive, the data-quality gaps,
// the backup check, and the comparison with the chain when asked for.
//
// Archiving tidies the list and nothing else. An archived wallet keeps
// counting in the total, in the distribution bar and in every report; the
// archive section says so, and archiving one that still holds coins asks
// first.

import {
  formatCalendarDate,
  localTimeZone,
  readStoredCalendarDate,
  todayCalendarDate,
} from "@/lib/dates";
import { useEffect, useMemo, useRef, useState } from "react";
import HelpButton from "./help/HelpButton";
import { intlLocale, useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useReadOnly } from "@/lib/readOnly";
import { computeFifo } from "@/lib/fifo";
import { dec } from "@/lib/decimal";
import {
  flattenLedger,
  type Account,
  type KycStatus,
  type LedgerEntry,
  type Wallet,
  type WalletColorId,
  type WalletIconId,
  type WalletType,
} from "@/lib/types";
import { SATS_PER_BTC, useValueFormat } from "@/lib/displayUnit";
import {
  computeHolding,
  portfolioHoldings,
  type Holding,
  type HoldingInput,
} from "@/lib/holdings";
import type { DataIssue } from "@/lib/dataQuality";
import {
  KYC_STATUSES,
  WALLET_COLOR_IDS,
  WALLET_ICON_IDS,
  WALLET_ISSUES,
  backupStatus,
  balanceSparkline,
  custodyOf,
  hasSeedBackup,
  moveWithinGroup,
  walletColorOf,
  walletIconOf,
  walletIssueCounts,
  walletShares,
  type Custody,
  type WalletIssueCounts,
} from "@/lib/walletMeta";
import { summarizeUtxos, useOnDemandScan } from "@/lib/watchlistScan";
import { explorerBase } from "@/lib/esplora";
import type { WalletDetailTarget } from "./WalletDetailView";
import TransactionForm, { type FormType } from "./TransactionForm";
import CsvImportWizard from "./CsvImportWizard";
import { Amount, Button, Card, Field, Modal, SectionTitle, inputCls } from "./ui";
import { CheckIcon, WarnIcon } from "./icons";
import { WALLET_COLOR_CLASSES, WalletIcon, WalletTile } from "./WalletMark";

const WALLET_TYPES: WalletType[] = ["exchange", "hardware", "software", "paper"];

/** Where the table and the dashboard send the user; see `TxJumpFilter`. */
type TxFilter = { walletId?: string; accountId?: string; issue?: DataIssue };

type Dialog =
  | { kind: "addWallet" }
  | { kind: "editWallet"; walletId: string }
  | { kind: "addAccount"; walletId: string }
  | { kind: "renameAccount"; walletId: string; accountId: string; current: string }
  | { kind: "archive"; walletId: string; accountId?: string };

/** Everything a card or a table row needs from the page, computed once. */
interface ListContext {
  holdings: { byWallet: Map<string, Holding>; byAccount: Map<string, Holding> };
  shares: Map<string, number>;
  issues: Map<string, WalletIssueCounts>;
  sparklines: Map<string, number[]>;
  colorIndex: Map<string, number>;
  now: Date;
  pct: (share: number) => string;
  onOpenWallet: (target: WalletDetailTarget) => void;
  onOpenTransactions?: (filter: TxFilter) => void;
  openDialog: (d: Dialog) => void;
  addTransaction: (w: Wallet, type?: FormType) => void;
  startImport: (walletId: string) => void;
  restore: (walletId: string, accountId?: string) => void;
  reorder: Reorder;
}

// ------------------------------------------------------------------ reorder

/**
 * Drag and drop inside one group, by mouse and by keyboard.
 *
 * The mouse drags the whole card but only starts from the handle (the card
 * becomes draggable while the pointer is down on it), so text on a card stays
 * selectable. The keyboard uses the same handle: arrow up/down moves one
 * place, and the result is announced, because a move nobody can see is a
 * move a screen-reader user cannot check.
 */
interface Reorder {
  enabled: boolean;
  itemProps: (id: string, groupIds: string[]) => React.HTMLAttributes<HTMLElement> & {
    draggable: boolean;
  };
  handleProps: (
    id: string,
    name: string,
    groupIds: string[],
  ) => React.ButtonHTMLAttributes<HTMLButtonElement> & { "data-reorder-handle": string };
  overId: string | null;
}

function useReorder(
  enabled: boolean,
  move: (groupIds: string[], from: number, to: number) => void,
  label: (name: string) => string,
): Reorder {
  const [armed, setArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const reset = () => {
    setArmed(null);
    setDragId(null);
    setOverId(null);
  };

  return {
    enabled,
    overId,
    itemProps: (id, groupIds) => ({
      draggable: enabled && armed === id,
      onDragStart: (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        setDragId(id);
      },
      onDragOver: (e) => {
        if (dragId === null || !groupIds.includes(dragId)) return;
        e.preventDefault();
        if (overId !== id) setOverId(id);
      },
      onDrop: (e) => {
        e.preventDefault();
        if (dragId !== null && groupIds.includes(dragId)) {
          move(groupIds, groupIds.indexOf(dragId), groupIds.indexOf(id));
        }
        reset();
      },
      onDragEnd: reset,
    }),
    handleProps: (id, name, groupIds) => ({
      type: "button",
      disabled: !enabled,
      "aria-label": label(name),
      title: label(name),
      "data-reorder-handle": id,
      onPointerDown: () => setArmed(id),
      onPointerUp: () => setArmed(null),
      onKeyDown: (e) => {
        const i = groupIds.indexOf(id);
        if (e.key === "ArrowUp" && i > 0) {
          e.preventDefault();
          move(groupIds, i, i - 1);
        } else if (e.key === "ArrowDown" && i < groupIds.length - 1) {
          e.preventDefault();
          move(groupIds, i, i + 1);
        }
      },
    }),
  };
}

function DragHandle(props: ReturnType<Reorder["handleProps"]>) {
  return (
    <button
      {...props}
      className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted hover:text-foreground disabled:cursor-default disabled:opacity-30"
    >
      <svg aria-hidden viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor">
        {[3, 8, 13].flatMap((y) => [
          <circle key={`a${y}`} cx="2.5" cy={y} r="1.3" />,
          <circle key={`b${y}`} cx="7.5" cy={y} r="1.3" />,
        ])}
      </svg>
    </button>
  );
}

// ------------------------------------------------------------------ page

export default function WalletsView({
  onOpenWallet,
  onOpenTransactions,
}: {
  /** Open the detail view of a wallet or one of its accounts (§2). */
  onOpenWallet: (target: WalletDetailTarget) => void;
  /** Open the transaction table filtered to a wallet, an account or an issue. */
  onOpenTransactions?: (filter: TxFilter) => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const locked = useReadOnly();
  const store = useAppStore();
  const fmt = useValueFormat();
  // Read once: a date on screen does not need to tick, and nothing may read
  // the clock while rendering.
  const [now] = useState(() => new Date());

  const wallets = portfolio.wallets;
  const view = portfolio.uiSettings?.walletsView ?? "cards";

  // The same computation every other holding surface reads (lib/holdings.ts),
  // for the whole portfolio in one pass rather than once per row.
  const entries = useMemo(() => flattenLedger(wallets), [wallets]);
  const holdingInput: HoldingInput = useMemo(
    () => ({
      entries,
      fifo: computeFifo(entries, portfolio.settings.holdingPeriodDays),
      priceEur: fmt.priceEur,
    }),
    [entries, portfolio.settings.holdingPeriodDays, fmt.priceEur],
  );
  const holdings = useMemo(
    () => portfolioHoldings(holdingInput, wallets),
    [holdingInput, wallets],
  );

  const active = wallets.filter((w) => !w.archived);
  const archived = wallets.filter((w) => w.archived);
  const groups: { custody: Custody; wallets: Wallet[] }[] = (
    ["self", "custodial"] as const
  ).map((custody) => ({
    custody,
    wallets: active.filter((w) => custodyOf(w.type) === custody),
  }));

  const groupHoldings = useMemo(() => {
    const scopeOf = (ws: Wallet[]) =>
      new Set(ws.flatMap((w) => w.accounts.map((a) => a.id)));
    const out = new Map<string, Holding>();
    for (const custody of ["self", "custodial"] as const) {
      const ws = wallets.filter((w) => !w.archived && custodyOf(w.type) === custody);
      out.set(custody, computeHolding(holdingInput, scopeOf(ws)));
    }
    out.set("archived", computeHolding(holdingInput, scopeOf(wallets.filter((w) => w.archived))));
    return out;
  }, [holdingInput, wallets]);

  const shares = useMemo(
    () =>
      new Map(
        walletShares(
          wallets.map((w) => ({ walletId: w.id, btc: holdings.byWallet.get(w.id)!.btc })),
        ).map((s) => [s.walletId, s.share]),
      ),
    [wallets, holdings],
  );
  const issues = useMemo(() => walletIssueCounts(entries), [entries]);
  const sparklines = useMemo(() => {
    const byWallet = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      const list = byWallet.get(e.walletId);
      if (list) list.push(e);
      else byWallet.set(e.walletId, [e]);
    }
    return new Map([...byWallet].map(([id, es]) => [id, balanceSparkline(es)]));
  }, [entries]);
  const colorIndex = useMemo(() => new Map(wallets.map((w, i) => [w.id, i])), [wallets]);
  const pctFormat = useMemo(
    () => new Intl.NumberFormat(loc, { style: "percent", maximumFractionDigits: 1 }),
    [loc],
  );

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState("");
  const [walletType, setWalletType] = useState<WalletType>("exchange");
  /**
   * The first account of a new wallet, created with it.
   *
   * A wallet on its own holds nothing: transactions hang on accounts, so an
   * account-less wallet cannot be picked anywhere — not as a transfer target,
   * not in the transaction dialog, not in a filter. Creating one and finding
   * it missing from every list is the bug this field fixes.
   */
  const [accountName, setAccountName] = useState("");
  const [adding, setAdding] = useState<{ accountId?: string; type?: FormType } | null>(null);
  const [importFor, setImportFor] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [focusHandle, setFocusHandle] = useState<string | null>(null);

  // Moving a node in the DOM drops its focus in some browsers; the handle a
  // keyboard user just pressed an arrow on has to keep it.
  useEffect(() => {
    if (focusHandle === null) return;
    document
      .querySelector<HTMLElement>(`[data-reorder-handle="${focusHandle}"]`)
      ?.focus();
  }, [focusHandle, wallets]);

  const reorder = useReorder(
    !locked.readOnly,
    (groupIds, from, to) => {
      const next = moveWithinGroup(
        wallets.map((w) => w.id),
        groupIds,
        from,
        to,
      );
      const movedId = groupIds[from];
      store.reorderWallets(next);
      setFocusHandle(movedId);
      const moved = wallets.find((w) => w.id === movedId);
      setAnnouncement(
        t("wallets.moved", {
          name: moved?.name ?? "",
          position: to + 1,
          count: groupIds.length,
        }),
      );
    },
    (n) => t("wallets.move", { name: n }),
  );

  function openDialog(d: Dialog) {
    setName(d.kind === "renameAccount" ? d.current : "");
    setAccountName(d.kind === "addWallet" ? t("wallets.firstAccountDefault") : "");
    setWalletType("exchange");
    setDialog(d);
  }

  function submit() {
    if (!dialog || !name.trim()) return;
    const n = name.trim();
    switch (dialog.kind) {
      case "addWallet":
        store.addWallet({
          id: crypto.randomUUID(),
          name: n,
          type: walletType,
          // Never empty: see the comment on `accountName`.
          accounts: [
            {
              id: crypto.randomUUID(),
              name: accountName.trim() || t("wallets.firstAccountDefault"),
              transactions: [],
            },
          ],
        });
        break;
      case "addAccount":
        store.addAccount(dialog.walletId, {
          id: crypto.randomUUID(),
          name: n,
          transactions: [],
        });
        break;
      case "renameAccount":
        store.renameAccount(dialog.walletId, dialog.accountId, n);
        break;
    }
    setDialog(null);
  }

  const ctx: ListContext = {
    holdings,
    shares,
    issues,
    sparklines,
    colorIndex,
    now,
    pct: (s) => pctFormat.format(s),
    onOpenWallet,
    onOpenTransactions,
    openDialog,
    addTransaction: (w, type) =>
      setAdding({
        accountId: (w.accounts.find((a) => !a.archived) ?? w.accounts[0])?.id,
        type,
      }),
    startImport: setImportFor,
    restore: (walletId, accountId) =>
      accountId === undefined
        ? store.updateWallet(walletId, { archived: undefined })
        : store.setAccountArchived(walletId, accountId, false),
    reorder,
  };

  const addButton = (
    <Button variant="primary" {...locked.props} onClick={() => openDialog({ kind: "addWallet" })}>
      + {t("wallets.addWallet")}
    </Button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionTitle level={1}>{t("wallets.title")}</SectionTitle>
          <HelpButton anchor="wallets-structure" label={t("wallets.title")} className="mb-3" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {wallets.length > 0 && (
            <ViewSwitch
              value={view}
              onChange={(v) => store.saveWalletsView(v)}
            />
          )}
          {addButton}
        </div>
      </div>

      {wallets.length === 0 ? (
        <EmptyState onAdd={() => openDialog({ kind: "addWallet" })} />
      ) : (
        <TotalCard
          wallets={wallets}
          total={holdings.total}
          shares={shares}
          colorIndex={colorIndex}
          pct={ctx.pct}
        />
      )}

      {groups.map(
        (g) =>
          g.wallets.length > 0 && (
            <GroupSection
              key={g.custody}
              title={t(`wallets.custody.${g.custody}`)}
              hint={t(`wallets.custody.${g.custody}Hint`)}
              holding={groupHoldings.get(g.custody)!}
              wallets={g.wallets}
              view={view}
              ctx={ctx}
            />
          ),
      )}

      {archived.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            className="flex w-full flex-wrap items-center gap-2 text-left"
            aria-expanded={archiveOpen}
            aria-controls="wallets-archive"
            onClick={() => setArchiveOpen(!archiveOpen)}
          >
            <span
              aria-hidden
              className={`text-muted motion-safe:transition-transform ${archiveOpen ? "rotate-90" : ""}`}
            >
              ▸
            </span>
            <h2 className="text-sm font-semibold tracking-wider text-muted uppercase">
              {t("wallets.archive.section")} ({archived.length})
            </h2>
            {/* The archive's total is on the closed header too: folding a
                section away must not fold its coins away with it. */}
            <span className="ml-auto text-right font-mono text-xs">
              <Amount>{fmt.amountWithUnit(groupHoldings.get("archived")!.btc)}</Amount>
            </span>
          </button>
          <p className="text-xs leading-relaxed text-muted">{t("wallets.archive.sectionHint")}</p>
          {archiveOpen && (
            <div id="wallets-archive">
              <WalletList wallets={archived} view={view} ctx={ctx} />
            </div>
          )}
        </section>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {adding && (
        <TransactionForm
          existing={null}
          initialAccountId={adding.accountId}
          initialType={adding.type}
          onClose={() => setAdding(null)}
        />
      )}

      {importFor !== null && (
        <CsvImportWizard
          initialTarget={{ walletId: importFor }}
          onClose={() => setImportFor(null)}
        />
      )}

      {dialog?.kind === "editWallet" && (
        <EditWalletDialog
          wallet={wallets.find((w) => w.id === dialog.walletId)!}
          now={now}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "archive" && (
        <ArchiveDialog
          target={dialog}
          onClose={() => setDialog(null)}
          holding={
            dialog.accountId !== undefined
              ? holdings.byAccount.get(dialog.accountId)!
              : holdings.byWallet.get(dialog.walletId)!
          }
        />
      )}

      {(dialog?.kind === "addWallet" ||
        dialog?.kind === "addAccount" ||
        dialog?.kind === "renameAccount") && (
        <Modal
          title={
            dialog.kind === "addWallet"
              ? t("wallets.addWallet")
              : dialog.kind === "addAccount"
                ? t("wallets.addAccount")
                : t("wallets.rename")
          }
          onClose={() => setDialog(null)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field
              label={
                dialog.kind === "addWallet" ? t("wallets.walletName") : t("wallets.accountName")
              }
            >
              <input
                autoFocus
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            {dialog.kind === "addWallet" && (
              <Field label={t("wallets.firstAccountName")}>
                <input
                  className={inputCls}
                  placeholder={t("wallets.firstAccountDefault")}
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
                <span className="mt-1 block text-xs leading-relaxed text-muted">
                  {t("wallets.firstAccountHint")}
                </span>
              </Field>
            )}
            {dialog.kind === "addWallet" && (
              <Field label={t("wallets.type")}>
                <select
                  className={inputCls}
                  value={walletType}
                  onChange={(e) => setWalletType(e.target.value as WalletType)}
                >
                  {WALLET_TYPES.map((wt) => (
                    <option key={wt} value={wt}>
                      {t(`wallets.types.${wt}`)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                {t("common.save")}
              </Button>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function ViewSwitch({
  value,
  onChange,
}: {
  value: "cards" | "table";
  onChange: (v: "cards" | "table") => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t("wallets.view.label")}
      className="inline-flex rounded-lg border border-border-c bg-surface-2 p-0.5 text-sm"
    >
      {(["cards", "table"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 ${
            value === v ? "bg-surface font-medium text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {t(`wallets.view.${v}`)}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  const locked = useReadOnly();
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-10 text-center">
      <div aria-hidden className="flex gap-2">
        {(["hardware", "software", "paper", "exchange"] as WalletIconId[]).map((icon, i) => (
          <WalletTile
            key={icon}
            icon={icon}
            color={WALLET_COLOR_IDS[i]}
            custodial={icon === "exchange"}
          />
        ))}
      </div>
      <h2 className="text-lg font-semibold">{t("wallets.emptyTitle")}</h2>
      <p className="max-w-md text-sm leading-relaxed text-muted">{t("wallets.emptyBody")}</p>
      {/* An empty state that only states the emptiness leaves the user to
          find the action in the header; it belongs here. */}
      <Button variant="primary" {...locked.props} onClick={onAdd}>
        + {t("wallets.emptyAction")}
      </Button>
    </Card>
  );
}

/**
 * The total and how it splits over the wallets. Every wallet is in the bar,
 * archived ones included, and the legend names each with its percentage — a
 * segment's colour is never the only way to tell which wallet it is.
 */
function TotalCard({
  wallets,
  total,
  shares,
  colorIndex,
  pct,
}: {
  wallets: Wallet[];
  total: Holding;
  shares: Map<string, number>;
  colorIndex: Map<string, number>;
  pct: (s: number) => string;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  // Self-custody first, then exchanges, then the archive: the order of the
  // sections below, so the bar reads like the page.
  const rank = (w: Wallet) => (w.archived ? 2 : custodyOf(w.type) === "self" ? 0 : 1);
  const parts = [...wallets]
    .sort((a, b) => rank(a) - rank(b))
    .filter((w) => (shares.get(w.id) ?? 0) > 0);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs tracking-wider text-muted uppercase">{t("wallets.total")}</span>
        <span className="text-right">
          <Amount className="block font-mono text-xl font-semibold">
            {fmt.amountWithUnit(total.btc)}
          </Amount>
          <Amount className="block font-mono text-xs text-muted">{fmt.fiat(total.valueEur)}</Amount>
        </span>
      </div>
      {parts.length > 0 && (
        <>
          <div
            role="img"
            aria-label={t("wallets.distributionLabel", {
              parts: parts.map((w) => `${w.name} ${pct(shares.get(w.id)!)}`).join(", "),
            })}
            className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-2"
          >
            {parts.map((w) => (
              <span
                key={w.id}
                title={`${w.name}: ${pct(shares.get(w.id)!)}`}
                className={`${WALLET_COLOR_CLASSES[walletColorOf(w, colorIndex.get(w.id)!)].bg} ${
                  w.archived ? "opacity-50" : ""
                }`}
                style={{ width: `${shares.get(w.id)! * 100}%` }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
            {parts.map((w) => (
              <li key={w.id} className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    WALLET_COLOR_CLASSES[walletColorOf(w, colorIndex.get(w.id)!)].bg
                  }`}
                />
                <span className="text-foreground">{w.name}</span>
                <span>{pct(shares.get(w.id)!)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function GroupSection({
  title,
  hint,
  holding,
  wallets,
  view,
  ctx,
}: {
  title: string;
  hint: string;
  holding: Holding;
  wallets: Wallet[];
  view: "cards" | "table";
  ctx: ListContext;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-muted uppercase">{title}</h2>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <div className="text-right font-mono text-xs">
          <span className="mr-2 font-sans text-muted">{t("wallets.subtotal")}</span>
          <Amount>{fmt.amountWithUnit(holding.btc)}</Amount>
          <Amount className="ml-2 text-muted">{fmt.fiat(holding.valueEur)}</Amount>
        </div>
      </div>
      <WalletList wallets={wallets} view={view} ctx={ctx} />
    </section>
  );
}

function WalletList({
  wallets,
  view,
  ctx,
}: {
  wallets: Wallet[];
  view: "cards" | "table";
  ctx: ListContext;
}) {
  const ids = wallets.map((w) => w.id);
  return view === "table" ? (
    <WalletTable wallets={wallets} groupIds={ids} ctx={ctx} />
  ) : (
    <ul className="space-y-3">
      {wallets.map((w) => (
        <li key={w.id} {...ctx.reorder.itemProps(w.id, ids)}>
          <WalletCard wallet={w} groupIds={ids} ctx={ctx} />
        </li>
      ))}
    </ul>
  );
}

/** Balance and share of one wallet, the way both views state it. */
function ShareBar({ share, color, label }: { share: number; color: WalletColorId; label: string }) {
  return (
    <span className="flex items-center gap-2" title={label}>
      <span aria-hidden className="h-1 w-16 overflow-hidden rounded-full bg-surface-2">
        <span
          className={`block h-full ${WALLET_COLOR_CLASSES[color].bg}`}
          style={{ width: `${share * 100}%` }}
        />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Sparkline({ points, color }: { points: number[]; color: WalletColorId }) {
  const { t } = useI18n();
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const W = 80;
  const H = 22;
  const d = points
    .map((p, i) => `${((i / (points.length - 1)) * W).toFixed(1)},${(H - 1 - ((p - min) / span) * (H - 2)).toFixed(1)}`)
    .join(" ");
  // The shape of a balance says something about its size; it is blurred with
  // the figures in privacy mode.
  return (
    <Amount className="inline-block">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`h-[22px] w-20 ${WALLET_COLOR_CLASSES[color].text}`}
        role="img"
        aria-label={t("wallets.sparkline")}
      >
        <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </Amount>
  );
}

function Chip({
  children,
  tone = "muted",
  title,
}: {
  children: React.ReactNode;
  tone?: "muted" | "warning" | "gain";
  title?: string;
}) {
  const cls = {
    muted: "bg-surface-2 text-muted",
    warning: "bg-warning/15 text-warning",
    gain: "bg-gain/15 text-gain",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
}

/** KYC, backup check and archive state: small, and only what is known. */
function WalletBadges({ wallet, holding, now }: { wallet: Wallet; holding: Holding; now: Date }) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const backup = backupStatus(wallet, now);
  const kyc = wallet.kyc ?? "unknown";
  return (
    <>
      {wallet.archived && <Chip>{t("wallets.archive.badge")}</Chip>}
      {wallet.archived && !holding.btc.isZero() && (
        <Chip tone="warning">
          <WarnIcon /> {t("wallets.archive.holdingBadge")}
        </Chip>
      )}
      {kyc !== "unknown" && (
        <Chip title={t("wallets.kyc.badgeTitle", { status: t(`wallets.kyc.${kyc}`) })}>
          {t(`wallets.kyc.${kyc}`)}
        </Chip>
      )}
      {backup.kind === "never" && <Chip>{t("wallets.backup.never")}</Chip>}
      {backup.kind === "ok" && (
        <Chip>
          <CheckIcon /> {t("wallets.backup.ok", { date: formatCalendarDate(backup.checkedAt, loc) })}
        </Chip>
      )}
      {backup.kind === "due" && (
        <Chip tone="warning">
          <WarnIcon /> {t("wallets.backup.due", { date: formatCalendarDate(backup.checkedAt, loc) })}
        </Chip>
      )}
    </>
  );
}

/** The data-quality counts of one wallet, each a way into the rows it counts. */
function QualityLinks({
  walletId,
  counts,
  onOpenTransactions,
}: {
  walletId: string;
  counts: WalletIssueCounts | undefined;
  onOpenTransactions?: (filter: TxFilter) => void;
}) {
  const { t } = useI18n();
  const open = WALLET_ISSUES.filter((i) => (counts?.[i] ?? 0) > 0);
  if (!counts || open.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("wallets.quality.label")} role="group">
      {open.map((issue) => {
        const label = t(`wallets.quality.${issue}`, { count: counts[issue] });
        return onOpenTransactions ? (
          <button
            key={issue}
            type="button"
            onClick={() => onOpenTransactions({ walletId, issue })}
            className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning underline-offset-2 hover:underline"
          >
            <WarnIcon /> {label} →
          </button>
        ) : (
          <Chip key={issue} tone="warning">
            <WarnIcon /> {label}
          </Chip>
        );
      })}
    </div>
  );
}

function WalletCard({
  wallet: w,
  groupIds,
  ctx,
}: {
  wallet: Wallet;
  groupIds: string[];
  ctx: ListContext;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  const locked = useReadOnly();
  const holding = ctx.holdings.byWallet.get(w.id)!;
  const color = walletColorOf(w, ctx.colorIndex.get(w.id)!);
  const custodial = custodyOf(w.type) === "custodial";
  const share = ctx.shares.get(w.id) ?? 0;
  const activeAccounts = w.accounts.filter((a) => !a.archived);
  const archivedAccounts = w.accounts.filter((a) => a.archived);
  const dropTarget = ctx.reorder.overId === w.id;

  return (
    <article
      aria-label={w.name}
      className={`rounded-xl border border-l-4 bg-surface p-4 ${WALLET_COLOR_CLASSES[color].border} ${
        dropTarget ? "border-accent" : "border-border-c"
      } ${w.archived ? "opacity-80" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <DragHandle {...ctx.reorder.handleProps(w.id, w.name, groupIds)} />
        <WalletTile icon={walletIconOf(w)} color={color} custodial={custodial} />
        <div className="min-w-0 flex-1">
          {/* The name is the way in: a row that shows a balance has to be
              able to explain it, and that explanation is the detail page. */}
          <button
            className="max-w-full truncate text-left font-semibold hover:text-accent"
            title={t("holdings.openDetail")}
            onClick={() => ctx.onOpenWallet({ walletId: w.id })}
          >
            {w.name}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{t(`wallets.types.${w.type}`)}</span>
            <WalletBadges wallet={w} holding={holding} now={ctx.now} />
          </div>
          {w.note && (
            <p className="mt-1 line-clamp-2 text-xs text-muted italic" title={w.note}>
              {w.note}
            </p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1 text-right">
          <Amount className="font-mono text-lg leading-tight font-semibold">
            {fmt.amountWithUnit(holding.btc)}
          </Amount>
          <Amount className="font-mono text-xs text-muted">{fmt.fiat(holding.valueEur)}</Amount>
          <span className="flex items-center gap-2 text-[11px] text-muted">
            <ShareBar
              share={share}
              color={color}
              label={t("wallets.shareOfTotal", { pct: ctx.pct(share) })}
            />
            <span aria-hidden>{ctx.pct(share)}</span>
          </span>
          <Sparkline points={ctx.sparklines.get(w.id) ?? []} color={color} />
        </div>
      </div>

      {/* A wallet can still end up here by having its last account
          deleted, or from a file written before this. Saying nothing
          would leave it missing from every list with no explanation. */}
      {w.accounts.length === 0 && (
        <p className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs leading-relaxed text-warning">
          <WarnIcon /> {t("wallets.noAccounts")}
        </p>
      )}

      {activeAccounts.length > 0 && (
        <ul className="mt-3 divide-y divide-border-c/50 border-t border-border-c/50">
          {activeAccounts.map((a) => (
            <AccountRow key={a.id} wallet={w} account={a} ctx={ctx} />
          ))}
        </ul>
      )}
      {archivedAccounts.length > 0 && (
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer py-1 text-xs text-muted hover:text-foreground">
            {t("wallets.archive.accounts", { count: archivedAccounts.length })}
          </summary>
          <ul className="divide-y divide-border-c/50">
            {archivedAccounts.map((a) => (
              <AccountRow key={a.id} wallet={w} account={a} ctx={ctx} />
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 space-y-2">
        <QualityLinks
          walletId={w.id}
          counts={ctx.issues.get(w.id)}
          onOpenTransactions={ctx.onOpenTransactions}
        />
        <ChainCheck wallet={w} holding={holding} onOpenTransactions={ctx.onOpenTransactions} />
      </div>

      <div
        role="group"
        aria-label={t("wallets.actions.label", { name: w.name })}
        className="mt-3 flex flex-wrap gap-1 border-t border-border-c/50 pt-2"
      >
        <Button variant="ghost" {...locked.props} onClick={() => ctx.addTransaction(w)}>
          + {t("wallets.actions.addTransaction")}
        </Button>
        <Button variant="ghost" {...locked.props} onClick={() => ctx.addTransaction(w, "transfer")}>
          ⇄ {t("wallets.actions.transfer")}
        </Button>
        <Button variant="ghost" {...locked.props} onClick={() => ctx.startImport(w.id)}>
          {t("wallets.actions.import")}
        </Button>
        {ctx.onOpenTransactions && (
          <Button variant="ghost" onClick={() => ctx.onOpenTransactions!({ walletId: w.id })}>
            {t("wallets.actions.transactions")} →
          </Button>
        )}
        <span className="ml-auto flex flex-wrap gap-1">
          <Button
            variant="ghost"
            {...locked.props}
            onClick={() => ctx.openDialog({ kind: "addAccount", walletId: w.id })}
          >
            + {t("wallets.addAccount")}
          </Button>
          <Button
            variant="ghost"
            {...locked.props}
            onClick={() => ctx.openDialog({ kind: "editWallet", walletId: w.id })}
          >
            {t("wallets.edit")}
          </Button>
          {w.archived ? (
            <Button variant="ghost" {...locked.props} onClick={() => ctx.restore(w.id)}>
              {t("wallets.archive.restore")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              {...locked.props}
              onClick={() => ctx.openDialog({ kind: "archive", walletId: w.id })}
            >
              {t("wallets.archive.action")}
            </Button>
          )}
        </span>
      </div>
    </article>
  );
}

function AccountRow({
  wallet: w,
  account: a,
  ctx,
}: {
  wallet: Wallet;
  account: Account;
  ctx: ListContext;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  const locked = useReadOnly();
  const store = useAppStore();
  const h = ctx.holdings.byAccount.get(a.id)!;
  return (
    <li className="group flex flex-wrap items-center gap-2 py-1.5">
      <button
        className="min-w-0 flex-1 truncate text-left text-sm hover:text-accent"
        title={t("holdings.openDetail")}
        onClick={() => ctx.onOpenWallet({ walletId: w.id, accountId: a.id })}
      >
        <span aria-hidden className="mr-1.5 text-muted">
          └
        </span>
        {a.name}
        <span className="ml-2 text-xs text-muted">{a.transactions.length} Tx</span>
      </button>
      {a.archived && !h.btc.isZero() && (
        <Chip tone="warning">
          <WarnIcon /> {t("wallets.archive.holdingBadge")}
        </Chip>
      )}
      <span className="shrink-0 text-right font-mono text-xs whitespace-nowrap">
        <Amount>{fmt.amountWithUnit(h.btc)}</Amount>
        <Amount className="ml-2 text-muted">{fmt.fiat(h.valueEur)}</Amount>
      </span>
      {/* Always there on a touch screen, which cannot hover; on a desktop
          they appear with the pointer or the keyboard focus. */}
      <span className="flex gap-1 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <Button
          variant="ghost"
          {...locked.props}
          onClick={() =>
            ctx.openDialog({ kind: "renameAccount", walletId: w.id, accountId: a.id, current: a.name })
          }
        >
          {t("wallets.rename")}
        </Button>
        {a.archived ? (
          <Button variant="ghost" {...locked.props} onClick={() => ctx.restore(w.id, a.id)}>
            {t("wallets.archive.restore")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            {...locked.props}
            onClick={() => ctx.openDialog({ kind: "archive", walletId: w.id, accountId: a.id })}
          >
            {t("wallets.archive.action")}
          </Button>
        )}
        <Button
          variant="ghost"
          {...locked.props}
          onClick={() => {
            if (confirm(t("wallets.deleteAccountConfirm", { name: a.name })))
              store.deleteAccount(w.id, a.id);
          }}
        >
          {t("common.delete")}
        </Button>
      </span>
    </li>
  );
}

/** The dense view, for a list too long for cards. */
function WalletTable({
  wallets,
  groupIds,
  ctx,
}: {
  wallets: Wallet[];
  groupIds: string[];
  ctx: ListContext;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  const locked = useReadOnly();
  return (
    <div className="overflow-x-auto rounded-xl border border-border-c bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-c text-left text-xs text-muted">
            <th className="w-8 py-2 pl-2 font-normal">
              <span className="sr-only">{t("wallets.move", { name: "" })}</span>
            </th>
            <th className="py-2 pr-3 font-normal">{t("wallets.name")}</th>
            <th className="py-2 pr-3 font-normal">{t("wallets.type")}</th>
            <th className="py-2 pr-3 text-right font-normal">{t("wallets.holding")}</th>
            <th className="py-2 pr-3 text-right font-normal">{t("holdings.value")}</th>
            <th className="py-2 pr-3 text-right font-normal">{t("wallets.share")}</th>
            <th className="py-2 pr-3 text-right font-normal">{t("wallets.accountsCount")}</th>
            <th className="py-2 pr-2 font-normal">
              <span className="sr-only">{t("common.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {wallets.map((w) => {
            const h = ctx.holdings.byWallet.get(w.id)!;
            const color = walletColorOf(w, ctx.colorIndex.get(w.id)!);
            const share = ctx.shares.get(w.id) ?? 0;
            const archivedAccounts = w.accounts.filter((a) => a.archived).length;
            return (
              <tr
                key={w.id}
                {...ctx.reorder.itemProps(w.id, groupIds)}
                className={`border-b border-border-c/40 last:border-0 ${
                  ctx.reorder.overId === w.id ? "bg-accent/10" : ""
                }`}
              >
                <td className="py-1.5 pl-2">
                  <DragHandle {...ctx.reorder.handleProps(w.id, w.name, groupIds)} />
                </td>
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={WALLET_COLOR_CLASSES[color].text}>
                      <WalletIcon icon={walletIconOf(w)} className="h-4 w-4" />
                    </span>
                    <button
                      className="truncate text-left font-medium hover:text-accent"
                      title={t("holdings.openDetail")}
                      onClick={() => ctx.onOpenWallet({ walletId: w.id })}
                    >
                      {w.name}
                    </button>
                    {w.archived && !h.btc.isZero() && (
                      <Chip tone="warning">
                        <WarnIcon /> {t("wallets.archive.holdingBadge")}
                      </Chip>
                    )}
                  </span>
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-muted">
                  {t(`wallets.types.${w.type}`)}
                  {w.kyc && w.kyc !== "unknown" && (
                    <span className="ml-1.5">· {t(`wallets.kyc.${w.kyc}`)}</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap">
                  <Amount>{fmt.amount(h.btc)}</Amount>
                </td>
                <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap text-muted">
                  <Amount>{fmt.fiat(h.valueEur)}</Amount>
                </td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <ShareBar share={share} color={color} label={t("wallets.shareOfTotal", { pct: ctx.pct(share) })} />
                    <span aria-hidden className="w-12 text-xs">{ctx.pct(share)}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right text-muted">
                  {w.accounts.length - archivedAccounts}
                  {archivedAccounts > 0 && (
                    <span className="text-xs" title={t("wallets.archive.accounts", { count: archivedAccounts })}>
                      {" "}
                      (+{archivedAccounts})
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    {...locked.props}
                    onClick={() => ctx.openDialog({ kind: "editWallet", walletId: w.id })}
                  >
                    {t("wallets.edit")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Book balance against the chain, for a wallet with watched addresses.
 *
 * Nothing is fetched until the button is pressed (§1), and the answer is kept
 * for the session. Without a queryable address the whole block is absent —
 * there is no question to ask, so there is no error to show either. The
 * figures are named, not resolved: only the owner knows whether a transaction
 * is missing, doubled, or an address is missing from the watchlist.
 */
function ChainCheck({
  wallet,
  holding,
  onOpenTransactions,
}: {
  wallet: Wallet;
  holding: Holding;
  onOpenTransactions?: (filter: TxFilter) => void;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const mine = useMemo(
    () => portfolio.watchedAddresses.filter((a) => a.walletId === wallet.id),
    [portfolio.watchedAddresses, wallet.id],
  );
  const scan = useOnDemandScan(portfolio.explorerSettings, mine);
  const queryable = mine.filter((a) => a.type === "address").length;
  if (queryable === 0) return null;

  const explorer = explorerBase(portfolio.explorerSettings) || "—";
  let result: React.ReactNode = null;
  if (scan.loading) {
    result = <span className="text-muted">{t("wallets.chain.loading")}</span>;
  } else if (scan.error) {
    result = (
      <span className="text-muted">
        {t("wallets.chain.error")} ({explorer})
      </span>
    );
  } else if (scan.data) {
    const chainBtc = dec(summarizeUtxos(scan.data).totalSats).div(SATS_PER_BTC);
    const diff = chainBtc.minus(holding.btc);
    // Both sides count whole satoshis; less than one is division noise.
    const matches = diff.abs().lt(dec(1).div(SATS_PER_BTC));
    result = (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted">
          {t("wallets.chain.ledger")}{" "}
          <Amount className="font-mono text-foreground">{fmt.amount(holding.btc)}</Amount>
        </span>
        <span className="text-muted">
          {t("wallets.chain.chain")}{" "}
          <Amount className="font-mono text-foreground">{fmt.amount(chainBtc)}</Amount>
        </span>
        {/* Never colour alone: the verdict is a sentence with an icon. */}
        {matches ? (
          <span className="text-gain">
            <CheckIcon /> {t("wallets.chain.match")}
          </span>
        ) : (
          <span className="text-warning">
            <WarnIcon /> {t("wallets.chain.diff")}{" "}
            {/* The sign comes from the formatter, never from the component. */}
            <Amount className="font-mono">{`${fmt.amount(diff, true)} ${fmt.unit}`}</Amount>
            {". "}
            {t("wallets.chain.mismatch")}
          </span>
        )}
        {!matches && onOpenTransactions && (
          <button
            type="button"
            className="text-accent underline-offset-2 hover:underline"
            onClick={() => onOpenTransactions({ walletId: wallet.id })}
          >
            {t("wallets.chain.review")} →
          </button>
        )}
        {scan.data.skipped > 0 && (
          <span className="w-full text-[11px] text-muted">
            {t("holdings.onChainPartial", { count: scan.data.skipped })}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-c/60 bg-surface-2/40 px-3 py-2 text-xs">
      <Button variant="default" onClick={scan.run} disabled={scan.loading}>
        {scan.requested ? t("wallets.chain.recheck") : t("wallets.chain.check")}
      </Button>
      {result ?? (
        <span className="text-muted">
          {t("wallets.chain.hint", { count: queryable, explorer })}
        </span>
      )}
    </div>
  );
}

function ArchiveDialog({
  target,
  holding,
  onClose,
}: {
  target: { walletId: string; accountId?: string };
  holding: Holding;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  const store = useAppStore();
  const wallet = store.portfolio!.wallets.find((w) => w.id === target.walletId);
  const account = wallet?.accounts.find((a) => a.id === target.accountId);
  if (!wallet) return null;
  const holds = !holding.btc.isZero();
  return (
    <Modal
      title={
        account
          ? t("wallets.archive.confirmAccountTitle", { name: account.name })
          : t("wallets.archive.confirmWalletTitle", { name: wallet.name })
      }
      onClose={onClose}
    >
      <div className="space-y-3 text-sm leading-relaxed">
        <p className="text-muted">{t("wallets.archive.confirmBody")}</p>
        {holds && (
          <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/5 p-3 text-warning" role="alert">
            <p className="font-medium">
              <WarnIcon /> {t("wallets.archive.holdingLabel")}:{" "}
              <Amount className="font-mono">{fmt.amountWithUnit(holding.btc)}</Amount>
            </p>
            <p>{t("wallets.archive.confirmHolding")}</p>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => {
              if (account) store.setAccountArchived(wallet.id, account.id, true);
              else store.updateWallet(wallet.id, { archived: true });
              onClose();
            }}
          >
            {holds ? t("wallets.archive.confirm") : t("wallets.archive.confirmPlain")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Everything about a wallet that is not its ledger. The two free-form fields —
 * the note and the backup date — each say, next to the field, that secrets do
 * not belong here: the one moment the warning is read is while typing.
 */
function EditWalletDialog({
  wallet,
  now,
  onClose,
}: {
  wallet: Wallet;
  now: Date;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const store = useAppStore();
  const index = store.portfolio!.wallets.findIndex((w) => w.id === wallet.id);
  const [name, setName] = useState(wallet.name);
  const [type, setType] = useState<WalletType>(wallet.type);
  const [icon, setIcon] = useState<WalletIconId>(walletIconOf(wallet));
  const [color, setColor] = useState<WalletColorId>(walletColorOf(wallet, index));
  const [kyc, setKyc] = useState<KycStatus>(wallet.kyc ?? "unknown");
  const [note, setNote] = useState(wallet.note ?? "");
  const [backupDate, setBackupDate] = useState(
    () => readStoredCalendarDate(wallet.backupCheckedAt) ?? "",
  );
  const [reminder, setReminder] = useState(wallet.backupReminder ?? false);
  // Today on the user's own calendar; toISOString() would give the UTC date.
  const today = todayCalendarDate(now, localTimeZone());
  const nameRef = useRef<HTMLInputElement>(null);

  function save() {
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    const seed = hasSeedBackup(type);
    store.updateWallet(wallet.id, {
      name: name.trim(),
      type,
      // A choice equal to the default is still stored: it was made, and it
      // must not change when the wallet moves or its type changes.
      icon,
      color,
      kyc: kyc === "unknown" ? undefined : kyc,
      note: note.trim() || undefined,
      // An exchange has no seed of the owner's to check.
      backupCheckedAt: seed && backupDate ? backupDate : undefined,
      backupReminder: seed && backupDate && reminder ? true : undefined,
    });
    onClose();
  }

  const radioCls =
    "flex cursor-pointer items-center justify-center rounded-lg border border-border-c p-2 has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent";

  return (
    <Modal title={t("wallets.editTitle")} onClose={onClose} size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("wallets.walletName")}>
            <input
              ref={nameRef}
              autoFocus
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t("wallets.type")}>
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value as WalletType)}
            >
              {WALLET_TYPES.map((wt) => (
                <option key={wt} value={wt}>
                  {t(`wallets.types.${wt}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1 text-xs text-muted">{t("wallets.icon")}</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {WALLET_ICON_IDS.map((id) => (
              <label key={id} className={radioCls} title={t(`wallets.icons.${id}`)}>
                <input
                  type="radio"
                  name="wallet-icon"
                  className="sr-only"
                  checked={icon === id}
                  onChange={() => setIcon(id)}
                />
                <WalletIcon icon={id} />
                <span className="sr-only">{t(`wallets.icons.${id}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs text-muted">{t("wallets.color")}</legend>
          <div className="flex flex-wrap gap-2">
            {WALLET_COLOR_IDS.map((id) => (
              <label key={id} className={`${radioCls} gap-2 px-3`}>
                <input
                  type="radio"
                  name="wallet-color"
                  className="sr-only"
                  checked={color === id}
                  onChange={() => setColor(id)}
                />
                <span aria-hidden className={`h-4 w-4 rounded-full ${WALLET_COLOR_CLASSES[id].bg}`} />
                <span className="text-xs">{t(`wallets.colors.${id}`)}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">{t("wallets.colorHint")}</p>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-xs text-muted">{t("wallets.kyc.label")}</legend>
          <div className="flex flex-wrap gap-2">
            {KYC_STATUSES.map((id) => (
              <label key={id} className={`${radioCls} px-3 text-xs`}>
                <input
                  type="radio"
                  name="wallet-kyc"
                  className="sr-only"
                  checked={kyc === id}
                  onChange={() => setKyc(id)}
                />
                {t(`wallets.kyc.${id}`)}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{t("wallets.kyc.hint")}</p>
        </fieldset>

        {hasSeedBackup(type) && (
          <fieldset className="space-y-2 rounded-lg border border-border-c/60 p-3">
            <legend className="px-1 text-xs text-muted">{t("wallets.backup.label")}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label={t("wallets.backup.label")}
                className={`${inputCls} w-auto`}
                max={today}
                value={backupDate}
                onChange={(e) => setBackupDate(e.target.value)}
              />
              <Button onClick={() => setBackupDate(today)}>{t("wallets.backup.today")}</Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reminder}
                disabled={!backupDate}
                onChange={(e) => setReminder(e.target.checked)}
              />
              {t("wallets.backup.reminder")}
            </label>
            <p className="rounded-md bg-warning/10 p-2 text-xs leading-relaxed text-warning">
              <WarnIcon /> {t("wallets.backup.warning")}
            </p>
          </fieldset>
        )}

        <Field label={t("wallets.note.label")}>
          <textarea
            className={`${inputCls} min-h-[4.5rem]`}
            placeholder={t("wallets.note.placeholder")}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="mt-1 block text-xs leading-relaxed text-warning">
            <WarnIcon /> {t("wallets.note.warning")}
          </span>
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary">
            {t("common.save")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            className="ml-auto"
            onClick={() => {
              if (confirm(t("wallets.deleteWalletConfirm", { name: wallet.name }))) {
                store.deleteWallet(wallet.id);
                onClose();
              }
            }}
          >
            {t("wallets.deleteWallet")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
