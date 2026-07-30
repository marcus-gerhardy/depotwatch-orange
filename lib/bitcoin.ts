// Syntax checks for the optional on-chain fields of a transfer (CLAUDE.md
// §3.2): the on-chain transaction id and the address of the relevant output.
//
// Scope note: these values are a matching aid for pairing a transfer_out with
// its transfer_in — nothing here talks to an explorer, and none of the
// security/privacy features build on them. Those keep working exclusively on
// the separate address watchlist (§3.1/§3.3).

const TXID = /^[0-9a-f]{64}$/;

/** Trim + lowercase — a txid is hex, so case carries no meaning. */
export function normalizeTxid(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Exactly 64 hex characters (call with a normalized value). */
export function isValidTxid(txid: string): boolean {
  return TXID.test(txid);
}

// --- bech32 / bech32m (BIP-173 / BIP-350) ---------------------------------

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

/** Human-readable parts we accept: mainnet, testnet/signet, regtest. */
const HRPS = new Set(["bc", "tb", "bcrt"]);

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GENERATOR[i];
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

interface Bech32Decoded {
  hrp: string;
  /** 5-bit groups without the 6 checksum characters. */
  data: number[];
  encoding: "bech32" | "bech32m";
}

function decodeBech32(address: string): Bech32Decoded | null {
  // BIP-173: mixing upper and lower case is invalid; either form alone is not.
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
    return null;
  }
  const s = address.toLowerCase();
  if (s.length < 8 || s.length > 90) return null;
  const sep = s.lastIndexOf("1");
  if (sep < 1 || sep + 7 > s.length) return null;
  const hrp = s.slice(0, sep);
  const values: number[] = [];
  for (const c of s.slice(sep + 1)) {
    const v = CHARSET.indexOf(c);
    if (v === -1) return null;
    values.push(v);
  }
  const checksum = polymod([...hrpExpand(hrp), ...values]);
  const encoding =
    checksum === BECH32_CONST
      ? "bech32"
      : checksum === BECH32M_CONST
        ? "bech32m"
        : null;
  if (encoding === null) return null;
  return { hrp, data: values.slice(0, -6), encoding };
}

/** Regroup 5-bit values into 8-bit bytes (no padding allowed on the way out). */
function convertBits(data: number[]): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const value of data) {
    if (value < 0 || value >> 5 !== 0) return null;
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  // Leftover bits must be zero padding of less than one byte.
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return null;
  return out;
}

function isValidSegwitAddress(address: string): boolean {
  const decoded = decodeBech32(address);
  if (!decoded || !HRPS.has(decoded.hrp) || decoded.data.length === 0) return false;
  const version = decoded.data[0];
  if (version > 16) return false;
  const program = convertBits(decoded.data.slice(1));
  if (program === null || program.length < 2 || program.length > 40) return false;
  // Witness v0 (P2WPKH/P2WSH) is bech32 with a fixed program length,
  // v1+ (Taproot and future versions) is bech32m.
  if (version === 0) {
    return (
      decoded.encoding === "bech32" &&
      (program.length === 20 || program.length === 32)
    );
  }
  return decoded.encoding === "bech32m";
}

// --- base58 (P2PKH / P2SH) ------------------------------------------------

// Syntax only: the base58check checksum needs SHA-256, which the Web Crypto
// API only offers asynchronously — form validation here is synchronous, and a
// wrong address cannot cause damage (the field is a label, never an input to
// a transaction we build).
const BASE58_MAINNET = /^[13][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{25,34}$/;
const BASE58_TESTNET = /^[mn2][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{25,34}$/;

/**
 * Trim, and fold an all-uppercase bech32 address to lower case (the form
 * BIP-173 recommends for display). Base58 addresses are case-sensitive and
 * are never touched.
 */
export function normalizeBitcoinAddress(raw: string): string {
  const a = raw.trim();
  if (a === a.toUpperCase() && isValidSegwitAddress(a)) return a.toLowerCase();
  return a;
}

/**
 * Syntactically valid Bitcoin address: legacy P2PKH/P2SH, bech32 SegWit v0,
 * or bech32m Taproot (call with a normalized value).
 */
export function isValidBitcoinAddress(address: string): boolean {
  if (address === "") return false;
  if (BASE58_MAINNET.test(address) || BASE58_TESTNET.test(address)) return true;
  return isValidSegwitAddress(address);
}
