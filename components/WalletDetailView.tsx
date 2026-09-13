"use client";

// One wallet, or one account inside it: what it holds, what it is made of, and
// what belongs to it.
//
// The figures all come from `lib/holdings.ts` — the same function the wallet
// list, the transaction table's summary row and the popover read, so nothing
// here can quietly compute a balance of its own. What this view adds is the
// arrangement: the holding first, then the accounts under it, then the open
// lots it is made of, then the addresses of this wallet (and, where the chain
// can be asked, the comparison against them), and finally the last few
// transactions with the way into the filtered table.

import { useMemo, useState } from "react";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useReadOnly } from "@/lib/readOnly";
import { Decimal, ZERO, dec } from "@/lib/decimal";
import { computeFifo } from "@/lib/fifo";
import { TAX_FEATURES_ENABLED } from "@/lib/features";
import { flattenLedger, type Wallet } from "@/lib/types";
import { SATS_PER_BTC, useValueFormat } from "@/lib/displayUnit";
import { portfolioHoldings, type Holding } from "@/lib/holdings";
import { summarizeUtxos, useWatchlistScan } from "@/lib/watchlistScan";
import { explorerBase } from "@/lib/esplora";
import HelpButton from "./help/HelpButton";
import TransactionForm from "./TransactionForm";
import {
  HoldingFigures,
  LotStatusBadge,
  TaxSplit,
  UnassignedNote,
} from "./HoldingFigures";
import { Amount, Button, Card, Field, Modal, SectionTitle, inputCls } from "./ui";
import { CheckIcon, WarnIcon } from "./icons";

/** Which scope the page is showing: a whole wallet, or one of its accounts. */
export interface WalletDetailTarget {
  walletId: string;
  accountId?: string;
}

type Dialog =
  | { kind: "renameWallet"; current: string }
  | { kind: "renameAccount"; accountId: string; current: string }
  | { kind: "addAccount" };

/** How many of each list is shown before asking for the rest. */
const LOT_PAGE = 15;
const RECENT_TRANSACTIONS = 8;

export default function WalletDetailView({
  target,
  onBack,
  onOpenTarget,
  onOpenTransactions,
  onOpenWatchlist,
}: {
  target: WalletDetailTarget;
  onBack: () => void;
  /** Switch between the wallet and one of its accounts. */
  onOpenTarget: (target: WalletDetailTarget) => void;
  onOpenTransactions: (filter: { walletId: string; accountId?: string }) => void;
  onOpenWatchlist: () => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const store = useAppStore();
  const locked = useReadOnly();
  const fmt = useValueFormat();

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState("");
  const [lotLimit, setLotLimit] = useState(LOT_PAGE);
  const [adding, setAdding] = useState(false);

  const wallet = portfolio.wallets.find((w) => w.id === target.walletId);
  const account = wallet?.accounts.find((a) => a.id === target.accountId);

  const entries = useMemo(() => flattenLedger(portfolio.wallets), [portfolio]);
  const holdings = useMemo(
    () =>
      portfolioHoldings(
        {
          entries,
          fifo: computeFifo(entries, portfolio.settings.holdingPeriodDays),
          priceEur: fmt.priceEur,
        },
        portfolio.wallets,
      ),
    [entries, portfolio.wallets, portfolio.settings.holdingPeriodDays, fmt.priceEur],
  );

  // A wallet deleted while its page was open: say so rather than crashing on
  // the way to a balance that no longer has anything to be about.
  if (!wallet) {
    return (
      <div className="space-y-4">
        <Button onClick={onBack}>← {t("holdings.back")}</Button>
        <Card>
          <p className="text-sm text-muted">{t("wallets.empty")}</p>
        </Card>
      </div>
    );
  }

  const holding: Holding =
    (target.accountId !== undefined
      ? holdings.byAccount.get(target.accountId)
      : holdings.byWallet.get(wallet.id)) ?? holdings.byWallet.get(wallet.id)!;

  const scopeEntries = entries.filter((e) =>
    target.accountId !== undefined
      ? e.accountId === target.accountId
      : e.walletId === wallet.id,
  );
  const recent = [...scopeEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_TRANSACTIONS);

  const addresses = portfolio.watchedAddresses.filter((a) => a.walletId === wallet.id);

  function openDialog(d: Dialog) {
    setName(d.kind === "addAccount" ? "" : d.current);
    setDialog(d);
  }

  function submitDialog() {
    if (!dialog || !name.trim()) return;
    const n = name.trim();
    switch (dialog.kind) {
      case "renameWallet":
        store.renameWallet(wallet!.id, n);
        break;
      case "renameAccount":
        store.renameAccount(wallet!.id, dialog.accountId, n);
        break;
      case "addAccount":
        store.addAccount(wallet!.id, {
          id: crypto.randomUUID(),
          name: n,
          transactions: [],
        });
        break;
    }
    setDialog(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← {t("holdings.back")}
        </Button>
        {/* One level deeper, the way back up to the wallet is a click, not a
            detour through the list. */}
        {account && (
          <Button variant="ghost" onClick={() => onOpenTarget({ walletId: wallet.id })}>
            {wallet.name}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle level={1}>
            {account ? `${wallet.name} / ${account.name}` : wallet.name}
          </SectionTitle>
          <span className="mb-3 shrink-0 rounded bg-surface-2 px-2 py-0.5 text-xs whitespace-nowrap text-muted">
            {t(`wallets.types.${wallet.type}`)}
          </span>
          <HelpButton anchor="wallets-structure" label={t("holdings.title")} className="mb-3" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" {...locked.props} onClick={() => setAdding(true)}>
            + {t("holdings.addTransaction")}
          </Button>
          <Button
            {...locked.props}
            onClick={() =>
              account
                ? openDialog({
                    kind: "renameAccount",
                    accountId: account.id,
                    current: account.name,
                  })
                : openDialog({ kind: "renameWallet", current: wallet.name })
            }
          >
            {t("wallets.rename")}
          </Button>
          {!account && (
            <Button {...locked.props} onClick={() => openDialog({ kind: "addAccount" })}>
              + {t("wallets.addAccount")}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted">
        {account ? t("holdings.accountSubtitle") : t("holdings.walletSubtitle")}
      </p>

      <Card className="space-y-4">
        <HoldingFigures holding={holding} />
        <UnassignedNote holding={holding} />
        <TaxSplit holding={holding} />
      </Card>

      {!account && (
        <Card>
          <SectionTitle>{t("holdings.accountsSection")}</SectionTitle>
          {wallet.accounts.length === 0 ? (
            <p className="text-sm text-muted">
              <WarnIcon /> {t("holdings.accountsEmpty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-c text-left text-xs text-muted">
                    <th className="py-1.5 pr-3 font-normal">{t("tx.account")}</th>
                    <th className="py-1.5 pr-3 text-right font-normal">{fmt.unit}</th>
                    <th className="py-1.5 pr-3 text-right font-normal">
                      {t("holdings.value")}
                    </th>
                    <th className="py-1.5 text-right font-normal">{t("holdings.txCount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {wallet.accounts.map((a) => {
                    const h = holdings.byAccount.get(a.id)!;
                    return (
                      <tr
                        key={a.id}
                        className="cursor-pointer border-b border-border-c/40 last:border-0 hover:bg-surface-2/50"
                        title={t("holdings.openDetail")}
                        onClick={() =>
                          onOpenTarget({ walletId: wallet.id, accountId: a.id })
                        }
                      >
                        <td className="py-1.5 pr-3 whitespace-nowrap">{a.name}</td>
                        <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap">
                          <Amount>{fmt.amount(h.btc)}</Amount>
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap text-muted">
                          <Amount>{fmt.fiat(h.valueEur)}</Amount>
                        </td>
                        <td className="py-1.5 text-right text-muted">
                          {h.transactionCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card>
        <SectionTitle>{t("holdings.lotsSection")}</SectionTitle>
        {holding.lots.length === 0 ? (
          <p className="text-sm text-muted">{t("holdings.lotsEmpty")}</p>
        ) : (
          <>
            <p className="mb-2 text-xs leading-relaxed text-muted">
              {t("holdings.lotsIntro")}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-c text-left text-xs text-muted">
                    <th className="py-1.5 pr-3 font-normal">{t("holdings.lotsAcquired")}</th>
                    {!account && (
                      <th className="py-1.5 pr-3 font-normal">{t("holdings.lotsSource")}</th>
                    )}
                    <th className="py-1.5 pr-3 text-right font-normal">{fmt.unit}</th>
                    <th className="py-1.5 pr-3 text-right font-normal">
                      {t("holdings.lotsCost")}
                    </th>
                    {TAX_FEATURES_ENABLED && (
                      <th className="py-1.5 font-normal">{t("holdings.lotsStatus")}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {holding.lots.slice(0, lotLimit).map((lot, i) => (
                    <tr
                      key={`${lot.txId}-${lot.acquiredDate}-${i}`}
                      className="border-b border-border-c/40 last:border-0"
                    >
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {formatDate(lot.acquiredDate, loc)}
                      </td>
                      {!account && (
                        <td className="py-1.5 pr-3 whitespace-nowrap text-muted">
                          {lot.accountName}
                        </td>
                      )}
                      <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap">
                        <Amount>{fmt.amount(lot.amountBtc)}</Amount>
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap">
                        {lot.costPerBtcEur === null ? (
                          <span className="text-muted">?</span>
                        ) : (
                          <Amount>{fmt.fiat(lot.costPerBtcEur)}</Amount>
                        )}
                      </td>
                      {TAX_FEATURES_ENABLED && (
                        <td className="py-1.5 whitespace-nowrap">
                          <LotStatusBadge lot={lot} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {holding.lots.length > lotLimit && (
              <Button
                className="mt-2"
                onClick={() => setLotLimit((n) => n + LOT_PAGE)}
              >
                {t("holdings.showMore", { count: holding.lots.length - lotLimit })}
              </Button>
            )}
          </>
        )}
      </Card>

      {/* Addresses belong to a wallet, not to one of its accounts: a watchlist
          entry says "these coins are in this wallet", and the chain knows
          nothing about the accounts one keeps inside it. */}
      {!account && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>{t("holdings.addressesSection")}</SectionTitle>
            <Button variant="ghost" onClick={onOpenWatchlist}>
              {t("holdings.addressesManage")}
            </Button>
          </div>
          {addresses.length === 0 ? (
            <p className="text-sm text-muted">{t("holdings.addressesEmpty")}</p>
          ) : (
            <ChainSection wallet={wallet} holding={holding} />
          )}
          <p className="mt-2 text-[0.65rem] leading-relaxed text-muted">
            {t("holdings.addressesHint")}
          </p>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>{t("holdings.recentSection")}</SectionTitle>
          <Button
            variant="ghost"
            onClick={() =>
              onOpenTransactions({ walletId: wallet.id, accountId: target.accountId })
            }
          >
            {t("holdings.showTransactions")} →
          </Button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">{t("holdings.recentEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-c text-left text-xs text-muted">
                  <th className="py-1.5 pr-3 font-normal">{t("tx.date")}</th>
                  <th className="py-1.5 pr-3 font-normal">{t("tx.type")}</th>
                  {!account && (
                    <th className="py-1.5 pr-3 font-normal">{t("tx.account")}</th>
                  )}
                  <th className="py-1.5 text-right font-normal">{fmt.unit}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id} className="border-b border-border-c/40 last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {formatDate(e.date, loc)}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {t(`tx.types.${e.type}`)}
                    </td>
                    {!account && (
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted">
                        {e.accountName}
                      </td>
                    )}
                    <td className="py-1.5 text-right font-mono whitespace-nowrap">
                      <Amount>{fmt.amount(e.amountBtc)}</Amount>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adding && (
        <TransactionForm
          existing={null}
          initialAccountId={target.accountId ?? wallet.accounts[0]?.id}
          onClose={() => setAdding(false)}
        />
      )}

      {dialog && (
        <Modal
          title={dialog.kind === "addAccount" ? t("wallets.addAccount") : t("wallets.rename")}
          onClose={() => setDialog(null)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitDialog();
            }}
          >
            <Field
              label={
                dialog.kind === "renameWallet"
                  ? t("wallets.walletName")
                  : t("wallets.accountName")
              }
            >
              <input
                autoFocus
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
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

/**
 * The book balance against what the chain says about this wallet's addresses.
 *
 * Nothing is derived in either direction (§3.1): the comparison reads the
 * watchlist entries the user assigned to this wallet, asks the explorer *they*
 * configured, and puts the two numbers next to each other. A deviation is
 * named rather than resolved — only the owner knows whether a transaction is
 * missing from the ledger or an address is missing from the watchlist.
 *
 * xpub entries cannot be queried by address, so they are counted out loud
 * instead of silently making the chain side look too small.
 */
function ChainSection({ wallet, holding }: { wallet: Wallet; holding: Holding }) {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const mine = useMemo(
    () => portfolio.watchedAddresses.filter((a) => a.walletId === wallet.id),
    [portfolio.watchedAddresses, wallet.id],
  );
  const scan = useWatchlistScan(portfolio.explorerSettings, mine);
  const summary = useMemo(() => (scan.data ? summarizeUtxos(scan.data) : null), [scan.data]);

  const findingsOf = (addressId: string) => {
    const found = scan.data?.addresses.find((a) => a.id === addressId);
    return found?.analysis.findings.filter((f) => f.severity !== "info").length ?? 0;
  };


  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border-c/50 text-sm">
        {mine.map((a) => {
          const open = findingsOf(a.id);
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{a.label}</span>
                <span className="block truncate font-mono text-xs text-muted">
                  {a.value}
                </span>
              </span>
              {a.type !== "address" ? (
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                  {a.type}
                </span>
              ) : open > 0 ? (
                <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
                  <WarnIcon /> {t("holdings.addressFindings", { count: open })}
                </span>
              ) : scan.data ? (
                <span className="shrink-0 rounded-full bg-gain/15 px-2 py-0.5 text-[10px] text-gain">
                  <CheckIcon /> {t("holdings.addressNoFindings")}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* The comparison only exists once the chain has answered; until then
          the section is the address list and nothing more. */}
      {scan.loading ? (
        <p className="text-xs text-muted">{t("holdings.onChainLoading")}</p>
      ) : scan.error || summary === null || scan.data === null ? (
        <p className="text-xs text-muted">
          {t("holdings.onChainError")} ({explorerBase(portfolio.explorerSettings) || "—"})
        </p>
      ) : (
        <ChainComparison
          ledgerBtc={holding.btc}
          chainBtc={dec(summary.totalSats).div(SATS_PER_BTC)}
          skipped={scan.data.skipped}
        />
      )}
    </div>
  );
}

/**
 * The two figures side by side, and what their difference means.
 *
 * A deviation below one satoshi is none: both sides count in whole satoshis,
 * so anything smaller is an artefact of the division rather than a real gap.
 */
function ChainComparison({
  ledgerBtc,
  chainBtc,
  skipped,
}: {
  ledgerBtc: Decimal;
  chainBtc: Decimal;
  skipped: number;
}) {
  const { t } = useI18n();
  const fmt = useValueFormat();
  const diff = chainBtc.minus(ledgerBtc);
  const matches = diff.abs().lt(dec(1).div(SATS_PER_BTC));

  return (
    <div className="space-y-2 rounded-lg border border-border-c bg-surface-2/40 p-3">
      <p className="text-xs font-medium">{t("holdings.onChainSection")}</p>
      {/* Three figures side by side need the width for it; on a phone they
          stack rather than running into each other. */}
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted">{t("holdings.onChainLedger")}</div>
          <Amount className="font-mono">{fmt.amount(ledgerBtc)}</Amount>
        </div>
        <div>
          <div className="text-xs text-muted">{t("holdings.onChainChain")}</div>
          <Amount className="font-mono">{fmt.amount(chainBtc)}</Amount>
        </div>
        <div>
          <div className="text-xs text-muted">{t("holdings.onChainDiff")}</div>
          {/* The sign comes from the formatter, never from the component. */}
          <Amount className={`font-mono ${matches ? "text-gain" : "text-warning"}`}>
            {fmt.amount(matches ? ZERO : diff, !matches)}
          </Amount>
        </div>
      </div>
      {/* Never colour alone: the verdict is a sentence either way. */}
      <p className={`text-xs leading-relaxed ${matches ? "text-gain" : "text-warning"}`}>
        {matches ? (
          <>
            <CheckIcon /> {t("holdings.onChainMatch")}
          </>
        ) : (
          <>
            <WarnIcon /> {t("holdings.onChainMismatch")}
          </>
        )}
      </p>
      {skipped > 0 && (
        <p className="text-[0.65rem] leading-relaxed text-muted">
          {t("holdings.onChainPartial", { count: skipped })}
        </p>
      )}
    </div>
  );
}
