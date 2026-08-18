/** @vitest-environment jsdom */
// Deciding whether the file on disk is still the one that was opened (§6.8).
//
// The judgement call worth pinning: a timestamp that moved without the
// contents changing is *not* a conflict. A sync client re-downloading the same
// bytes, a metadata touch, a backup tool — all of those move the clock, and
// warning about each one would teach people to dismiss the dialog unread,
// which is exactly when the real conflict arrives.

import { describe, expect, it } from "vitest";
import { fingerprintFile, hasChanged, type FileFingerprint } from "./fileWatch";

const fp = (o: Partial<FileFingerprint>): FileFingerprint => ({
  lastModified: 1000,
  size: 100,
  hash: "aaa",
  ...o,
});

describe("comparing a file against what was read", () => {
  it("says nothing changed when the contents are the same", () => {
    // Different clock, same bytes: the file was rewritten with what it already
    // held. Nothing to decide, so nothing to ask about.
    expect(hasChanged(fp({}), fp({ lastModified: 99999 }))).toBe(false);
  });

  it("reports a change when the contents differ", () => {
    expect(hasChanged(fp({}), fp({ hash: "bbb" }))).toBe(true);
  });

  it("falls back to size and time where there is no hash", () => {
    // No WebCrypto (a page served over plain http): weaker, but it still
    // catches the case that matters — somebody else wrote the file.
    expect(hasChanged(fp({ hash: null }), fp({ hash: null }))).toBe(false);
    expect(hasChanged(fp({ hash: null }), fp({ hash: null, size: 200 }))).toBe(true);
    expect(
      hasChanged(fp({ hash: null }), fp({ hash: null, lastModified: 2000 })),
    ).toBe(true);
  });
});

describe("fingerprinting", () => {
  it("reads size, time and hash off the file itself", async () => {
    const file = new File(["hello"], "portfolio.dwp", { lastModified: 4242 });
    const print = await fingerprintFile(file);

    expect(print.size).toBe(5);
    expect(print.lastModified).toBe(4242);
    // jsdom has no WebCrypto digest; a missing hash is a state, not a failure.
    expect(print.hash === null || print.hash.length === 64).toBe(true);
  });
});
