"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HelpButton from "./help/HelpButton";
import { useI18n, intlLocale } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { WatchedAddress, WatchedAddressType } from "@/lib/types";
import {
  fetchAddressStats,
  fetchAddressTxs,
  fetchAddressUtxos,
  fetchFeeEstimates,
  type AddressStats,
  type AddressTx,
  type Utxo,
} from "@/lib/esplora";
import {
  analyzeAddress,
  consolidationAdvice,
  detectAddressFormat,
  type AddressAnalysis,
  type FindingSeverity,
} from "@/lib/security";
import { formatBtc, formatInt } from "@/lib/decimal";
import { dec } from "@/lib/decimal";
import { Amount, Button, Card, Field, Modal, SectionTitle, inputCls } from "./ui";

function detectEntryType(value: string): WatchedAddressType | null {
  const v = value.trim();
  if (/^xpub[1-9A-HJ-NP-Za-km-z]{79,120}$/.test(v)) return "xpub";
  if (/^ypub[1-9A-HJ-NP-Za-km-z]{79,120}$/.test(v)) return "ypub";
  if (/^zpub[1-9A-HJ-NP-Za-km-z]{79,120}$/.test(v)) return "zpub";
  if (detectAddressFormat(v) !== "unknown") return "address";
  return null;
}

const SEVERITY_STYLE: Record<FindingSeverity, string> = {
  info: "border-border-c text-muted",
  warning: "border-warning/40 text-warning",
  danger: "border-loss/40 text-loss",
};

export default function WatchlistView({
  /** Open the add form right away (a dashboard widget asked for it). */
  initialAdd = false,
}: {
  initialAdd?: boolean;
} = {}) {
  const { t } = useI18n();
  const portfolio = useAppStore((s) => s.portfolio)!;
  const addWatchedAddress = useAppStore((s) => s.addWatchedAddress);
  const deleteWatchedAddress = useAppStore((s) => s.deleteWatchedAddress);

  const [showAdd, setShowAdd] = useState(initialAdd);
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);

  const detectedType = detectEntryType(value);

  function submit() {
    const ty = detectEntryType(value);
    if (!ty) {
      setError(t("watchlist.invalidValue"));
      return;
    }
    addWatchedAddress({
      id: crypto.randomUUID(),
      type: ty,
      value: value.trim(),
      label: label.trim() || value.trim().slice(0, 12) + "…",
      tags: tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setShowAdd(false);
    setValue("");
    setLabel("");
    setTags("");
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SectionTitle level={1}>{t("watchlist.title")}</SectionTitle>
          <HelpButton anchor="watch-concept" label={t("watchlist.title")} className="mb-3" />
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          + {t("watchlist.add")}
        </Button>
      </div>
      <p className="text-xs text-muted">{t("watchlist.subtitle")}</p>

      {portfolio.watchedAddresses.length === 0 && (
        <Card className="space-y-3 text-center">
          <p className="text-sm text-muted">{t("watchlist.empty")}</p>
          <Button variant="primary" onClick={() => setShowAdd(true)}>
            + {t("watchlist.add")}
          </Button>
        </Card>
      )}

      {portfolio.watchedAddresses.map((a) => (
        <WatchedEntryCard
          key={a.id}
          entry={a}
          onDelete={() => {
            if (confirm(t("watchlist.deleteConfirm", { label: a.label })))
              deleteWatchedAddress(a.id);
          }}
        />
      ))}

      {showAdd && (
        <Modal title={t("watchlist.add")} onClose={() => setShowAdd(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label={t("watchlist.addressOrXpub")}>
              <input
                autoFocus
                className={`${inputCls} font-mono`}
                placeholder="bc1q… / 1… / 3… / xpub…"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            {detectedType && detectedType !== "address" && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
                {t("watchlist.xpubWarning")}
              </div>
            )}
            <Field label={t("watchlist.label")}>
              <input
                className={inputCls}
                placeholder="Ledger Account 1"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <Field label={t("watchlist.tags")}>
              <input
                className={inputCls}
                placeholder="kyc, hardware-wallet"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </Field>
            {error && <p className="text-sm text-loss">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                {t("common.add")}
              </Button>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function WatchedEntryCard({
  entry,
  onDelete,
}: {
  entry: WatchedAddress;
  onDelete: () => void;
}) {
  const { t, locale } = useI18n();
  const loc = intlLocale(locale);
  const portfolio = useAppStore((s) => s.portfolio)!;
  const setUtxoLabel = useAppStore((s) => s.setUtxoLabel);

  const [stats, setStats] = useState<AddressStats | null>(null);
  const [utxos, setUtxos] = useState<Utxo[] | null>(null);
  const [analysis, setAnalysis] = useState<AddressAnalysis | null>(null);
  const [economyFee, setEconomyFee] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingUtxo, setEditingUtxo] = useState<string | null>(null);
  const [utxoLabelText, setUtxoLabelText] = useState("");
  const [utxoTagsText, setUtxoTagsText] = useState("");

  const isAddress = entry.type === "address";
  const explorerSettings = portfolio.explorerSettings;
  const otherAddresses = useMemo(
    () =>
      portfolio.watchedAddresses
        .filter((a) => a.id !== entry.id && a.type === "address")
        .map((a) => a.value),
    [portfolio.watchedAddresses, entry.id],
  );

  const load = useCallback(async () => {
    if (!isAddress) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [st, ut, txs, fees] = await Promise.all([
        fetchAddressStats(explorerSettings, entry.value),
        fetchAddressUtxos(explorerSettings, entry.value),
        fetchAddressTxs(explorerSettings, entry.value) as Promise<AddressTx[]>,
        fetchFeeEstimates(explorerSettings),
      ]);
      setStats(st);
      setUtxos(ut);
      setEconomyFee(fees.economyFee);
      setAnalysis(
        analyzeAddress(entry.value, st, ut, txs, fees.economyFee, otherAddresses),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isAddress, explorerSettings, entry.value, otherAddresses]);

  useEffect(() => {
    // Data fetch on mount / when explorer settings change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const balanceSats = stats
    ? stats.chain_stats.funded_txo_sum -
      stats.chain_stats.spent_txo_sum +
      stats.mempool_stats.funded_txo_sum -
      stats.mempool_stats.spent_txo_sum
    : null;

  const consolidation =
    utxos && economyFee !== null ? consolidationAdvice(utxos, economyFee) : null;

  const scoreColor = (s: number) =>
    s >= 80 ? "text-gain" : s >= 50 ? "text-warning" : "text-loss";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{entry.label}</span>
            {analysis && (
              <span className={`text-xs font-mono ${scoreColor(analysis.privacyScore)}`}>
                {t("watchlist.privacyScore")}: {analysis.privacyScore}/100
              </span>
            )}
          </div>
          <div className="mt-0.5 break-all font-mono text-xs text-muted">
            {entry.value}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
            {analysis && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-accent">
                {analysis.format.toUpperCase()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAddress && (
            <Button variant="ghost" onClick={load} disabled={loading}>
              {loading ? t("common.loading") : t("common.refresh")}
            </Button>
          )}
          <Button variant="danger" onClick={onDelete}>
            {t("common.delete")}
          </Button>
        </div>
      </div>

      {!isAddress && (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
            {t("watchlist.xpubWarning")}
          </div>
          <p className="text-xs text-muted">{t("watchlist.xpubNotScanned")}</p>
        </div>
      )}

      {isAddress && loadError && (
        <p className="mt-3 text-sm text-loss">
          {t("watchlist.loadError", { error: loadError })}
        </p>
      )}

      {isAddress && stats && (
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted">{t("watchlist.balance")}</div>
            <Amount className="font-mono">
              {balanceSats !== null
                ? `${formatBtc(dec(balanceSats).div(1e8), loc)} BTC`
                : "—"}
            </Amount>
          </div>
          <div>
            <div className="text-xs text-muted">{t("watchlist.txCount")}</div>
            <span className="font-mono">
              {stats.chain_stats.tx_count + stats.mempool_stats.tx_count}
            </span>
          </div>
          <div>
            <div className="text-xs text-muted">{t("watchlist.feeRate")}</div>
            <span className="font-mono">
              {economyFee === null ? "—" : formatInt(economyFee, loc)} sat/vB
            </span>
          </div>
        </div>
      )}

      {analysis && analysis.findings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {analysis.findings.map((f, i) => (
            <div
              key={`${f.key}-${i}`}
              className={`rounded-lg border bg-surface-2/40 px-3 py-2 text-xs ${SEVERITY_STYLE[f.severity]}`}
            >
              {t(`watchlist.findings.${f.key}`, f.params)}
            </div>
          ))}
        </div>
      )}

      {consolidation?.recommended && (
        <div className="mt-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs text-accent">
          {t("watchlist.consolidation", {
            count: consolidation.smallUtxoCount,
            fee: economyFee ?? 0,
          })}
        </div>
      )}

      {utxos && utxos.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <div className="mb-1 text-xs text-muted">
            {t("watchlist.utxos")} ({utxos.length})
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-c text-left text-muted">
                <th className="py-1.5 pr-3 font-normal">{t("watchlist.utxoTable.outpoint")}</th>
                <th className="py-1.5 pr-3 text-right font-normal">
                  {t("watchlist.utxoTable.value")}
                </th>
                <th className="py-1.5 pr-3 font-normal">{t("watchlist.utxoTable.labelTag")}</th>
                <th className="py-1.5 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {utxos.map((u) => {
                const outpoint = `${u.txid}:${u.vout}`;
                const uLabel = portfolio.utxoLabels.find((l) => l.outpoint === outpoint);
                const isDust = analysis?.dustUtxos.some(
                  (d) => d.txid === u.txid && d.vout === u.vout,
                );
                return (
                  <tr key={outpoint} className="border-b border-border-c/50">
                    <td className="py-1.5 pr-3 font-mono">
                      {u.txid.slice(0, 10)}…:{u.vout}
                      {isDust && (
                        <span className="ml-2 rounded bg-loss/15 px-1.5 py-0.5 text-loss">
                          {t("watchlist.utxoTable.dust")}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      <Amount>{formatInt(u.value, loc)} sat</Amount>
                    </td>
                    <td className="py-1.5 pr-3">
                      {uLabel?.label}
                      {uLabel?.tags.map((tag) => (
                        <span
                          key={tag}
                          className="ml-1 rounded bg-surface-2 px-1 py-0.5 text-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        className="text-muted hover:text-foreground"
                        onClick={() => {
                          setEditingUtxo(outpoint);
                          setUtxoLabelText(uLabel?.label ?? "");
                          setUtxoTagsText(uLabel?.tags.join(", ") ?? "");
                        }}
                      >
                        {t("watchlist.utxoTable.editLabel")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingUtxo && (
        <Modal
          title={t("watchlist.utxoTable.editLabel")}
          onClose={() => setEditingUtxo(null)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setUtxoLabel({
                outpoint: editingUtxo,
                label: utxoLabelText.trim(),
                tags: utxoTagsText
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
              setEditingUtxo(null);
            }}
          >
            <p className="break-all font-mono text-xs text-muted">{editingUtxo}</p>
            <Field label={t("watchlist.label")}>
              <input
                autoFocus
                className={inputCls}
                value={utxoLabelText}
                onChange={(e) => setUtxoLabelText(e.target.value)}
              />
            </Field>
            <Field label={t("watchlist.tags")}>
              <input
                className={inputCls}
                placeholder="kyc, non-kyc"
                value={utxoTagsText}
                onChange={(e) => setUtxoTagsText(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary">
                {t("common.save")}
              </Button>
              <Button variant="ghost" onClick={() => setEditingUtxo(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
