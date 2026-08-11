"use client";

// One shared, throttled read of the address watchlist for the dashboard.
//
// Two widgets want the same thing (the UTXO overview and the watchlist status),
// and a watchlist can hold dozens of addresses — so this must never turn into
// "one request per address per widget per render". Everything goes through the
// module cache in marketData.ts (per address, long TTL, in-flight requests
// shared), the addresses are walked one at a time with a pause between them,
// and the result is aggregated once for both widgets.
//
// Watch-only, and strictly separate from the ledger (§3.1): this reads the
// watchlist and nothing else, and it only ever talks to the explorer the user
// configured (§3.3).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCached } from "./marketData";
import {
  explorerBase,
  fetchAddressStats,
  fetchAddressTxs,
  fetchAddressUtxos,
  fetchFeeEstimates,
  type AddressStats,
  type AddressTx,
  type Utxo,
} from "./esplora";
import { analyzeAddress, type AddressAnalysis, type FindingSeverity } from "./security";
import type { ExplorerSettings, WatchedAddress } from "./types";

/** One address' on-chain picture. */
export interface ScannedAddress {
  id: string;
  address: string;
  label: string;
  stats: AddressStats;
  utxos: Utxo[];
  analysis: AddressAnalysis;
}

export interface WatchlistScan {
  addresses: ScannedAddress[];
  /** Fee rate the dust and consolidation judgements were made at, sat/vB. */
  economyFeeSatVb: number;
  /** Watchlist entries that cannot be queried by address (xpub and friends). */
  skipped: number;
}

/** How long one address' on-chain data is reused before asking again. */
const ADDRESS_TTL_MS = 5 * 60_000;
/** Pause between two addresses, so a long watchlist stays a polite caller. */
const REQUEST_GAP_MS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scanOne(
  settings: ExplorerSettings,
  entry: WatchedAddress,
  economyFee: number,
  otherAddresses: string[],
): Promise<ScannedAddress> {
  const base = explorerBase(settings);
  const [stats, utxos, txs] = await Promise.all([
    fetchCached(`explorer:stats:${base}:${entry.value}`, ADDRESS_TTL_MS, () =>
      fetchAddressStats(settings, entry.value),
    ),
    fetchCached(`explorer:utxos:${base}:${entry.value}`, ADDRESS_TTL_MS, () =>
      fetchAddressUtxos(settings, entry.value),
    ),
    fetchCached(`explorer:txs:${base}:${entry.value}`, ADDRESS_TTL_MS, () =>
      fetchAddressTxs(settings, entry.value) as Promise<AddressTx[]>,
    ),
  ]);
  return {
    id: entry.id,
    address: entry.value,
    label: entry.label,
    stats,
    utxos,
    analysis: analyzeAddress(entry.value, stats, utxos, txs, economyFee, otherAddresses),
  };
}

/**
 * Scan every watched plain address. Sequential on purpose: the point is not
 * speed, it is not hammering somebody else's public API — and with the cache
 * in front of it a second widget asking costs no request at all.
 */
export async function scanWatchlist(
  settings: ExplorerSettings,
  watched: WatchedAddress[],
): Promise<WatchlistScan> {
  const plain = watched.filter((a) => a.type === "address");
  const skipped = watched.length - plain.length;
  if (plain.length === 0) {
    return { addresses: [], economyFeeSatVb: 0, skipped };
  }

  const fees = await fetchCached(
    `explorer:fees:${explorerBase(settings)}`,
    ADDRESS_TTL_MS,
    () => fetchFeeEstimates(settings),
  );

  const addresses: ScannedAddress[] = [];
  for (const entry of plain) {
    const others = plain.filter((a) => a.id !== entry.id).map((a) => a.value);
    addresses.push(await scanOne(settings, entry, fees.economyFee, others));
    if (entry !== plain[plain.length - 1]) await sleep(REQUEST_GAP_MS);
  }
  return { addresses, economyFeeSatVb: fees.economyFee, skipped };
}

export interface UtxoSummary {
  utxoCount: number;
  dustCount: number;
  /** Sats held in UTXOs across the watchlist. */
  totalSats: number;
  /** Sats sitting in dust UTXOs — what consolidating would rescue. */
  dustSats: number;
  /** UTXOs small enough to be worth folding into one output. */
  consolidatableCount: number;
  /** Estimated fee of one consolidating transaction, in sats. */
  consolidationCostSats: number;
  /** Fees are low enough that now is a good moment for it. */
  feeIsLow: boolean;
  addressCount: number;
}

/** Below this an output is small enough to be worth consolidating (0.001 BTC). */
const SMALL_UTXO_SATS = 100_000;
/** Consolidating is only worth suggesting while blocks are cheap. */
const LOW_FEE_SAT_VB = 5;
/** One P2WPKH output plus the transaction overhead, in vBytes. */
const OUTPUT_VBYTES = 31;
const TX_OVERHEAD_VBYTES = 11;
/** A spent input, averaged over the address types in play. */
const INPUT_VBYTES = 68;

/** What the UTXO widget shows, derived from one scan. */
export function summarizeUtxos(scan: WatchlistScan): UtxoSummary {
  let utxoCount = 0;
  let dustCount = 0;
  let totalSats = 0;
  let dustSats = 0;
  let consolidatable = 0;

  for (const a of scan.addresses) {
    const dust = new Set(a.analysis.dustUtxos.map((u) => `${u.txid}:${u.vout}`));
    for (const u of a.utxos) {
      utxoCount += 1;
      totalSats += u.value;
      if (dust.has(`${u.txid}:${u.vout}`)) {
        dustCount += 1;
        dustSats += u.value;
      }
      if (u.value < SMALL_UTXO_SATS) consolidatable += 1;
    }
  }

  return {
    utxoCount,
    dustCount,
    totalSats,
    dustSats,
    consolidatableCount: consolidatable,
    consolidationCostSats:
      consolidatable > 1
        ? Math.round(
            (consolidatable * INPUT_VBYTES + OUTPUT_VBYTES + TX_OVERHEAD_VBYTES) *
              scan.economyFeeSatVb,
          )
        : 0,
    feeIsLow: scan.economyFeeSatVb > 0 && scan.economyFeeSatVb <= LOW_FEE_SAT_VB,
    addressCount: scan.addresses.length,
  };
}

export interface SecuritySummary {
  addressCount: number;
  /** Findings by severity, "info" ones included but counted apart. */
  danger: number;
  warning: number;
  info: number;
  /** Addresses with at least one warning or danger finding. */
  affectedAddresses: number;
  /** Per finding kind, so the widget can name what is wrong. */
  byKind: { key: string; severity: FindingSeverity; count: number }[];
  /** Mean privacy score over the scanned addresses; null with none. */
  avgPrivacyScore: number | null;
}

/** What the watchlist-status widget shows, derived from the same scan. */
export function summarizeSecurity(scan: WatchlistScan): SecuritySummary {
  let danger = 0;
  let warning = 0;
  let info = 0;
  let affected = 0;
  let scoreSum = 0;
  const byKind = new Map<string, { key: string; severity: FindingSeverity; count: number }>();

  for (const a of scan.addresses) {
    scoreSum += a.analysis.privacyScore;
    let serious = false;
    for (const f of a.analysis.findings) {
      if (f.severity === "danger") danger += 1;
      else if (f.severity === "warning") warning += 1;
      else info += 1;
      if (f.severity !== "info") serious = true;
      const hit = byKind.get(f.key);
      if (hit) hit.count += 1;
      else byKind.set(f.key, { key: f.key, severity: f.severity, count: 1 });
    }
    if (serious) affected += 1;
  }

  const order: Record<FindingSeverity, number> = { danger: 0, warning: 1, info: 2 };
  return {
    addressCount: scan.addresses.length,
    danger,
    warning,
    info,
    affectedAddresses: affected,
    byKind: [...byKind.values()].sort(
      (a, b) => order[a.severity] - order[b.severity] || b.count - a.count,
    ),
    avgPrivacyScore:
      scan.addresses.length > 0 ? scoreSum / scan.addresses.length : null,
  };
}

export interface WatchlistScanResource {
  data: WatchlistScan | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/**
 * Subscribe to the scan. Keyed by the explorer and the addresses themselves,
 * so adding an address rescans while a re-render does not; the cache decides
 * which of those addresses actually costs a request.
 */
export function useWatchlistScan(
  settings: ExplorerSettings,
  watched: WatchedAddress[],
): WatchlistScanResource {
  const { provider, customEndpoint } = settings;
  // The identity of `watched` changes on every portfolio edit; what matters is
  // which addresses are in it.
  const key = useMemo(
    () =>
      watched
        .filter((a) => a.type === "address")
        .map((a) => a.value)
        .join(","),
    [watched],
  );
  // Kept in a ref so the scan effect can read the *current* entries without
  // restarting whenever the portfolio object is replaced; written in an effect
  // rather than during render, which would make this component non-idempotent.
  const watchedRef = useRef(watched);
  useEffect(() => {
    watchedRef.current = watched;
  }, [watched]);

  const [state, setState] = useState<{
    key: string | null;
    data: WatchlistScan | null;
    error: boolean;
  }>({ key: null, data: null, error: false });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const settingsNow: ExplorerSettings = { provider, customEndpoint };
    scanWatchlist(settingsNow, watchedRef.current).then(
      (data) => {
        if (!cancelled) setState({ key, data, error: false });
      },
      () => {
        if (!cancelled) setState({ key, data: null, error: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, provider, customEndpoint, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const settled = state.key === key;
  return {
    data: settled ? state.data : null,
    loading: !settled,
    error: settled && state.error,
    reload,
  };
}
