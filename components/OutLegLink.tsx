"use client";

import { useMemo, useState } from "react";
import { useI18n, intlLocale, formatDate, formatDateTime } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { dec, formatBtc } from "@/lib/decimal";
import {
  amountDifference,
  linkTransferLegs,
  rankOutLegCandidates,
  unlinkTransferLeg,
  type CandidateFilter,
  type OutLegCandidate,
} from "@/lib/transferLink";
import { flattenLedger, type LedgerEntry } from "@/lib/types";
import { Amount, Button, Field, Modal, inputCls, stopEnterSubmit } from "./ui";
import ProvenanceList from "./ProvenanceList";

/**
 * The link between an arrival and the outgoing leg it belongs to
 * (`transferGroupId`, CLAUDE.md §3.2) — shown, removable, and assignable.
 *
 * Unlike the lot allocations next to it, this is not a field of the edited
 * transaction: it lives on *both* legs at once, so it is applied to the
 * portfolio immediately instead of waiting for the form's save. Removing it
 * always clears both sides, so no leg is left pointing at a group that pairs it
 * with nothing.
 */
export default function OutLegLink({
  entry,
  entries,
  holdingPeriodDays,
  onJump,
  onCreateFromLots,
}: {
  /** The transfer_in being edited. */
  entry: LedgerEntry;
  entries: LedgerEntry[];
  holdingPeriodDays: number;
  onJump?: (txId: string) => void;
  /** Fallback when nothing exists to link: build an out-leg from source lots. */
  onCreateFromLots?: () => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const update = useAppStore((s) => s.update);
  const [picking, setPicking] = useState(false);

  const linked = useMemo(
    () =>
      entry.transferGroupId
        ? (entries.find(
            (e) => e.type === "transfer_out" && e.transferGroupId === entry.transferGroupId,
          ) ?? null)
        : null,
    [entries, entry.transferGroupId],
  );

  return (
    <div className="space-y-2">
      {linked ? (
        <>
          <dl className="space-y-1 rounded-lg border border-border-c bg-surface-2/40 p-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("tx.wallet")} / {t("tx.account")}</dt>
              <dd>
                {linked.walletName} / {linked.accountName}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("tx.date")}</dt>
              <dd>{formatDateTime(linked.date, loc)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("tx.amountBtc")}</dt>
              <dd className="font-mono">
                <Amount>{formatBtc(linked.amountBtc, loc)}</Amount>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("tx.txid")}</dt>
              <dd className="font-mono break-all">{linked.txid ?? "—"}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => update((p) => unlinkTransferLeg(p, entry.id))}>
              {t("tx.outLeg.unlink")}
            </Button>
            {onJump && (
              <Button variant="ghost" onClick={() => onJump(linked.id)}>
                {t("tx.transferredJump")}
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">{t("tx.outLeg.none")}</p>
          <Button variant="primary" onClick={() => setPicking(true)}>
            {t("tx.outLeg.assign")}
          </Button>
        </>
      )}

      {picking && (
        <OutLegPicker
          entry={entry}
          entries={entries}
          holdingPeriodDays={holdingPeriodDays}
          onClose={() => setPicking(false)}
          onCreateFromLots={onCreateFromLots}
        />
      )}
    </div>
  );
}

/**
 * The same link seen from the outgoing leg: which arrival(s) this send is
 * paired with. Read-only on purpose — the pairing is edited on the arrival,
 * where the candidate list and the amount check live — but it has to be
 * *visible* here, otherwise "did this transfer ever arrive anywhere?" is a
 * question the dialog cannot answer.
 */
export function LinkedInLegs({
  entry,
  entries,
  onJump,
}: {
  /** The transfer_out being edited. */
  entry: LedgerEntry;
  entries: LedgerEntry[];
  onJump?: (txId: string) => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);

  const legs = entry.transferGroupId
    ? entries.filter(
        (e) => e.type === "transfer_in" && e.transferGroupId === entry.transferGroupId,
      )
    : [];

  if (legs.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted">{t("tx.outLeg.inLegNone")}</p>
        <p className="text-xs leading-relaxed text-muted">{t("tx.outLeg.inLegHowTo")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {legs.map((l) => (
        <li
          key={l.id}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border-c bg-surface-2/40 p-2 text-xs"
        >
          <span className="whitespace-nowrap">{formatDateTime(l.date, loc)}</span>
          <span className="truncate text-muted">
            {l.walletName} / {l.accountName}
          </span>
          <span className="ml-auto font-mono whitespace-nowrap">
            <Amount>{formatBtc(l.amountBtc, loc)}</Amount>
          </span>
          {onJump && (
            <Button variant="ghost" onClick={() => onJump(l.id)}>
              {t("tx.transferredJump")}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The picker on its own, so the transaction table can open it straight from an
 * arrival's "origin not assigned" hint without going through the edit dialog.
 */
export function OutLegPicker({
  entry,
  entries,
  holdingPeriodDays,
  onClose,
  onCreateFromLots,
}: {
  entry: LedgerEntry;
  entries: LedgerEntry[];
  holdingPeriodDays: number;
  onClose: () => void;
  onCreateFromLots?: () => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const update = useAppStore((s) => s.update);

  const [filter, setFilter] = useState<CandidateFilter>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "score",
    desc: false,
  });
  const [selectedId, setSelectedId] = useState("");
  const [adoptFee, setAdoptFee] = useState(true);

  const candidates = useMemo(
    () => rankOutLegCandidates(entry, entries, filter),
    [entry, entries, filter],
  );
  // The ranking's own winner keeps its badge no matter how the table is sorted.
  const bestId = candidates[0]?.entry.id;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dir = sort.desc ? -1 : 1;
    return candidates
      .filter(
        (c) =>
          q === "" ||
          [
            c.entry.walletName,
            c.entry.accountName,
            c.entry.txid ?? "",
            c.entry.note ?? "",
            c.entry.date,
            c.entry.amountBtc,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => {
        switch (sort.key) {
          case "date":
            return dir * a.entry.date.localeCompare(b.entry.date);
          case "amount":
            return dir * dec(a.entry.amountBtc).comparedTo(dec(b.entry.amountBtc));
          default:
            return dir * (a.score - b.score);
        }
      });
  }, [candidates, query, sort]);

  const selected = candidates.find((c) => c.entry.id === selectedId) ?? null;
  const diff = selected ? amountDifference(selected.entry, entry) : null;

  const filterWallet = portfolio.wallets.find((w) => w.id === filter.walletId);

  /**
   * What the origin list would say once this candidate is linked. Resolution
   * reads the ledger, so the preview is the real thing computed on a ledger
   * that has the link — no second implementation to keep in sync.
   */
  const preview = useMemo(() => {
    if (!selectedId) return null;
    // Keyed on the id, not on the candidate object: the candidate list is
    // rebuilt whenever a filter changes, which would otherwise recompute this.
    const linked = linkTransferLegs(portfolio, entry.id, selectedId, {
      adoptFeeBtc: adoptFee,
    });
    const next = flattenLedger(linked.wallets);
    return {
      entries: next,
      entry: next.find((e) => e.id === entry.id)!,
    };
  }, [portfolio, entry.id, selectedId, adoptFee]);

  function assign() {
    if (!selected) return;
    update((p) =>
      linkTransferLegs(p, entry.id, selected.entry.id, { adoptFeeBtc: adoptFee }),
    );
    onClose();
  }

  return (
    <Modal title={t("tx.outLeg.pickTitle")} onClose={onClose} wide help="transfer-link">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted">{t("tx.outLeg.pickIntro")}</p>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Field label={t("tx.lotPicker.search")}>
            <input
              className={inputCls}
              value={query}
              placeholder={t("tx.outLeg.searchPlaceholder")}
              onKeyDown={stopEnterSubmit}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <Field label={t("tx.wallet")}>
            <select
              className={inputCls}
              value={filter.walletId ?? ""}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  walletId: e.target.value || undefined,
                  accountId: undefined,
                }))
              }
            >
              <option value="">{t("tx.filterAll")}</option>
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
              value={filter.accountId ?? ""}
              disabled={!filterWallet}
              onChange={(e) =>
                setFilter((f) => ({ ...f, accountId: e.target.value || undefined }))
              }
            >
              <option value="">{t("tx.filterAll")}</option>
              {filterWallet?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`${t("tx.outLeg.filterPeriod")} ${t("tx.filterFrom")}`}>
            <input
              type="date"
              className={inputCls}
              value={filter.from ?? ""}
              onKeyDown={stopEnterSubmit}
              onChange={(e) =>
                setFilter((f) => ({ ...f, from: e.target.value || undefined }))
              }
            />
          </Field>
          <Field label={`${t("tx.outLeg.filterPeriod")} ${t("tx.filterTo")}`}>
            <input
              type="date"
              className={inputCls}
              value={filter.to ?? ""}
              onKeyDown={stopEnterSubmit}
              onChange={(e) =>
                setFilter((f) => ({ ...f, to: e.target.value || undefined }))
              }
            />
          </Field>
        </div>

        {/* One send can arrive in several pieces, and a wrong pairing has to be
            findable at all — so the already-paired out-legs are one click away
            instead of silently missing from the list. */}
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-accent"
            checked={filter.includePaired === true}
            onChange={(e) => {
              setFilter((f) => ({ ...f, includePaired: e.target.checked || undefined }));
              setSelectedId("");
            }}
          />
          <span>{t("tx.outLeg.includePaired")}</span>
        </label>

        {candidates.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">{t("tx.outLeg.pickEmpty")}</p>
            {onCreateFromLots && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  onCreateFromLots();
                }}
              >
                {t("tx.outLeg.pickEmptyCreate")}
              </Button>
            )}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted">{t("tx.lotPicker.noMatch")}</p>
        ) : (
          <div className="max-h-64 overflow-auto rounded-lg border border-border-c">
            <table className="w-full text-xs">
              {/* The background sits on the cells, not here: a sticky row is
                  painted cell by cell, so a background on the row itself is
                  never drawn and the table scrolls through the header. */}
              <thead className="sticky top-0 text-muted">
                <tr className="border-b border-border-c">
                  <th className="w-8 bg-surface-2 py-1.5 pl-2" />
                  <SortHeader
                    label={t("tx.date")}
                    active={sort.key === "date"}
                    desc={sort.desc}
                    onClick={() => setSort(nextSort(sort, "date"))}
                  />
                  <th className="bg-surface-2 py-1.5 pr-2 text-left font-normal">
                    {t("tx.wallet")} / {t("tx.account")}
                  </th>
                  <SortHeader
                    label={t("tx.amountBtc")}
                    right
                    active={sort.key === "amount"}
                    desc={sort.desc}
                    onClick={() => setSort(nextSort(sort, "amount"))}
                  />
                  <SortHeader
                    label={t("tx.outLeg.colMatch")}
                    right
                    active={sort.key === "score"}
                    desc={sort.desc}
                    onClick={() => setSort(nextSort(sort, "score"))}
                  />
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <CandidateRow
                    key={c.entry.id}
                    candidate={c}
                    best={c.entry.id === bestId}
                    selected={c.entry.id === selectedId}
                    loc={loc}
                    onSelect={() => setSelectedId(c.entry.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected && selected.linkedInLegs.length > 0 && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            ⚠{" "}
            {t("tx.outLeg.joinsGroup", {
              legs: selected.linkedInLegs
                .map(
                  (l) =>
                    `${l.walletName} / ${l.accountName} (${formatDate(l.date, loc)}, ${formatBtc(l.amountBtc, loc)} BTC)`,
                )
                .join(", "),
            })}
          </p>
        )}

        {selected && diff && (
          <div className="space-y-2 rounded-lg border border-border-c/60 p-3">
            <h4 className="text-xs font-medium">{t("tx.outLeg.diffTitle")}</h4>
            {diff.diffBtc.isZero() ? (
              <p className="text-xs text-muted">{t("tx.outLeg.diffNone")}</p>
            ) : diff.diffBtc.lt(0) ? (
              <p className="text-xs text-loss">
                ⚠{" "}
                {t("tx.outLeg.diffNegative", {
                  amount: formatBtc(diff.diffBtc.abs(), loc),
                })}
              </p>
            ) : diff.implausible ? (
              <p className="text-xs text-loss">
                ⚠{" "}
                {t("tx.outLeg.diffTooLarge", {
                  amount: formatBtc(diff.diffBtc, loc),
                  percent: `${(diff.ratio * 100).toFixed(1)} %`,
                })}
              </p>
            ) : (
              <p className="text-xs text-muted">
                {t("tx.outLeg.diffFee", {
                  amount: formatBtc(diff.diffBtc, loc),
                  percent: `${(diff.ratio * 100).toFixed(2)} %`,
                })}
              </p>
            )}
            {/* Not offered when joining an existing pairing: the difference to
                *this* arrival is not the transfer's fee, and rewriting the
                amount would falsify the arrival that is already there. */}
            {diff.diffBtc.gt(0) && selected.linkedInLegs.length === 0 && (
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-accent"
                  checked={adoptFee}
                  onChange={(e) => setAdoptFee(e.target.checked)}
                />
                <span>{t("tx.outLeg.diffAdopt")}</span>
              </label>
            )}
          </div>
        )}

        {selected && preview && (
          <div className="space-y-2 rounded-lg border border-border-c/60 p-3">
            <h4 className="text-xs font-medium">{t("tx.outLeg.previewTitle")}</h4>
            <ProvenanceList
              entry={preview.entry}
              entries={preview.entries}
              holdingPeriodDays={holdingPeriodDays}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!selected} onClick={assign}>
            {t("tx.outLeg.confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

type SortKey = "score" | "date" | "amount";

function nextSort(
  current: { key: SortKey; desc: boolean },
  key: SortKey,
): { key: SortKey; desc: boolean } {
  // A new column starts where it is most useful: newest date and largest
  // amount first, but the ranking ascending — there the best match is lowest.
  return current.key === key
    ? { key, desc: !current.desc }
    : { key, desc: key !== "score" };
}

function SortHeader({
  label,
  active,
  desc,
  right = false,
  onClick,
}: {
  label: string;
  active: boolean;
  desc: boolean;
  right?: boolean;
  onClick: () => void;
}) {
  return (
    <th
      className={`bg-surface-2 py-1.5 pr-2 font-normal ${
        right ? "text-right" : "text-left"
      }`}
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={onClick}
      >
        {label}
        <span aria-hidden className={active ? "" : "opacity-0"}>
          {desc ? "▾" : "▴"}
        </span>
      </button>
    </th>
  );
}

function CandidateRow({
  candidate,
  best,
  selected,
  loc,
  onSelect,
}: {
  candidate: OutLegCandidate;
  best: boolean;
  selected: boolean;
  loc: string;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const e = candidate.entry;

  return (
    <tr
      className={`cursor-pointer border-b border-border-c/40 ${
        selected ? "bg-accent/10" : "hover:bg-surface-2/60"
      }`}
      onClick={onSelect}
    >
      <td className="py-1.5 pl-2">
        <input
          type="radio"
          name="outLegCandidate"
          className="accent-accent"
          aria-label={t("tx.outLeg.pickAria", { date: formatDate(e.date, loc) })}
          checked={selected}
          onChange={onSelect}
        />
      </td>
      <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(e.date, loc)}</td>
      <td className="py-1.5 pr-2 text-muted">
        {e.walletName} / {e.accountName}
      </td>
      <td className="py-1.5 pr-2 text-right font-mono whitespace-nowrap">
        <Amount>{formatBtc(e.amountBtc, loc)}</Amount>
      </td>
      <td className="py-1.5 pr-2 text-right whitespace-nowrap">
        {candidate.linkedInLegs.length > 0 ? (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
            {t("tx.outLeg.alreadyPaired")}
          </span>
        ) : candidate.txidMatch ? (
          <span className="rounded-full bg-gain/15 px-2 py-0.5 text-[10px] text-gain">
            {t("tx.outLeg.txidMatch")}
          </span>
        ) : best ? (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
            {t("tx.outLeg.bestMatch")}
          </span>
        ) : (
          <span className="text-[0.65rem] text-muted">
            {t("tx.outLeg.dayDiff", { days: candidate.dayDiff })}
          </span>
        )}
      </td>
    </tr>
  );
}
