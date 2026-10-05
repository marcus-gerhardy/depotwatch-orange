"use client";

// Rewriting calendar dates an earlier version stored as instants
// (lib/calendarDateRepair.ts, docs/dates.md).
//
// Behaves like the fee repair (§3.2): it shows every value it would change —
// as stored, as shown so far, and as it would become — writes a verified
// backup first, and only then touches the file. Transaction timestamps are
// not part of it.

import { useMemo, useState } from "react";
import { useI18n, intlLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useReadOnly } from "@/lib/readOnly";
import { formatCalendarDate } from "@/lib/dates";
import { findCalendarDateIssues } from "@/lib/calendarDateRepair";
import { Button, Modal } from "./ui";
import { CheckIcon, WarnIcon } from "./icons";

export default function CalendarDateRepairDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const repair = useAppStore((s) => s.repairCalendarDates);
  const runBackup = useAppStore((s) => s.runBackup);
  const locked = useReadOnly();

  const [busy, setBusy] = useState(false);
  const [backupFailed, setBackupFailed] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const issues = useMemo(() => findCalendarDateIssues(portfolio), [portfolio]);

  async function apply(skipBackup: boolean) {
    setBusy(true);
    try {
      if (!skipBackup) {
        const result = await runBackup({ manual: true });
        if (!result.ok) {
          setBackupFailed(result.error ?? "writeFailed");
          return;
        }
      }
      // Exactly what was previewed; the store skips any value that changed since.
      setDone(repair(issues));
    } finally {
      setBusy(false);
    }
  }

  if (done !== null) {
    return (
      <Modal title={t("calendarRepair.title")} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-gain">
            <CheckIcon /> {t("calendarRepair.done", { count: done })}
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
    <Modal title={t("calendarRepair.title")} onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted">{t("calendarRepair.intro")}</p>

        {issues.length === 0 ? (
          <p className="text-sm text-gain">
            <CheckIcon /> {t("calendarRepair.nothingToDo")}
          </p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-lg border border-border-c">
            <table className="w-full text-xs">
              <thead className="sticky top-0 text-muted">
                <tr className="border-b border-border-c">
                  <th className="bg-surface-2 px-2 py-1.5 text-left font-normal">
                    {t("calendarRepair.field")}
                  </th>
                  <th className="bg-surface-2 px-2 py-1.5 text-left font-normal">
                    {t("calendarRepair.stored")}
                  </th>
                  <th className="bg-surface-2 px-2 py-1.5 text-left font-normal">
                    {t("calendarRepair.shownBefore")}
                  </th>
                  <th className="bg-surface-2 px-2 py-1.5 text-left font-normal">
                    {t("calendarRepair.corrected")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr
                    key={`${issue.field}|${issue.walletId ?? ""}`}
                    className="border-b border-border-c/40"
                  >
                    <td className="px-2 py-1.5">
                      {t(`calendarRepair.fields.${issue.field}`)}
                      {issue.walletName && (
                        <span className="ml-1.5 text-muted">{issue.walletName}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-muted">{issue.stored}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {formatCalendarDate(issue.shownBefore, loc)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap font-medium">
                      {formatCalendarDate(issue.corrected, loc)}
                      {issue.shifted ? (
                        <span className="ml-1.5 text-warning">
                          <WarnIcon /> {t("calendarRepair.shifted")}
                        </span>
                      ) : (
                        <span className="ml-1.5 text-muted">
                          {t("calendarRepair.formatOnly")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {issues.length > 0 && (
          <p className="text-xs leading-relaxed text-muted">{t("calendarRepair.assumption")}</p>
        )}

        {backupFailed !== null && (
          <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <p>
              {t("calendarRepair.backupFailed", {
                reason: t(`backups.error.${backupFailed}`),
              })}
            </p>
            <Button {...locked.props} disabled={busy} onClick={() => void apply(true)}>
              {t("calendarRepair.applyAnyway")}
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
            disabled={busy || issues.length === 0 || locked.readOnly}
            onClick={() => void apply(false)}
          >
            {busy ? t("common.loading") : t("calendarRepair.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
