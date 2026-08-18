"use client";

// The file changed behind our back (CLAUDE.md §6.8).
//
// This is the one dialog in the app that is allowed to block: it stands
// between two versions of somebody's portfolio, and whichever way it is
// answered, something is at stake. So it names both sides — how many
// transactions each holds and how recent each is — rather than asking an
// abstract question about "conflicts", and every option says plainly what it
// costs. Nothing here happens on its own: the save that triggered it has
// already been refused.

import { useState } from "react";
import { useI18n, intlLocale, formatDateTime } from "@/lib/i18n";
import { useAppStore, type FileConflictChoice } from "@/lib/store";
import { flattenLedger, type PortfolioFile } from "@/lib/types";
import { Button, Modal } from "./ui";
import { WarnIcon } from "./icons";

/** How big a version is, in the only terms that mean anything here. */
function summarize(p: PortfolioFile | null): { count: number; last: string | null } {
  if (!p) return { count: 0, last: null };
  const entries = flattenLedger(p.wallets);
  const last = entries.reduce<string | null>(
    (latest, e) => (latest === null || e.date > latest ? e.date : latest),
    null,
  );
  return { count: entries.length, last };
}

export default function FileConflictDialog() {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const conflict = useAppStore((s) => s.fileConflict);
  const resolve = useAppStore((s) => s.resolveFileConflict);
  const dismiss = useAppStore((s) => s.dismissFileConflict);
  const portfolio = useAppStore((s) => s.portfolio);
  const [busy, setBusy] = useState<FileConflictChoice | null>(null);

  if (!conflict) return null;

  const mine = summarize(portfolio);
  const theirs = summarize(conflict.external);
  const readable = conflict.external !== null;

  const run = (choice: FileConflictChoice) => {
    setBusy(choice);
    void resolve(choice).finally(() => setBusy(null));
  };

  const side = (
    title: string,
    s: { count: number; last: string | null },
    when: string | null,
  ) => (
    <div className="rounded-lg border border-border-c bg-surface-2/40 p-3">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t("conflict.transactions")}</dt>
          <dd className="font-mono">{s.count}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t("conflict.lastTransaction")}</dt>
          <dd className="font-mono">{s.last ? formatDateTime(s.last, loc) : "—"}</dd>
        </div>
        {when && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t("conflict.modified")}</dt>
            <dd className="font-mono">{when}</dd>
          </div>
        )}
      </dl>
    </div>
  );

  return (
    <Modal title={t("conflict.title")} onClose={dismiss} size="lg">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed">{t("conflict.intro")}</p>
        <p className="font-mono text-xs text-muted">{conflict.fileName}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {side(t("conflict.mine"), mine, null)}
          {readable ? (
            side(
              t("conflict.theirs"),
              theirs,
              formatDateTime(conflict.externalModified, loc),
            )
          ) : (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs leading-relaxed text-warning">
              <WarnIcon />{" "}
              {t(
                conflict.externalError === "wrongPassword"
                  ? "conflict.theirsWrongPassword"
                  : "conflict.theirsUnreadable",
              )}
            </div>
          )}
        </div>

        {/* Every option says what it costs, and both destructive ones write a
            backup of exactly the side they are about to lose. */}
        <div className="space-y-2">
          {readable && (
            <Button
              className="w-full justify-start text-left"
              disabled={busy !== null}
              onClick={() => run("loadExternal")}
            >
              <span className="block">
                <span className="block font-semibold">{t("conflict.loadExternal")}</span>
                <span className="block text-xs text-muted">
                  {t("conflict.loadExternalHint")}
                </span>
              </span>
            </Button>
          )}
          <Button
            className="w-full justify-start text-left"
            disabled={busy !== null}
            onClick={() => run("saveAs")}
          >
            <span className="block">
              <span className="block font-semibold">{t("conflict.saveAs")}</span>
              <span className="block text-xs text-muted">{t("conflict.saveAsHint")}</span>
            </span>
          </Button>
          <Button
            variant="danger"
            className="w-full justify-start text-left"
            disabled={busy !== null}
            onClick={() => run("overwrite")}
          >
            <span className="block">
              <span className="block font-semibold">{t("conflict.overwrite")}</span>
              <span className="block text-xs opacity-80">{t("conflict.overwriteHint")}</span>
            </span>
          </Button>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" disabled={busy !== null} onClick={dismiss}>
            {t("conflict.later")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
