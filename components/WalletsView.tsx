"use client";

import { useMemo, useState } from "react";
import HelpButton from "./help/HelpButton";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useReadOnly } from "@/lib/readOnly";
import { computeFifo } from "@/lib/fifo";
import { flattenLedger, type WalletType } from "@/lib/types";
import { useValueFormat } from "@/lib/displayUnit";
import { portfolioHoldings, type Holding } from "@/lib/holdings";
import type { WalletDetailTarget } from "./WalletDetailView";
import { Amount, Button, Card, Field, Modal, SectionTitle, inputCls } from "./ui";
import { WarnIcon } from "./icons";

const WALLET_TYPES: WalletType[] = ["exchange", "hardware", "software", "paper"];

/**
 * Amount and value of a holding, the way every row in this list shows the
 * pair: the quantity in the display unit, the money it is worth underneath.
 */
function HoldingCell({ holding }: { holding: Holding }) {
  const fmt = useValueFormat();
  return (
    <span className="shrink-0 text-right font-mono text-xs whitespace-nowrap">
      <Amount className="block">{`${fmt.amount(holding.btc)} ${fmt.unit}`}</Amount>
      <Amount className="block text-muted">{fmt.fiat(holding.valueEur)}</Amount>
    </span>
  );
}

type Dialog =
  | { kind: "addWallet" }
  | { kind: "renameWallet"; walletId: string; current: string }
  | { kind: "addAccount"; walletId: string }
  | { kind: "renameAccount"; walletId: string; accountId: string; current: string };

export default function WalletsView({
  onOpenWallet,
}: {
  /** Open the detail view of a wallet or one of its accounts (§2). */
  onOpenWallet: (target: WalletDetailTarget) => void;
}) {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const locked = useReadOnly();
  const store = useAppStore();
  const fmt = useValueFormat();

  // The same computation every other holding surface reads (lib/holdings.ts),
  // for the whole portfolio in one pass rather than once per row.
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

  function openDialog(d: Dialog) {
    setName("current" in d ? d.current : "");
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
      case "renameWallet":
        store.renameWallet(dialog.walletId, n);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionTitle level={1}>{t("wallets.title")}</SectionTitle>
          <HelpButton anchor="wallets-structure" label={t("wallets.title")} className="mb-3" />
        </div>
        <Button variant="primary" {...locked.props} onClick={() => openDialog({ kind: "addWallet" })}>
          + {t("wallets.addWallet")}
        </Button>
      </div>

      {portfolio.wallets.length === 0 && (
        <Card className="space-y-3 text-center">
          <p className="text-sm text-muted">{t("wallets.empty")}</p>
          {/* An empty state that only states the emptiness leaves the user to
              find the action in the header; it belongs here. */}
          <Button variant="primary" {...locked.props} onClick={() => openDialog({ kind: "addWallet" })}>
            + {t("wallets.addWallet")}
          </Button>
        </Card>
      )}

      {portfolio.wallets.map((w) => (
        <Card key={w.id}>
          {/* The name wraps before the buttons do: a long wallet name used to
              break its own type badge onto a second line and push the actions
              out of the card. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {/* The name is the way in: a row that shows a balance has to be
                  able to explain it, and that explanation is the detail page. */}
              <button
                className="truncate font-semibold hover:text-accent"
                title={t("holdings.openDetail")}
                onClick={() => onOpenWallet({ walletId: w.id })}
              >
                {w.name}
              </button>
              <span className="shrink-0 rounded bg-surface-2 px-2 py-0.5 text-xs whitespace-nowrap text-muted">
                {t(`wallets.types.${w.type}`)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <HoldingCell holding={holdings.byWallet.get(w.id)!} />
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  {...locked.props}
                  onClick={() =>
                    openDialog({ kind: "renameWallet", walletId: w.id, current: w.name })
                  }
                >
                  {t("wallets.rename")}
                </Button>
                <Button
                  variant="danger"
                  {...locked.props}
                  onClick={() => {
                    if (confirm(t("wallets.deleteWalletConfirm", { name: w.name })))
                      store.deleteWallet(w.id);
                  }}
                >
                  {t("common.delete")}
                </Button>
              </div>
            </div>
          </div>
          {/* A wallet can still end up here by having its last account
              deleted, or from a file written before this. Saying nothing
              would leave it missing from every list with no explanation. */}
          {w.accounts.length === 0 && (
            <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs leading-relaxed text-warning">
              <WarnIcon /> {t("wallets.noAccounts")}
            </p>
          )}
          <ul className="divide-y divide-border-c/50">
            {w.accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                <button
                  className="min-w-0 flex-1 truncate text-left text-sm hover:text-accent"
                  title={t("holdings.openDetail")}
                  onClick={() => onOpenWallet({ walletId: w.id, accountId: a.id })}
                >
                  {a.name}
                  <span className="ml-2 text-xs text-muted">
                    {a.transactions.length} Tx
                  </span>
                </button>
                <HoldingCell holding={holdings.byAccount.get(a.id)!} />
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    {...locked.props}
                    onClick={() =>
                      openDialog({
                        kind: "renameAccount",
                        walletId: w.id,
                        accountId: a.id,
                        current: a.name,
                      })
                    }
                  >
                    {t("wallets.rename")}
                  </Button>
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
            ))}
          </ul>
          <Button
            className="mt-2"
            {...locked.props}
            onClick={() => openDialog({ kind: "addAccount", walletId: w.id })}
          >
            + {t("wallets.addAccount")}
          </Button>
        </Card>
      ))}

      {dialog && (
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
                dialog.kind === "addWallet" || dialog.kind === "renameWallet"
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
