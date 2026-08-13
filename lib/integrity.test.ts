/** @vitest-environment jsdom */
// The file's own checksum. What matters is that it survives an honest round
// trip and fails a dishonest one, and that a file written before it existed is
// not treated as damaged.

import { describe, expect, it } from "vitest";
import {
  FileIntegrityError,
  FileUnreadableError,
  looksTruncated,
  payloadForHash,
  stampIntegrity,
  verifyIntegrity,
} from "./integrity";
import { emptyPortfolio } from "./types";

function file() {
  const p = emptyPortfolio();
  p.wallets = [
    {
      id: "w1",
      name: "Exchange",
      type: "exchange",
      accounts: [
        {
          id: "a1",
          name: "Spot",
          transactions: [
            {
              id: "t1",
              type: "buy",
              date: "2025-01-01T00:00:00.000Z",
              amountBtc: "0.1",
              pricePerBtcEur: "50000",
              note: "",
            },
          ],
        },
      ],
    },
  ];
  return p;
}

describe("stamping and verifying", () => {
  it("verifies what it wrote, through a JSON round trip", async () => {
    const stamped = await stampIntegrity(file());
    // Exactly the trip a real file takes: serialize, write, read, parse.
    const parsed = JSON.parse(JSON.stringify(stamped, null, 2));
    expect(await verifyIntegrity(parsed)).toBe("ok");
  });

  it("notices a single changed digit", async () => {
    const stamped = await stampIntegrity(file());
    const text = JSON.stringify(stamped, null, 2).replace('"0.1"', '"1.0"');
    expect(await verifyIntegrity(JSON.parse(text))).toBe("mismatch");
  });

  it("notices a truncated object that still parses", async () => {
    const stamped = await stampIntegrity(file());
    const parsed = JSON.parse(JSON.stringify(stamped));
    parsed.wallets[0].accounts[0].transactions = [];
    expect(await verifyIntegrity(parsed)).toBe("mismatch");
  });

  it("treats a file without a stamp as older, not as damaged", async () => {
    expect(await verifyIntegrity(file())).toBe("missing");
    expect(await verifyIntegrity(null)).toBe("missing");
    expect(await verifyIntegrity({ integrity: { algo: "MD5", hash: "x" } })).toBe(
      "missing",
    );
  });

  it("never hashes the stamp itself", async () => {
    const once = await stampIntegrity(file());
    // Stamping an already stamped object must produce the same hash, or every
    // save would invalidate the previous one.
    const twice = await stampIntegrity(once);
    expect((twice as { integrity: { hash: string } }).integrity.hash).toBe(
      (once as { integrity: { hash: string } }).integrity.hash,
    );
    expect(payloadForHash(once)).not.toContain("integrity");
  });
});

describe("recognising a broken file", () => {
  it("spots a write that stopped halfway", () => {
    expect(looksTruncated('{"version":"1.0","wallets":[{"id":"w1"')).toBe(true);
    expect(looksTruncated('{"version":"1.0"}')).toBe(false);
    expect(looksTruncated('{"version":"1.0"}\n')).toBe(false);
    expect(looksTruncated("")).toBe(false);
  });

  it("carries what it read, so opening anyway can be a deliberate choice", () => {
    const err = new FileIntegrityError({ version: "1.0" });
    expect(err.portfolio).toEqual({ version: "1.0" });
    expect(new FileUnreadableError(true).truncated).toBe(true);
  });
});
