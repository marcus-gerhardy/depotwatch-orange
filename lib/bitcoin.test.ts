import { describe, expect, it } from "vitest";
import {
  isValidBitcoinAddress,
  isValidTxid,
  normalizeBitcoinAddress,
  normalizeTxid,
} from "./bitcoin";

const TXID = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";

describe("txid", () => {
  it("accepts exactly 64 hex characters", () => {
    expect(isValidTxid(TXID)).toBe(true);
  });

  it("rejects wrong length or non-hex characters", () => {
    expect(isValidTxid(TXID.slice(0, 63))).toBe(false);
    expect(isValidTxid(`${TXID}a`)).toBe(false);
    expect(isValidTxid(TXID.replace("4a", "zz"))).toBe(false);
    expect(isValidTxid("")).toBe(false);
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeTxid(`  ${TXID.toUpperCase()} \n`)).toBe(TXID);
    expect(isValidTxid(normalizeTxid(TXID.toUpperCase()))).toBe(true);
  });
});

describe("bitcoin addresses", () => {
  it("accepts legacy P2PKH and P2SH", () => {
    expect(isValidBitcoinAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toBe(true);
    expect(isValidBitcoinAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(true);
  });

  it("accepts bech32 SegWit v0 (P2WPKH and P2WSH)", () => {
    expect(isValidBitcoinAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(
      true,
    );
    expect(
      isValidBitcoinAddress(
        "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3",
      ),
    ).toBe(true);
  });

  it("accepts bech32m Taproot", () => {
    expect(
      isValidBitcoinAddress(
        "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
      ),
    ).toBe(true);
  });

  it("rejects a broken bech32 checksum", () => {
    expect(isValidBitcoinAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5")).toBe(
      false,
    );
  });

  it("rejects the wrong encoding for the witness version", () => {
    // v0 must be bech32, not bech32m (BIP-350 test vector).
    expect(
      isValidBitcoinAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh"),
    ).toBe(false);
    // v1 must be bech32m, not bech32.
    expect(
      isValidBitcoinAddress("bc1pw5dgrnzv"),
    ).toBe(false);
  });

  it("handles bech32 case rules: all-upper is valid, mixed case is not", () => {
    const upper = "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4";
    expect(isValidBitcoinAddress(upper)).toBe(true);
    expect(isValidBitcoinAddress("bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(
      false,
    );
  });

  it("normalizes an all-uppercase bech32 address to lower case, base58 untouched", () => {
    expect(
      normalizeBitcoinAddress("  BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4 "),
    ).toBe("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
    expect(normalizeBitcoinAddress(" 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2 ")).toBe(
      "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
    );
  });

  it("rejects empty, truncated and clearly invalid values", () => {
    expect(isValidBitcoinAddress("")).toBe(false);
    expect(isValidBitcoinAddress("not-an-address")).toBe(false);
    expect(isValidBitcoinAddress("bc1")).toBe(false);
    // Base58 excludes the ambiguous characters 0, O, I and l.
    expect(isValidBitcoinAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVI0")).toBe(false);
  });
});
