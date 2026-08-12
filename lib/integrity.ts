// Integrity of the portfolio file (CLAUDE.md §6.5).
//
// A single file holds everything, so the failure that matters is not "somebody
// changed a number" but "the bytes are not what we wrote": a write interrupted
// by a crash, a sync client that merged two versions, a truncated copy off a
// USB stick. A checksum written next to the data catches all three, and it
// catches them **at open time** rather than three months later when a figure
// looks odd.
//
// It is a checksum, not a signature: anybody who can edit the file can compute
// a new one. That is the honest scope, and it is the useful one — the threat
// here is corruption, not forgery.
//
// The stamp lives inside the payload (`integrity`), which means it is covered
// by the encryption like everything else and works identically for an
// encrypted and an unencrypted file. Hashing is therefore self-referential and
// has exactly one rule: **the stamp is never part of what is hashed.**

/** How a file records what its contents should hash to. */
export interface IntegrityStamp {
  algo: "SHA-256";
  hash: string;
}

export type IntegrityResult =
  /** The file carries a stamp and the contents match it. */
  | "ok"
  /** No stamp — every file written before this existed. Not an error. */
  | "missing"
  /** A stamp that does not match: the file is not what was written. */
  | "mismatch"
  /** No WebCrypto here (an insecure context), so nothing could be checked. */
  | "unavailable";

/**
 * The exact text a checksum is taken over: the object without its own stamp,
 * serialized the way the file is. Key order comes from the object itself and
 * survives a JSON round trip, so re-serializing what was parsed reproduces the
 * bytes that were hashed — which is why verification has to run on the **raw
 * parsed file**, before any merging with defaults reorders anything.
 */
export function payloadForHash(portfolio: object): string {
  const rest: Record<string, unknown> = { ...(portfolio as Record<string, unknown>) };
  delete rest.integrity;
  return JSON.stringify(rest, null, 2);
}

function hasSubtle(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stamp a portfolio object with the checksum of its own contents. Returns the
 * object unchanged where WebCrypto is unavailable: a missing stamp is a state
 * the reader understands, and refusing to save would be the wrong trade.
 */
export async function stampIntegrity<T extends object>(portfolio: T): Promise<T> {
  if (!hasSubtle()) return portfolio;
  const hash = await sha256Hex(payloadForHash(portfolio));
  return { ...portfolio, integrity: { algo: "SHA-256", hash } as IntegrityStamp };
}

/** Check a **raw parsed** file against its own stamp (see `payloadForHash`). */
export async function verifyIntegrity(parsed: unknown): Promise<IntegrityResult> {
  if (typeof parsed !== "object" || parsed === null) return "missing";
  const stamp = (parsed as { integrity?: IntegrityStamp }).integrity;
  if (!stamp || typeof stamp.hash !== "string" || stamp.algo !== "SHA-256") {
    return "missing";
  }
  if (!hasSubtle()) return "unavailable";
  const actual = await sha256Hex(payloadForHash(parsed as object));
  return actual === stamp.hash ? "ok" : "mismatch";
}

/**
 * A file that could not be read at all. Separate from the integrity error
 * because it needs a different sentence: this one is not "the contents are
 * wrong" but "this is not a portfolio file, or not all of it".
 */
export class FileUnreadableError extends Error {
  /** Truncated files are the common case and deserve their own wording. */
  readonly truncated: boolean;
  constructor(truncated: boolean) {
    super(truncated ? "file appears truncated" : "file could not be parsed");
    this.name = "FileUnreadableError";
    this.truncated = truncated;
  }
}

/** The contents do not match the checksum the file carries. */
export class FileIntegrityError extends Error {
  /**
   * What the file *says* it contains. Carried along so the app can offer to
   * open it anyway as a deliberate choice — the rule is that damaged data is
   * never processed silently, not that it may never be looked at.
   */
  readonly portfolio: unknown;
  constructor(portfolio: unknown) {
    super("integrity check failed");
    this.name = "FileIntegrityError";
    this.portfolio = portfolio;
  }
}

/**
 * Does this text look like it was cut off mid-write? A JSON document always
 * ends in `}`; a file that stops in the middle of a transaction does not.
 */
export function looksTruncated(text: string): boolean {
  return text.trim().length > 0 && !text.trimEnd().endsWith("}");
}
