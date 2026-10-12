"use client";

// The balance lookup for generated addresses.
//
// Deliberately the opposite of a scanner: one address per click, nothing that
// repeats or retries by itself, and a client-side spacing between requests so
// the page cannot be used to hammer the explorer. The session tally exists to
// make the point the page is about — how little any number of lookups
// achieves against the size of the key space.

import { useCallback, useEffect, useRef, useState } from "react";
import { Decimal, formatBtc } from "@/lib/decimal";
import { explorerBase, fetchAddressStats } from "@/lib/esplora";
import { intlLocale, type TranslateFn } from "@/lib/i18n";
import {
  QUERY_INTERVAL_MS,
  SECP256K1_N,
  formatReciprocal,
  formatScientific,
  oddsAgainstHit,
  queryWait,
} from "@/lib/keyLab";
import { useAppStore } from "@/lib/store";
import type { ExplorerSettings, Locale } from "@/lib/types";
import { Button } from "../ui";

type LookupResult =
  | { status: "loading" }
  | { status: "done"; balanceSats: number; txCount: number }
  | { status: "error"; message: string };

const DEFAULT_EXPLORER: ExplorerSettings = { provider: "mempool.space" };

export interface AddressLookup {
  settings: ExplorerSettings;
  /** Whether the settings come from an open portfolio or are the default. */
  configured: boolean;
  /** False when a custom endpoint is selected without a URL. */
  usable: boolean;
  /** Milliseconds until the next lookup is allowed. */
  wait: number;
  busy: boolean;
  results: Record<string, LookupResult>;
  checkedKeys: number;
  lookups: number;
  lookup: (address: string, keyId: string) => void;
  /** Forget everything — on leaving the page. */
  reset: () => void;
}

export function useAddressLookup(): AddressLookup {
  const portfolioSettings = useAppStore((s) => s.portfolio?.explorerSettings);
  const settings = portfolioSettings ?? DEFAULT_EXPLORER;
  const usable = explorerBase(settings) !== "";

  const [results, setResults] = useState<Record<string, LookupResult>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [lookups, setLookups] = useState(0);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const abort = useRef<AbortController | null>(null);

  const wait = queryWait(lastAt, now);
  const busy = Object.values(results).some((r) => r.status === "loading");

  // Tick only while a wait is running, to count it down on the button.
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [wait]);

  useEffect(() => () => abort.current?.abort(), []);

  const lookup = useCallback(
    (address: string, keyId: string) => {
      const at = Date.now();
      // Checked here as well as by the disabled button: the throttle is a
      // promise to the explorer, not a styling detail.
      if (!usable || busy || queryWait(lastAt, at) > 0) return;
      setLastAt(at);
      setNow(at);
      setLookups((n) => n + 1);
      setChecked((ids) => (ids.includes(keyId) ? ids : [...ids, keyId]));
      setResults((r) => ({ ...r, [address]: { status: "loading" } }));

      const controller = new AbortController();
      abort.current = controller;
      fetchAddressStats(settings, address)
        .then((stats) => {
          if (controller.signal.aborted) return;
          const c = stats.chain_stats;
          const m = stats.mempool_stats;
          setResults((r) => ({
            ...r,
            [address]: {
              status: "done",
              balanceSats:
                c.funded_txo_sum - c.spent_txo_sum + m.funded_txo_sum - m.spent_txo_sum,
              txCount: c.tx_count + m.tx_count,
            },
          }));
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setResults((r) => ({
            ...r,
            [address]: { status: "error", message: e instanceof Error ? e.message : String(e) },
          }));
        });
    },
    [usable, busy, lastAt, settings],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    setResults({});
    setChecked([]);
    setLookups(0);
  }, []);

  return {
    settings,
    configured: portfolioSettings !== undefined,
    usable,
    wait,
    busy,
    results,
    checkedKeys: checked.length,
    lookups,
    lookup,
    reset,
  };
}

function sourceName(settings: ExplorerSettings): string {
  switch (settings.provider) {
    case "blockstream":
      return "blockstream.info";
    case "custom-electrum":
      return settings.customEndpoint || "—";
    case "mempool.space":
    default:
      return "mempool.space";
  }
}

/** The button and the result for one address. */
export function LookupButton({
  t,
  locale,
  address,
  keyId,
  state,
}: {
  t: TranslateFn;
  locale: Locale;
  address: string;
  keyId: string;
  state: AddressLookup;
}) {
  const privacyMode = useAppStore((s) => s.privacyMode);
  const result = state.results[address];
  const seconds = Math.ceil(state.wait / 1000);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        onClick={() => state.lookup(address, keyId)}
        disabled={!state.usable || state.busy || state.wait > 0}
        className="text-xs"
      >
        {result?.status === "loading"
          ? t("keyLab.query.loading")
          : state.wait > 0
            ? t("keyLab.query.wait", { seconds })
            : t("keyLab.query.button")}
      </Button>
      {result?.status === "done" && (
        <p className="text-xs text-muted" role="status">
          {t("keyLab.query.balance")}:{" "}
          <span className={`font-mono text-foreground ${privacyMode ? "privacy-blur" : ""}`}>
            {formatBtc(new Decimal(result.balanceSats).div(100_000_000), intlLocale(locale))} BTC
          </span>
          {" · "}
          {t("keyLab.query.txCount")}:{" "}
          <span className={`font-mono text-foreground ${privacyMode ? "privacy-blur" : ""}`}>
            {result.txCount}
          </span>
          {" — "}
          {result.txCount === 0 && result.balanceSats === 0
            ? t("keyLab.query.empty")
            : t("keyLab.query.notEmpty")}
        </p>
      )}
      {result?.status === "error" && (
        <p className="text-xs text-loss" role="alert">
          {t("keyLab.query.error", { message: result.message })}
        </p>
      )}
    </div>
  );
}

/** Where lookups go, what that reveals, and what the session has achieved. */
export function LookupPanel({
  t,
  locale,
  state,
}: {
  t: TranslateFn;
  locale: Locale;
  state: AddressLookup;
}) {
  const loc = intlLocale(locale);
  const source = sourceName(state.settings);
  const lookups = BigInt(state.lookups);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted">
      <p>{t("keyLab.query.intro", { seconds: QUERY_INTERVAL_MS / 1000 })}</p>
      <p className="text-xs">
        {state.configured
          ? t("keyLab.query.source", { source })
          : t("keyLab.query.sourceDefault", { source })}
      </p>
      {!state.usable && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
          {t("keyLab.query.sourceMissing")}
        </p>
      )}
      <p className="rounded-lg border border-border-c/60 bg-surface-2/40 p-3 text-xs">
        {t("keyLab.query.privacy")}
      </p>
      <div className="rounded-lg border border-border-c/60 p-3 text-xs" aria-live="polite">
        <p className="mb-1 font-medium text-foreground">{t("keyLab.query.sessionHeading")}</p>
        {state.lookups === 0 ? (
          <p>{t("keyLab.query.sessionNone")}</p>
        ) : (
          <>
            <p>
              {t("keyLab.query.sessionKeys", {
                keys: state.checkedKeys,
                queries: state.lookups,
              })}
            </p>
            <p>
              {t("keyLab.query.share", {
                fraction: formatReciprocal(SECP256K1_N / BigInt(state.checkedKeys), loc),
              })}
            </p>
            <p>
              {t("keyLab.query.odds", {
                odds: formatScientific(oddsAgainstHit(lookups), loc),
              })}
            </p>
          </>
        )}
        <p className="mt-2">{t("keyLab.query.oddsExplain")}</p>
      </div>
    </div>
  );
}
