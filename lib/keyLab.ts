// The key lab: from randomness to an address, step by step, for learning only.
//
// Everything here is a pure function over bytes the caller hands in, so the
// derivation chain can be checked against published test vectors without a
// browser. The one impure piece is `randomBytes`, and it is deliberately the
// only source of randomness: `crypto.getRandomValues()`, never `Math.random`
// and never anything home-made.
//
// No cryptography is implemented here. Curve arithmetic comes from
// @noble/secp256k1, hashes from @noble/hashes, HD derivation from @scure/bip32,
// mnemonics from @scure/bip39 and the encodings from @scure/base. What this
// module adds is the *order* of the steps and their intermediate values, which
// is exactly what the libraries hide and what the page wants to show.
//
// Nothing produced here is ever stored, sent or linked to the portfolio
// (CLAUDE.md, invariants 1 and 7): the page holds it in component state and
// drops it on leaving. The only value that may leave the device is a finished
// address, and only when the user asks for its balance.

import { Point, etc } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist as english } from "@scure/bip39/wordlists/english.js";
import { bech32, bech32m, createBase58check } from "@scure/base";

/** Order of the secp256k1 group: valid private keys are 1 … n − 1. */
export const SECP256K1_N: bigint = Point.CURVE().n;

const base58check = createBase58check(sha256);

const { bytesToHex, concatBytes } = etc;
export { bytesToHex };

/** Fill a buffer from the platform CSPRNG — the only randomness used here. */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function isValidPrivateKey(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const k = etc.bytesToNumberBE(bytes);
  return k > BigInt(0) && k < SECP256K1_N;
}

/**
 * Draw 32 random bytes until they form a valid private key.
 *
 * Rejection sampling rather than reducing modulo n: a reduction would make
 * the smallest keys very slightly more likely, and the page is about showing
 * how this is done properly. In practice the first draw is valid — the chance
 * of a redraw is about 1 in 2^128 — but the loop is what makes it certain.
 * `attempts` is reported so the page can say so.
 */
export function drawPrivateKey(
  source: (length: number) => Uint8Array = randomBytes,
): { key: Uint8Array; attempts: number } {
  for (let attempts = 1; ; attempts++) {
    const key = source(32);
    if (isValidPrivateKey(key)) return { key, attempts };
  }
}

export function hash160(bytes: Uint8Array): Uint8Array {
  return ripemd160(sha256(bytes));
}

function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  return sha256(concatBytes(tagHash, tagHash, msg));
}

/** Wallet Import Format: version byte, key, optional "compressed" flag, Base58Check. */
export function toWif(key: Uint8Array, compressed: boolean): string {
  const payload = compressed
    ? concatBytes(Uint8Array.of(0x80), key, Uint8Array.of(0x01))
    : concatBytes(Uint8Array.of(0x80), key);
  return base58check.encode(payload);
}

export function p2pkhAddress(pubHash: Uint8Array): string {
  return base58check.encode(concatBytes(Uint8Array.of(0x00), pubHash));
}

export function p2shP2wpkhAddress(pubHash: Uint8Array): {
  redeemScript: Uint8Array;
  scriptHash: Uint8Array;
  address: string;
} {
  // OP_0 PUSH20 <hash160(pubkey)> — the native SegWit program, wrapped.
  const redeemScript = concatBytes(Uint8Array.of(0x00, 0x14), pubHash);
  const scriptHash = hash160(redeemScript);
  return {
    redeemScript,
    scriptHash,
    address: base58check.encode(concatBytes(Uint8Array.of(0x05), scriptHash)),
  };
}

export function p2wpkhAddress(pubHash: Uint8Array): string {
  return bech32.encode("bc", [0, ...bech32.toWords(pubHash)]);
}

export interface TaprootSteps {
  /** x coordinate of the public key with even y (BIP340 x-only key). */
  internalKey: Uint8Array;
  /** t = tagged hash "TapTweak" of the internal key (no script tree, BIP86). */
  tweak: Uint8Array;
  /** Q = P + t·G, x coordinate only. */
  outputKey: Uint8Array;
  address: string;
}

/**
 * Key-path-only Taproot output (BIP86): the public key is tweaked with a hash
 * of itself, so the address commits to "there is no script path".
 */
export function taprootFromPublicKey(compressedPub: Uint8Array): TaprootSteps {
  const internalKey = compressedPub.slice(1);
  // lift_x: the point with this x and an even y.
  const P = Point.fromBytes(concatBytes(Uint8Array.of(0x02), internalKey));
  const tweak = taggedHash("TapTweak", internalKey);
  const t = etc.bytesToNumberBE(tweak);
  if (t >= SECP256K1_N) throw new Error("Taproot tweak out of range");
  const Q = P.add(Point.BASE.multiply(t));
  const outputKey = Q.toBytes(true).slice(1);
  return {
    internalKey,
    tweak,
    outputKey,
    address: bech32m.encode("bc", [1, ...bech32m.toWords(outputKey)]),
  };
}

export interface KeyChain {
  privateKeyHex: string;
  /** The key as the number it is, in decimal. */
  privateKeyDecimal: string;
  wifCompressed: string;
  wifUncompressed: string;
  publicKeyUncompressed: string;
  publicKeyCompressed: string;
  /** hash160 of the compressed key — what Legacy and SegWit v0 commit to. */
  pubKeyHash: string;
  legacyAddress: string;
  segwitAddress: string;
  taproot: { internalKey: string; tweak: string; outputKey: string; address: string };
}

/** The whole chain from a private key, every intermediate value as text. */
export function deriveKeyChain(key: Uint8Array): KeyChain {
  if (!isValidPrivateKey(key)) throw new Error("Invalid private key");
  const d = etc.bytesToNumberBE(key);
  const pub = Point.BASE.multiply(d);
  const compressed = pub.toBytes(true);
  const pubHash = hash160(compressed);
  const taproot = taprootFromPublicKey(compressed);
  return {
    privateKeyHex: bytesToHex(key),
    privateKeyDecimal: d.toString(10),
    wifCompressed: toWif(key, true),
    wifUncompressed: toWif(key, false),
    publicKeyUncompressed: bytesToHex(pub.toBytes(false)),
    publicKeyCompressed: bytesToHex(compressed),
    pubKeyHash: bytesToHex(pubHash),
    legacyAddress: p2pkhAddress(pubHash),
    segwitAddress: p2wpkhAddress(pubHash),
    taproot: {
      internalKey: bytesToHex(taproot.internalKey),
      tweak: bytesToHex(taproot.tweak),
      outputKey: bytesToHex(taproot.outputKey),
      address: taproot.address,
    },
  };
}

// ── BIP39 / BIP32 ──────────────────────────────────────────────────────────

export type MnemonicStrength = 128 | 256;

export interface MnemonicWord {
  word: string;
  /** Position in the BIP39 word list, 0 … 2047. */
  index: number;
  /** The 11 bits that select it. */
  bits: string;
}

export type Purpose = 44 | 49 | 84 | 86;

export interface DerivedAddress {
  purpose: Purpose;
  path: string;
  privateKeyHex: string;
  publicKeyHex: string;
  address: string;
}

export interface MnemonicChain {
  entropyHex: string;
  entropyBits: string;
  checksumBits: string;
  words: MnemonicWord[];
  mnemonic: string;
  seedHex: string;
  masterPrivateKeyHex: string;
  masterChainCodeHex: string;
  masterXprv: string;
  addresses: DerivedAddress[];
}

const PURPOSES: Purpose[] = [44, 49, 84, 86];

function bitString(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(2).padStart(8, "0")).join("");
}

export function addressForPurpose(purpose: Purpose, compressedPub: Uint8Array): string {
  const pubHash = hash160(compressedPub);
  switch (purpose) {
    case 44:
      return p2pkhAddress(pubHash);
    case 49:
      return p2shP2wpkhAddress(pubHash).address;
    case 84:
      return p2wpkhAddress(pubHash);
    case 86:
      return taprootFromPublicKey(compressedPub).address;
  }
}

/**
 * Entropy → words → seed → master key → first receive address of each
 * standard path. The word mapping is the library's; the bit split next to it
 * only reproduces it for display, and the test checks the two agree.
 */
export function deriveMnemonicChain(entropy: Uint8Array): MnemonicChain {
  if (entropy.length !== 16 && entropy.length !== 32) {
    throw new Error("Entropy must be 128 or 256 bits");
  }
  const mnemonic = entropyToMnemonic(entropy, english);
  const entropyBits = bitString(entropy);
  const checksumBits = bitString(sha256(entropy)).slice(0, entropy.length * 8 / 32);
  const all = entropyBits + checksumBits;
  const words: MnemonicWord[] = [];
  for (let i = 0; i < all.length; i += 11) {
    const bits = all.slice(i, i + 11);
    const index = parseInt(bits, 2);
    words.push({ word: english[index], index, bits });
  }

  // No passphrase, and no field to enter one (see the page): the seed shown is
  // the one these words produce with the empty passphrase.
  const seed = mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  const addresses = PURPOSES.map((purpose): DerivedAddress => {
    const path = `m/${purpose}'/0'/0'/0/0`;
    const child = master.derive(path);
    return {
      purpose,
      path,
      privateKeyHex: bytesToHex(child.privateKey!),
      publicKeyHex: bytesToHex(child.publicKey!),
      address: addressForPurpose(purpose, child.publicKey!),
    };
  });

  return {
    entropyHex: bytesToHex(entropy),
    entropyBits,
    checksumBits,
    words,
    mnemonic,
    seedHex: bytesToHex(seed),
    masterPrivateKeyHex: bytesToHex(master.privateKey!),
    masterChainCodeHex: bytesToHex(master.chainCode!),
    masterXprv: master.privateExtendedKey,
    addresses,
  };
}

/** Fresh entropy for a mnemonic, from the same single source of randomness. */
export function drawMnemonicEntropy(
  strength: MnemonicStrength,
  source: (length: number) => Uint8Array = randomBytes,
): Uint8Array {
  return source(strength / 8);
}

// ── The size of the key space ──────────────────────────────────────────────

/** A large integer as mantissa × 10^exponent, for display. */
export function scientific(value: bigint, digits = 3): { mantissa: number; exponent: number } {
  if (value <= BigInt(0)) return { mantissa: 0, exponent: 0 };
  const s = value.toString(10);
  const exponent = s.length - 1;
  const head = s.slice(0, digits + 1);
  const mantissa = Number(`${head[0]}.${head.slice(1)}`);
  return { mantissa, exponent };
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function superscript(n: number): string {
  const digits = String(Math.abs(n)).replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]);
  return n < 0 ? `⁻${digits}` : digits;
}

function writeScientific(mantissa: number, exponent: number, locale: string): string {
  if (exponent < 3 && exponent > -3) {
    return new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(
      mantissa * 10 ** exponent,
    );
  }
  if (mantissa === 1) return `10${superscript(exponent)}`;
  const m = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(mantissa);
  return `${m} × 10${superscript(exponent)}`;
}

/** "1,16 × 10⁷⁷" — a large integer for running text, in the locale's digits. */
export function formatScientific(value: bigint, locale: string): string {
  const { mantissa, exponent } = scientific(value);
  return writeScientific(mantissa, exponent, locale);
}

/** 1 / value in the same notation: "8,64 × 10⁻⁷⁸" for 1 / 1,16 × 10⁷⁷. */
export function formatReciprocal(value: bigint, locale: string): string {
  const { mantissa, exponent } = scientific(value);
  if (mantissa === 0) return "0";
  let m = 1 / mantissa;
  let e = -exponent;
  if (m < 1) {
    m *= 10;
    e -= 1;
  }
  return writeScientific(Number(m.toPrecision(3)), e, locale);
}

const SECONDS_PER_YEAR = BigInt(31_557_600); // Julian year
/** Age of the universe in years (≈ 13.8 billion). */
export const UNIVERSE_AGE_YEARS = BigInt(13_800_000_000);

/**
 * Expected years to find one specific key by guessing at `perSecond`: on
 * average half the space has to be searched.
 */
export function yearsToSearch(perSecond: bigint): bigint {
  return SECP256K1_N / BigInt(2) / perSecond / SECONDS_PER_YEAR;
}

/**
 * How many addresses Legacy and SegWit v0 can tell apart: they commit to a
 * 160-bit hash, so that, not 2^256, is the space a random key has to land in.
 */
export const ADDRESS_SPACE: bigint = BigInt(2) ** BigInt(160);

/**
 * A deliberately generous upper bound for addresses holding a balance. The
 * real number is far smaller; rounding up only makes the odds shown look
 * *better* for a guesser than they are.
 */
export const FUNDED_ADDRESS_BOUND = BigInt(1_000_000_000);

/**
 * Upper bound on the chance that `lookups` addresses of random keys include a
 * funded one, as "1 in X" — X is what the page prints. Each lookup checks one
 * address, so that, not the number of keys, is what the odds scale with.
 */
export function oddsAgainstHit(lookups: bigint): bigint {
  if (lookups <= BigInt(0)) return BigInt(0);
  return ADDRESS_SPACE / (FUNDED_ADDRESS_BOUND * lookups);
}

// ── The explorer query ─────────────────────────────────────────────────────

/** At most one explorer request per this many milliseconds. */
export const QUERY_INTERVAL_MS = 5_000;

/** Milliseconds until the next query is allowed; 0 when it is. */
export function queryWait(lastQueryAt: number | null, now: number): number {
  if (lastQueryAt === null) return 0;
  return Math.max(0, lastQueryAt + QUERY_INTERVAL_MS - now);
}
