import { describe, expect, it } from "vitest";
import { etc } from "@noble/secp256k1";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  SECP256K1_N,
  deriveKeyChain,
  deriveMnemonicChain,
  drawMnemonicEntropy,
  drawPrivateKey,
  isValidPrivateKey,
  oddsAgainstHit,
  queryWait,
  scientific,
  yearsToSearch,
  formatReciprocal,
  formatScientific,
  QUERY_INTERVAL_MS,
} from "./keyLab";

const keyOf = (n: bigint) => etc.hexToBytes(n.toString(16).padStart(64, "0"));

describe("private key range", () => {
  it("accepts 1 … n−1 and nothing else", () => {
    expect(isValidPrivateKey(keyOf(BigInt(0)))).toBe(false);
    expect(isValidPrivateKey(keyOf(BigInt(1)))).toBe(true);
    expect(isValidPrivateKey(keyOf(SECP256K1_N - BigInt(1)))).toBe(true);
    expect(isValidPrivateKey(keyOf(SECP256K1_N))).toBe(false);
    expect(isValidPrivateKey(new Uint8Array(32).fill(0xff))).toBe(false);
    expect(isValidPrivateKey(new Uint8Array(31).fill(1))).toBe(false);
  });

  it("redraws until the value is in range", () => {
    const draws = [new Uint8Array(32), keyOf(SECP256K1_N), keyOf(BigInt(42))];
    const { key, attempts } = drawPrivateKey(() => draws.shift()!);
    expect(attempts).toBe(3);
    expect(etc.bytesToNumberBE(key)).toBe(BigInt(42));
  });

  it("draws from crypto.getRandomValues by default", () => {
    const { key, attempts } = drawPrivateKey();
    expect(key).toHaveLength(32);
    expect(attempts).toBeGreaterThanOrEqual(1);
    expect(isValidPrivateKey(key)).toBe(true);
  });
});

describe("key chain", () => {
  // Private key 1: the public key is the generator point itself, and every
  // encoding of it is published widely enough to serve as a test vector.
  const chain = deriveKeyChain(keyOf(BigInt(1)));

  it("encodes the private key", () => {
    expect(chain.privateKeyDecimal).toBe("1");
    expect(chain.wifCompressed).toBe("KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn");
    expect(chain.wifUncompressed).toBe("5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf");
  });

  it("derives both public key forms", () => {
    expect(chain.publicKeyCompressed).toBe(
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    );
    expect(chain.publicKeyUncompressed).toBe(
      "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
        "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
    );
  });

  it("derives the addresses", () => {
    expect(chain.pubKeyHash).toBe("751e76e8199196d454941c45d1b3a323f1433bd6");
    expect(chain.legacyAddress).toBe("1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH");
    expect(chain.segwitAddress).toBe("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
    expect(chain.taproot.internalKey).toBe(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    );
    expect(chain.taproot.address).toMatch(/^bc1p[02-9ac-hj-np-z]{58}$/);
  });

  it("refuses a key outside the range", () => {
    expect(() => deriveKeyChain(keyOf(BigInt(0)))).toThrow();
  });
});

describe("mnemonic chain", () => {
  // BIP84/BIP86/BIP49/BIP44 test vectors: "abandon … about".
  const chain = deriveMnemonicChain(new Uint8Array(16));

  it("maps entropy and checksum onto words the same way the library does", () => {
    expect(chain.mnemonic).toBe(`${"abandon ".repeat(11)}about`);
    expect(chain.checksumBits).toHaveLength(4);
    expect(chain.words.map((w) => w.word).join(" ")).toBe(chain.mnemonic);
    expect(chain.words.at(-1)!.index).toBe(3);

    const entropy = drawMnemonicEntropy(256);
    const random = deriveMnemonicChain(entropy);
    expect(random.words).toHaveLength(24);
    expect(random.checksumBits).toHaveLength(8);
    expect(random.words.map((w) => w.word).join(" ")).toBe(entropyToMnemonic(entropy, wordlist));
  });

  it("derives the seed and the first address of each path", () => {
    expect(chain.seedHex).toBe(
      "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1" +
        "9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4",
    );
    const byPurpose = Object.fromEntries(chain.addresses.map((a) => [a.purpose, a.address]));
    expect(byPurpose[44]).toBe("1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA");
    expect(byPurpose[49]).toBe("37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf");
    expect(byPurpose[84]).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect(byPurpose[86]).toBe(
      "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr",
    );
  });
});

describe("key space figures", () => {
  it("writes large numbers in scientific notation", () => {
    expect(scientific(BigInt(2) ** BigInt(256))).toEqual({ mantissa: 1.157, exponent: 77 });
    expect(scientific(BigInt(1000))).toEqual({ mantissa: 1, exponent: 3 });
    expect(formatScientific(BigInt(2) ** BigInt(256), "de-DE")).toBe("1,16 × 10⁷⁷");
    expect(formatScientific(BigInt(10) ** BigInt(21), "en-US")).toBe("10²¹");
    expect(formatScientific(BigInt(42), "en-US")).toBe("42");
    expect(formatReciprocal(BigInt(2) ** BigInt(256), "en-US")).toBe("8.64 × 10⁻⁷⁸");
    expect(formatReciprocal(BigInt(4) * BigInt(10) ** BigInt(76), "en-US")).toBe("2.5 × 10⁻⁷⁷");
  });

  it("dwarfs the age of the universe even at absurd speeds", () => {
    expect(yearsToSearch(BigInt(10) ** BigInt(21)) > BigInt(10) ** BigInt(40)).toBe(true);
  });

  it("puts the odds of a hit far out of reach", () => {
    expect(oddsAgainstHit(BigInt(0))).toBe(BigInt(0));
    expect(scientific(oddsAgainstHit(BigInt(1))).exponent).toBe(39);
  });
});

describe("query throttle", () => {
  it("allows the first query and spaces the following ones", () => {
    expect(queryWait(null, 1000)).toBe(0);
    expect(queryWait(1000, 1000)).toBe(QUERY_INTERVAL_MS);
    expect(queryWait(1000, 1000 + QUERY_INTERVAL_MS)).toBe(0);
  });
});
