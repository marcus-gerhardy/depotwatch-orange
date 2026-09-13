"use client";

// Closing the assignments that stop short of the network fee (§3.2).
//
// The most destructive-looking button in the ledger, so it behaves like the
// restore does (§6.5): it shows exactly which transactions it would change and
// where the missing BTC would come from, it writes a verified backup first,
// and only then does it touch anything. A repair that silently rewrites lot
// assignments would be indistinguishable from the defect it fixes.

import { useMemo, useState } from "react";
import { useI18n, intlLocale, formatDate } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useReadOnly } from "@/lib/readOnly";
import { formatBtc } from "@/lib/decimal";
import { flattenLedger } from "@/lib/types";
import { planFeeAllocationRepair } from "@/lib/feeAllocation";
import { Amount, Button, Modal } from "./ui";
import { CheckIcon, WarnIcon } from "./icons";

export default function FeeRepairDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const repair = useAppStore((s) => s.repairFeeAllocations);
  const runBackup = useAppStore((s) => s.runBackup);
  const locked = useReadOnly();

  const [busy, setBusy] = useState(false);
  /** What the backup attempt said; null while nothing has been tried. */
  const [backupFailed, setBackupFailed] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const plan = useMemo(
    () => planFeeAllocationRepair(flattenLedger(portfolio.wallets)),
    [portfolio],
  );

  async function apply(skipBackup: boolean) {
    setBusy(true);
    try {
      if (!skipBackup) {
        const result = await runBackup({ manual: true });
        if (!result.ok) {
          // Not an error to swallow: the user asked for a change that rewrites
          // assignments, and the safety net they were promised is not there.
          // They get to decide, with the reason in front of them.
          setBackupFailed(result.error ?? "writeFailed");
          return;
        }
      }
      setDone(repair());
    } finally {
      setBusy(false);
    }
  }

  if (done !== null) {
    return (
      <Modal title={t("feeRepair.title")} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-gain">
            <CheckIcon /> {t("feeRepair.done", { count: done })}
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("feeRepair.title")} onClose={onClose} size="lg" help="tx-fees">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted">{t("feeRepair.intro")}</p>

        {plan.items.length === 0 ? (
          <p className="text-sm text-gain">
            <CheckIcon /> {t("feeRepair.nothingToDo")}
          </p>
        ) : (
          <>
            <div className="max-h-72 overflow-auto rounded-lg border border-border-c">
              <table className="w-full text-xs">
                <thead className="sticky top-0 text-muted">
                  <tr className="border-b border-border-c">
                    <th className="bg-surface-2 px-2 py-1.5 text-left font-normal">
                      {t("tx.date")}
                    </th>
                    <th className="bg-surface-2 px-2 py-1.5 text-left font-normal">
                      {t("tx.wallet")} / {t("tx.account")}
                    </th>
                    <th className="bg-surface-2 px-2 py-1.5 text-right font-normal">
                      {t("feeRepair.missing")}
                    </th>
                    <th className="bg-surface-2 px-2 py-1.5 text-left font-normal">
                      {t("feeRepair.from")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map(({ gap, additions, shortfallBtc }) => (
                    <tr key={gap.entry.id} className="border-b border-border-c/40">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {formatDate(gap.entry.date, loc)}
                        <span className="ml-1.5 text-muted">
                          {t(`tx.types.${gap.entry.type}`)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-muted">
                        {gap.entry.walletName} / {gap.entry.accountName}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">
                        <Amount>{formatBtc(gap.missingBtc, loc)}</Amount>
                      </td>
                      <td className="px-2 py-1.5">
                        {additions.length === 0 ? (
                          <span className="text-warning">
                            <WarnIcon /> {t("feeRepair.noLotLeft")}
                          </span>
                        ) : (
                          <ul>
                            {additions.map((a) => (
                              <li key={a.lotTxId} className="whitespace-nowrap">
                                <span className="text-muted">
                                  {formatDate(a.acquiredDate, loc)}
                                </span>{" "}
                                <Amount className="font-mono">
                                  {formatBtc(a.amountBtc, loc)}
                                </Amount>{" "}
                                <span className="text-muted">
                                  {a.sameLot
                                    ? t("feeRepair.sameLot")
                                    : t("feeRepair.otherLot")}
                                </span>
                              </li>
                            ))}
                            {shortfallBtc.gt(0) && (
                              <li className="whitespace-nowrap text-warning">
                                <WarnIcon />{" "}
                                {t("feeRepair.shortfall", {
                                  amount: formatBtc(shortfallBtc, loc),
                                })}
                              </li>
                            )}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted">
              {t("feeRepair.summary", {
                count: plan.repairableCount,
                amount: formatBtc(plan.totalBtc, loc),
              })}
            </p>
            {plan.incompleteCount > 0 && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                <WarnIcon /> {t("feeRepair.incomplete", { count: plan.incompleteCount })}
              </p>
            )}
          </>
        )}

        {backupFailed !== null && (
          <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <p>{t("feeRepair.backupFailed", { reason: t(`backups.error.${backupFailed}`) })}</p>
            <Button {...locked.props} disabled={busy} onClick={() => void apply(true)}>
              {t("feeRepair.applyAnyway")}
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            {...locked.props}
            disabled={busy || plan.repairableCount === 0 || locked.readOnly}
            onClick={() => void apply(false)}
          >
            {busy ? t("common.loading") : t("feeRepair.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
