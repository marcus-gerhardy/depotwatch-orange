"use client";

// The list of past CSV imports, and undoing one (CLAUDE.md §3.4).
//
// Undoing is deliberately not a single button that empties a batch: a
// transaction an import wrote becomes an ordinary transaction the moment it
// exists, and a later sale may allocate it as a lot or a transfer may be
// linked to it. Those references live on *other* transactions, so removing the
// batch would leave them pointing at nothing. `analyzeBatchRemoval` says what
// would break, this view names it, and what cannot go stays.

import { useState } from "react";
import { useI18n, intlLocale, formatDateTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { formatBtc } from "@/lib/decimal";
import {
  analyzeBatchRemoval,
  sortedBatches,
  type BatchRemoval,
} from "@/lib/importBatches";
import { Button, Card, Modal, SectionTitle } from "./ui";
import { WarnIcon } from "./icons";

export default function ImportBatches() {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const undoImportBatch = useAppStore((s) => s.undoImportBatch);
  const [confirming, setConfirming] = useState<BatchRemoval | null>(null);

  const batches = sortedBatches(portfolio);
  if (batches.length === 0) return null;

  return (
    <Card className="space-y-3">
      <SectionTitle level={2}>{t("imports.title")}</SectionTitle>
      <p className="text-xs leading-relaxed text-muted">{t("imports.intro")}</p>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 font-normal">{t("imports.date")}</th>
            <th className="py-1 font-normal">{t("imports.file")}</th>
            <th className="py-1 font-normal">{t("imports.preset")}</th>
            <th className="py-1 text-right font-normal">{t("imports.count")}</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-t border-border-c/40">
              <td className="py-1.5 whitespace-nowrap">
                {formatDateTime(b.importedAt, loc)}
              </td>
              <td className="max-w-40 truncate py-1.5" title={b.fileName}>
                {b.fileName}
              </td>
              <td className="py-1.5 text-muted">
                {b.presetName ?? t("imports.manualPreset")}
              </td>
              <td className="py-1.5 text-right font-mono">{b.transactionCount}</td>
              <td className="py-1.5 text-right">
                <Button
                  variant="ghost"
                  className="px-2 py-0.5 text-xs"
                  onClick={() => setConfirming(analyzeBatchRemoval(portfolio, b.id))}
                >
                  {t("imports.undo")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {confirming && (
        <Modal title={t("imports.undoTitle")} onClose={() => setConfirming(null)}>
          <div className="space-y-3 text-sm">
            <p>
              {t("imports.undoIntro", {
                file: confirming.batch?.fileName ?? "",
                count: confirming.transactionIds.length,
              })}
            </p>

            {confirming.blockers.length > 0 && (
              <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3">
                <p className="text-xs leading-relaxed text-warning">
                  <WarnIcon /> {t("imports.blockedIntro", { count: confirming.blockers.length })}
                </p>
                <ul className="space-y-1 text-xs">
                  {confirming.blockers.map((b) => (
                    <li key={`${b.transactionId}-${b.reason}`} className="flex gap-2">
                      <span className="font-mono whitespace-nowrap text-muted">
                        {formatDateTime(b.date, loc)}
                      </span>
                      <span className="font-mono">{formatBtc(b.amountBtc, loc)}</span>
                      <span className="text-muted">
                        {t(`imports.blocked.${b.reason}`)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs leading-relaxed text-muted">
                  {t("imports.blockedHint", {
                    count: confirming.removableIds.length,
                  })}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={confirming.removableIds.length === 0}
                onClick={() => {
                  undoImportBatch(confirming.batch!.id, confirming.removableIds);
                  setConfirming(null);
                }}
              >
                {t("imports.undoConfirm", { count: confirming.removableIds.length })}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}
