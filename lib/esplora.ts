// On-chain data via Esplora-compatible APIs (mempool.space / blockstream.info
// or a custom endpoint). Live data is fetched at runtime and never persisted —
// only the watchlist itself lives in the portfolio file.

import type { ExplorerSettings } from "./types";

export function explorerBase(settings: ExplorerSettings): string {
  switch (settings.provider) {
    case "blockstream":
      return "https://blockstream.info/api";
    case "custom-electrum":
      return (settings.customEndpoint || "").replace(/\/+$/, "");
    case "mempool.space":
    default:
      return "https://mempool.space/api";
  }
}

export interface AddressStats {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

export interface Utxo {
  txid: string;
  vout: number;
  value: number; // sats
  status: { confirmed: boolean; block_time?: number };
}

export interface AddressTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: { prevout?: { scriptpubkey_address?: string; value: number } }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

export interface FeeEstimates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

async function get<T>(base: string, path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`Explorer request failed (${res.status}): ${path}`);
  return res.json() as Promise<T>;
}

export function fetchAddressStats(settings: ExplorerSettings, address: string) {
  return get<AddressStats>(explorerBase(settings), `/address/${address}`);
}

export function fetchAddressUtxos(settings: ExplorerSettings, address: string) {
  return get<Utxo[]>(explorerBase(settings), `/address/${address}/utxo`);
}

export function fetchAddressTxs(settings: ExplorerSettings, address: string) {
  return get<AddressTx[]>(explorerBase(settings), `/address/${address}/txs`);
}

/** mempool.space only; falls back to Esplora's fee-estimates shape. */
export async function fetchFeeEstimates(
  settings: ExplorerSettings,
): Promise<FeeEstimates> {
  const base = explorerBase(settings);
  if (settings.provider === "mempool.space") {
    return get<FeeEstimates>("https://mempool.space/api", "/v1/fees/recommended");
  }
  const est = await get<Record<string, number>>(base, "/fee-estimates");
  return {
    fastestFee: est["1"] ?? 1,
    halfHourFee: est["3"] ?? 1,
    hourFee: est["6"] ?? 1,
    economyFee: est["144"] ?? 1,
    minimumFee: est["1008"] ?? 1,
  };
}
