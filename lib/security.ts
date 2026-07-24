// Watch-only security & privacy heuristics (spec §6.1/§6.2).
// All checks run on live explorer data for watchlist entries — never on the
// accounting ledger.

import type { AddressStats, AddressTx, Utxo } from "./esplora";

export type AddressFormat =
  | "p2pkh" // legacy, 1...
  | "p2sh" // 3...
  | "p2wpkh" // native segwit, bc1q (short)
  | "p2wsh" // bc1q (long)
  | "p2tr" // taproot, bc1p
  | "unknown";

export function detectAddressFormat(address: string): AddressFormat {
  const a = address.trim();
  if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return "p2pkh";
  if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return "p2sh";
  if (/^bc1q[a-z0-9]{38}$/.test(a)) return "p2wpkh";
  if (/^bc1q[a-z0-9]{58}$/.test(a)) return "p2wsh";
  if (/^bc1p[a-z0-9]{58}$/.test(a)) return "p2tr";
  return "unknown";
}

/** Legacy/P2SH formats reveal the public key once an output is spent. */
export function isLegacyFormat(format: AddressFormat): boolean {
  return format === "p2pkh" || format === "p2sh";
}

/** Approx. input weight in vBytes for spending one UTXO of this type. */
export function inputVbytes(format: AddressFormat): number {
  switch (format) {
    case "p2pkh":
      return 148;
    case "p2sh":
      return 91; // assumes p2sh-p2wpkh
    case "p2wpkh":
      return 68;
    case "p2tr":
      return 57.5;
    default:
      return 68;
  }
}

export type FindingSeverity = "info" | "warning" | "danger";

export interface SecurityFinding {
  /** i18n key under security.findings.* */
  key:
    | "addressReuse"
    | "pubkeyLeaked"
    | "legacyFormat"
    | "possiblePoisoning"
    | "dustUtxo"
    | "roundAmounts";
  severity: FindingSeverity;
  /** Interpolation values for the message. */
  params?: Record<string, string | number>;
}

export interface AddressAnalysis {
  format: AddressFormat;
  findings: SecurityFinding[];
  /** 0–100, higher is better. */
  privacyScore: number;
  dustUtxos: Utxo[];
}

const DUST_RECEIVE_SATS = 1000;

/** True when two addresses look confusingly similar (poisoning pattern). */
export function looksSimilar(a: string, b: string): boolean {
  if (a === b) return false;
  if (a.length < 12 || b.length < 12) return false;
  return (
    a.slice(0, 6).toLowerCase() === b.slice(0, 6).toLowerCase() &&
    a.slice(-4).toLowerCase() === b.slice(-4).toLowerCase()
  );
}

export function analyzeAddress(
  address: string,
  stats: AddressStats,
  utxos: Utxo[],
  txs: AddressTx[],
  feeRateSatVb: number,
  otherWatchedAddresses: string[],
): AddressAnalysis {
  const format = detectAddressFormat(address);
  const findings: SecurityFinding[] = [];
  let score = 100;

  // Address reuse: more than one incoming funding.
  const funded =
    stats.chain_stats.funded_txo_count + stats.mempool_stats.funded_txo_count;
  if (funded > 1) {
    findings.push({
      key: "addressReuse",
      severity: "warning",
      params: { count: funded },
    });
    score -= 25;
  }

  // Public key exposure on legacy/P2SH after any spend.
  const spent =
    stats.chain_stats.spent_txo_count + stats.mempool_stats.spent_txo_count;
  if (isLegacyFormat(format)) {
    if (spent > 0) {
      findings.push({ key: "pubkeyLeaked", severity: "warning" });
      score -= 15;
    }
    findings.push({ key: "legacyFormat", severity: "info" });
    score -= 10;
  }

  // Dust UTXOs: spending them would cost more in fees than they are worth.
  const dustUtxos = utxos.filter(
    (u) => u.value < inputVbytes(format) * feeRateSatVb,
  );
  if (dustUtxos.length > 0) {
    findings.push({
      key: "dustUtxo",
      severity: "warning",
      params: { count: dustUtxos.length },
    });
    score -= 10;
  }

  // Address poisoning: tiny incoming amounts, especially from addresses that
  // visually resemble other watched addresses.
  let poisoning = 0;
  for (const tx of txs) {
    const received = tx.vout.find((v) => v.scriptpubkey_address === address);
    if (!received || received.value > DUST_RECEIVE_SATS) continue;
    const counterparties = tx.vin
      .map((v) => v.prevout?.scriptpubkey_address)
      .filter((x): x is string => !!x);
    const similar = counterparties.some((c) =>
      otherWatchedAddresses.some((w) => looksSimilar(c, w)),
    );
    // Any dust receive is suspicious; similarity makes it near-certain.
    poisoning = Math.max(poisoning, similar ? 2 : 1);
  }
  if (poisoning > 0) {
    findings.push({
      key: "possiblePoisoning",
      severity: poisoning === 2 ? "danger" : "warning",
    });
    score -= poisoning === 2 ? 30 : 15;
  }

  // Conspicuously round received amounts hurt privacy (easy change detection).
  const roundOutputs = txs.filter((tx) => {
    const v = tx.vout.find((o) => o.scriptpubkey_address === address)?.value;
    return v !== undefined && v >= 100_000 && v % 100_000 === 0;
  }).length;
  if (roundOutputs > 0) {
    findings.push({
      key: "roundAmounts",
      severity: "info",
      params: { count: roundOutputs },
    });
    score -= 5;
  }

  return {
    format,
    findings,
    privacyScore: Math.max(0, score),
    dustUtxos,
  };
}

export interface ConsolidationAdvice {
  smallUtxoCount: number;
  feeIsLow: boolean;
  recommended: boolean;
}

const SMALL_UTXO_SATS = 100_000; // 0.001 BTC
const LOW_FEE_SAT_VB = 5;

export function consolidationAdvice(
  utxos: Utxo[],
  economyFeeSatVb: number,
): ConsolidationAdvice {
  const small = utxos.filter((u) => u.value < SMALL_UTXO_SATS).length;
  const feeIsLow = economyFeeSatVb <= LOW_FEE_SAT_VB;
  return {
    smallUtxoCount: small,
    feeIsLow,
    recommended: small >= 3 && feeIsLow,
  };
}
