"use client";

// Has the portfolio file changed behind our back? (CLAUDE.md §6.8)
//
// The premise of this app is one file the user owns, and people keep such a
// file where their other important files live — which today usually means a
// synced folder. Two devices, or one device and a sync client, then write the
// same file, and the app's own save would silently win: the version it holds
// in memory goes to disk, and whatever arrived in between is gone without
// anybody being told. That is the one loss this app cannot shrug off.
//
// So the file is fingerprinted when it is read, and the fingerprint is checked
// again before every write. Cheap, and honest about what it can know:
//
//  • `lastModified` and `size` come free with the handle. A sync client that
//    rewrites the file always changes at least the timestamp;
//  • the SHA-256 of the raw bytes is what actually decides. A timestamp can
//    move without the contents changing (a re-download of the same version, a
//    metadata touch), and warning about that would train people to click the
//    dialog away. Same hash, same file, no conflict — whatever the clock says.
//
// Without the File System Access API there is no handle to re-read, so there
// is nothing to compare and nothing to warn about: saving is a download the
// user places themselves. That is a missing capability, not an error.

import { sha256Hex } from "./integrity";

export interface FileFingerprint {
  /** Epoch ms of the file's own last-modified stamp. */
  lastModified: number;
  size: number;
  /**
   * SHA-256 of the raw bytes, or null where WebCrypto is unavailable (a page
   * served over plain http). The comparison then falls back to size and
   * timestamp, which is weaker but still catches the case that matters.
   */
  hash: string | null;
}

export async function fingerprintFile(file: File): Promise<FileFingerprint> {
  const text = await file.text();
  return {
    lastModified: file.lastModified,
    size: file.size,
    hash: await sha256Hex(text).catch(() => null),
  };
}

/** Read the file behind a handle again, without touching it. */
export async function fingerprintHandle(
  handle: FileSystemFileHandle,
): Promise<FileFingerprint | null> {
  try {
    return await fingerprintFile(await handle.getFile());
  } catch {
    // Permission withdrawn, file deleted, drive unplugged: not a conflict, and
    // not something to block a save on. The write itself will report it.
    return null;
  }
}

/**
 * Did the file change since it was fingerprinted?
 *
 * The hash decides where both sides have one: a timestamp that moved without
 * the contents changing is not a conflict, and treating it as one would teach
 * people to dismiss the dialog unread. Without a hash, size and timestamp are
 * all there is.
 */
export function hasChanged(before: FileFingerprint, now: FileFingerprint): boolean {
  if (before.hash !== null && now.hash !== null) return before.hash !== now.hash;
  return before.size !== now.size || before.lastModified !== now.lastModified;
}
