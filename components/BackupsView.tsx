"use client";

// The backups view (CLAUDE.md §6.5): what is in the backup folder, and the way
// back from any of it.
//
// Restoring is the most destructive button in the app, so it is the most
// talkative: nothing is replaced before the user has seen both sides of the
// swap — what the open file contains and what the backup contains — and a
// safety copy of the current state is written and verified before anything is
// overwritten. The restore is therefore itself reversible, which is the only
// thing that makes it safe to offer at all.
//
// Metadata is read one file at a time, on request. Decrypting a backup costs
// 600 000 PBKDF2 rounds; doing that for thirty files to fill a table would
// take a minute and tell the user nothing they asked for.

import { useCallback, useEffect, useState } from "react";
import HelpButton from "./help/HelpButton";
import { useI18n, intlLocale, formatDateTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { formatInt } from "@/lib/decimal";
import { backupMetaOf, type BackupEntry, type BackupMeta } from "@/lib/backup";
import { supportsBackupDirectory } from "@/lib/backupStorage";
import { Button, Card, Modal, SectionTitle, inputCls } from "./ui";
import { WarnIcon } from "./icons";

/** Bytes as something readable; a backup is a few kB to a few MB. */
function formatSize(bytes: number, loc: string): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${formatInt(Math.round(bytes / 1024), loc)} kB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface RowState {
  meta?: BackupMeta;
  error?: "password" | "read";
  loading?: boolean;
}

export default function BackupsView({
  embedded = false,
}: {
  /** Rendered inside the settings, which already provide the page heading. */
  embedded?: boolean;
} = {}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const status = useAppStore((s) => s.backupDirStatus);
  const dirName = useAppStore((s) => s.backupDirName);
  const busy = useAppStore((s) => s.backupBusy);
  const connect = useAppStore((s) => s.connectBackupDirectory);
  const grant = useAppStore((s) => s.grantBackupDirectory);
  const forget = useAppStore((s) => s.forgetBackupDirectory);
  const runBackup = useAppStore((s) => s.runBackup);
  const downloadBackup = useAppStore((s) => s.downloadBackup);
  const listBackups = useAppStore((s) => s.listBackups);
  const readBackup = useAppStore((s) => s.readBackup);
  const restoreBackup = useAppStore((s) => s.restoreBackup);
  const lastRun = useAppStore((s) => s.lastBackupRun);

  const [entries, setEntries] = useState<BackupEntry[] | null>(null);
  /** Bumped to re-read the folder after writing or restoring. */
  const [reloadNonce, setReloadNonce] = useState(0);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [password, setPassword] = useState("");
  /** The backup the confirmation dialog is about. */
  const [confirming, setConfirming] = useState<{ entry: BackupEntry; meta: BackupMeta } | null>(
    null,
  );
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const current = backupMetaOf(portfolio, "ok");

  const refresh = useCallback(() => setReloadNonce((n) => n + 1), []);

  useEffect(() => {
    if (status !== "granted") return;
    let cancelled = false;
    void listBackups().then((list) => {
      if (!cancelled) setEntries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [status, listBackups, reloadNonce]);

  async function inspect(entry: BackupEntry): Promise<BackupMeta | null> {
    setRows((r) => ({ ...r, [entry.fileName]: { loading: true } }));
    try {
      const { meta } = await readBackup(entry.fileName, password);
      setRows((r) => ({ ...r, [entry.fileName]: { meta } }));
      return meta;
    } catch {
      setRows((r) => ({ ...r, [entry.fileName]: { error: "password" } }));
      return null;
    }
  }

  async function startRestore(entry: BackupEntry) {
    const meta = rows[entry.fileName]?.meta ?? (await inspect(entry));
    if (meta) setConfirming({ entry, meta });
  }

  async function confirmRestore() {
    if (!confirming) return;
    setRestoring(true);
    setRestoreError(null);
    const result = await restoreBackup(confirming.entry.fileName, password);
    setRestoring(false);
    if (!result.ok) {
      setRestoreError(t(`backups.error.${result.error ?? "writeFailed"}`));
      return;
    }
    setConfirming(null);
    refresh();
  }

  return (
    <div className={embedded ? "space-y-4" : "max-w-4xl space-y-4"}>
      <div>
        {!embedded && (
          <div className="flex items-center gap-2">
            <SectionTitle level={1}>{t("backups.title")}</SectionTitle>
            <HelpButton anchor="backup-folder" label={t("backups.title")} className="mb-3" />
          </div>
        )}
        {/* Embedded in the settings the group already has its heading, so the
            question mark sits with the text it explains instead of alone on a
            line of its own. */}
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          {embedded && (
            <HelpButton
              anchor="backup-folder"
              label={t("backups.title")}
              className="mr-1 align-middle"
            />
          )}
          {t("backups.intro")}
        </p>
      </div>

      {/* Without the File System Access API there is no folder to write to, and
          the app says so instead of implying automatic backups it cannot do. */}
      {!supportsBackupDirectory() ? (
        <Card className="space-y-3">
          <p className="text-sm leading-relaxed text-warning">
            <WarnIcon /> {t("backups.unsupported")}
          </p>
          <Button variant="primary" onClick={() => void downloadBackup()}>
            {t("backups.download")}
          </Button>
        </Card>
      ) : status === "none" ? (
        <Card className="space-y-3">
          <p className="text-sm leading-relaxed">{t("backups.noFolder")}</p>
          <p className="text-xs leading-relaxed text-muted">{t("backups.folderHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void connect()}>
              {t("backups.chooseFolder")}
            </Button>
            <Button onClick={() => void downloadBackup()}>{t("backups.download")}</Button>
          </div>
        </Card>
      ) : (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              {t("backups.folder")}: <span className="font-mono">{dirName}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {status !== "granted" && (
                <Button variant="primary" onClick={() => void grant()}>
                  {t("backups.reconnect")}
                </Button>
              )}
              <Button
                disabled={busy || status !== "granted"}
                onClick={() => void runBackup({ manual: true }).then(refresh)}
              >
                {busy ? t("backups.running") : t("backups.backupNow")}
              </Button>
              <Button variant="ghost" onClick={() => void connect()}>
                {t("backups.changeFolder")}
              </Button>
              <Button variant="ghost" onClick={() => void forget()}>
                {t("backups.forgetFolder")}
              </Button>
            </div>
          </div>
          {status !== "granted" && (
            <p className="text-xs leading-relaxed text-warning">
              {t("backups.permissionNeeded")}
            </p>
          )}
          {lastRun && (
            <p
              className={`text-xs leading-relaxed ${lastRun.ok ? "text-gain" : "text-loss"}`}
            >
              {lastRun.ok ? (
                t("backups.lastOk", {
                  name: lastRun.fileName ?? "",
                  pruned: lastRun.pruned ?? 0,
                })
              ) : (
                <>
                  <WarnIcon /> {t(`backups.error.${lastRun.error ?? "writeFailed"}`)}
                </>
              )}
            </p>
          )}
        </Card>
      )}

      {status === "granted" && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1">
              <span className="mb-1 block text-xs text-muted">
                {t("backups.password")}
              </span>
              <input
                type="password"
                className={inputCls}
                autoComplete="current-password"
                placeholder={t("backups.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs leading-relaxed text-muted">{t("backups.passwordHint")}</p>

          {entries === null ? (
            <p className="text-sm text-muted">{t("common.loading")}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted">{t("backups.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-c text-left text-xs text-muted">
                    <th className="py-1.5 pr-3 font-normal">{t("backups.when")}</th>
                    <th className="py-1.5 pr-3 font-normal">{t("backups.size")}</th>
                    <th className="py-1.5 pr-3 font-normal">{t("backups.contents")}</th>
                    <th className="py-1.5 text-right font-normal">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const row = rows[e.fileName] ?? {};
                    return (
                      <tr key={e.fileName} className="border-b border-border-c/40 last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatDateTime(e.time, loc)}
                          <span className="block font-mono text-[0.65rem] text-muted">
                            {e.fileName}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                          {formatSize(e.sizeBytes, loc)}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {row.loading ? (
                            <span className="text-muted">{t("common.loading")}</span>
                          ) : row.error ? (
                            <span className="text-loss">{t("backups.error.wrongPassword")}</span>
                          ) : row.meta ? (
                            <>
                              <span>
                                {t("backups.transactions", {
                                  count: formatInt(row.meta.transactionCount, loc),
                                })}
                              </span>
                              <span className="block text-muted">
                                {row.meta.lastTransactionDate
                                  ? t("backups.lastTransaction", {
                                      date: formatDateTime(row.meta.lastTransactionDate, loc),
                                    })
                                  : t("backups.noTransactions")}
                              </span>
                              {row.meta.integrity === "mismatch" && (
                                <span className="block text-loss">
                                  <WarnIcon /> {t("backups.integrityMismatch")}
                                </span>
                              )}
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              disabled={password === ""}
                              onClick={() => void inspect(e)}
                            >
                              {t("backups.inspect")}
                            </Button>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            disabled={password === ""}
                            onClick={() => void startRestore(e)}
                          >
                            {t("backups.restore")}
                          </Button>
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

      {confirming && (
        <Modal title={t("backups.confirmTitle")} onClose={() => setConfirming(null)} size="lg">
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">{t("backups.confirmBody")}</p>
            {/* Both sides of the swap, side by side: what goes and what comes. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-loss/40 p-3">
                <p className="text-xs tracking-wider text-muted uppercase">
                  {t("backups.currentFile")}
                </p>
                <p className="mt-1 text-sm">
                  {t("backups.transactions", {
                    count: formatInt(current.transactionCount, loc),
                  })}
                </p>
                <p className="text-xs text-muted">
                  {current.lastTransactionDate
                    ? t("backups.lastTransaction", {
                        date: formatDateTime(current.lastTransactionDate, loc),
                      })
                    : t("backups.noTransactions")}
                </p>
              </div>
              <div className="rounded-lg border border-gain/40 p-3">
                <p className="text-xs tracking-wider text-muted uppercase">
                  {t("backups.theBackup")}
                </p>
                <p className="mt-1 text-sm">
                  {t("backups.transactions", {
                    count: formatInt(confirming.meta.transactionCount, loc),
                  })}
                </p>
                <p className="text-xs text-muted">
                  {confirming.meta.lastTransactionDate
                    ? t("backups.lastTransaction", {
                        date: formatDateTime(confirming.meta.lastTransactionDate, loc),
                      })
                    : t("backups.noTransactions")}
                </p>
                <p className="mt-1 font-mono text-[0.65rem] text-muted">
                  {confirming.entry.fileName}
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted">{t("backups.safetyNote")}</p>
            {restoreError && <p className="text-sm text-loss">{restoreError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="dangerSolid" disabled={restoring} onClick={confirmRestore}>
                {restoring ? t("backups.restoring") : t("backups.restoreConfirm")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
