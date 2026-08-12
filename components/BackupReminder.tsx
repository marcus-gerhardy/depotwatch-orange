"use client";

// "Your last backup is a while ago" (CLAUDE.md §6.5).
//
// One line above the dashboard, dismissible, and deliberately not a modal: a
// dialog that blocks the app until it is answered teaches people to click it
// away without reading, which is the opposite of what a reminder is for. It
// also stays quiet for a portfolio that has never been saved anywhere — that
// file has a different problem, and the file-setup step is already asking
// about it.
//
// Dismissal is session state, not a file setting: the reminder is about a
// condition that is still true tomorrow, so waving it away silences it now and
// not for good.

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useNowDate } from "@/lib/clock";
import {
  DEFAULT_BACKUP_SETTINGS,
  backupReminderDue,
  daysSinceBackup,
} from "@/lib/backup";

export default function BackupReminder({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio);
  const fileName = useAppStore((s) => s.fileName);
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);
  const now = useNowDate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || now === null || !portfolio) return null;
  const settings = portfolio.settings.backup ?? DEFAULT_BACKUP_SETTINGS;
  const hasEverSaved = fileName !== null || lastSavedAt !== null;
  if (!backupReminderDue(portfolio.backupState, settings, hasEverSaved, now)) return null;

  const days = daysSinceBackup(portfolio.backupState, now);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
      <span>
        {days === null
          ? t("backups.reminderNever")
          : t("backups.reminderDays", { days })}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="text-accent underline decoration-dotted"
      >
        {t("backups.openView")}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-auto rounded-md px-1 text-muted hover:text-foreground"
        aria-label={t("common.close")}
        title={t("common.close")}
      >
        ✕
      </button>
    </div>
  );
}
