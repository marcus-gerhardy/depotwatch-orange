"use client";

// Where backups actually go (CLAUDE.md §6.5).
//
// **A file handle cannot write next to itself.** The handle the app gets from
// `showSaveFilePicker` grants access to that one file and nothing around it —
// no sibling, no directory listing. Writing timestamped copies therefore needs
// a *directory* handle, which the user picks once via `showDirectoryPicker`.
// That is the whole reason the backup folder is a separate, explicit setup step
// rather than something the app could arrange by itself.
//
// The handle is stored in **IndexedDB**, because a `FileSystemDirectoryHandle`
// is structured-cloneable but not serialisable: it survives `structuredClone`
// and therefore IndexedDB, and does not survive `JSON.stringify` and therefore
// not localStorage. Permission does not survive a reload with it, so it is
// re-requested — which browsers only allow from a user gesture, hence the
// explicit "reconnect" button in the settings.
//
// Without the File System Access API none of this exists, and the app says so
// (§6.5): backups are then downloads the user triggers by hand. Pretending to
// have automatic backups that a browser cannot deliver would be the one truly
// dangerous option.

const DB_NAME = "depotwatch";
const DB_VERSION = 1;
const STORE = "handles";
const BACKUP_DIR_KEY = "backupDirectory";

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
    id?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}

/** Can this browser hold a backup folder at all? */
export function supportsBackupDirectory(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function"
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as T) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Handles carry these; the types do not know about them yet. */
interface PermissionCapable {
  queryPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
}

export type DirectoryPermission = "granted" | "prompt" | "denied";

/** Whether we may write there right now, without asking. */
export async function directoryPermission(
  handle: FileSystemDirectoryHandle,
): Promise<DirectoryPermission> {
  const h = handle as unknown as PermissionCapable;
  if (typeof h.queryPermission !== "function") return "granted";
  try {
    const state = await h.queryPermission({ mode: "readwrite" });
    return state === "granted" ? "granted" : state === "denied" ? "denied" : "prompt";
  } catch {
    return "prompt";
  }
}

/**
 * Ask for permission. Only ever call this from a click: a browser rejects the
 * prompt outside a user gesture, which would turn "reconnect" into a silent
 * failure.
 */
export async function requestDirectoryPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const h = handle as unknown as PermissionCapable;
  if (typeof h.requestPermission !== "function") return true;
  try {
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/** Let the user pick the backup folder. Returns null when they cancelled. */
export async function pickBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const w = window as DirectoryPickerWindow;
  if (typeof w.showDirectoryPicker !== "function") return null;
  try {
    const handle = await w.showDirectoryPicker({ mode: "readwrite", id: "dw-backups" });
    try {
      await idbPut(BACKUP_DIR_KEY, handle);
    } catch {
      // No IndexedDB (private mode): the folder works for this session and has
      // to be picked again next time, which beats refusing it outright.
    }
    return handle;
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return null;
    throw e;
  }
}

export async function storedBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    return await idbGet<FileSystemDirectoryHandle>(BACKUP_DIR_KEY);
  } catch {
    return null; // storage unavailable (private mode) — the folder is simply not remembered
  }
}

export async function forgetBackupDirectory(): Promise<void> {
  try {
    await idbDelete(BACKUP_DIR_KEY);
  } catch {
    // Nothing to do: the handle is gone from the app either way.
  }
}

// ------------------------------------------------------------------ files

export async function writeBackupFile(
  dir: FileSystemDirectoryHandle,
  fileName: string,
  content: string,
): Promise<void> {
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function readBackupFile(
  dir: FileSystemDirectoryHandle,
  fileName: string,
): Promise<string> {
  const handle = await dir.getFileHandle(fileName);
  return (await handle.getFile()).text();
}

export async function deleteBackupFile(
  dir: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  await dir.removeEntry(fileName);
}

/** Directory handles are iterable, but the DOM types are behind on this. */
interface IterableDirectory {
  values: () => AsyncIterableIterator<FileSystemHandle>;
}

/** Every file in the folder, with its size — the caller decides what is a backup. */
export async function listDirectoryFiles(
  dir: FileSystemDirectoryHandle,
): Promise<{ name: string; sizeBytes: number }[]> {
  const out: { name: string; sizeBytes: number }[] = [];
  for await (const entry of (dir as unknown as IterableDirectory).values()) {
    if (entry.kind !== "file") continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    out.push({ name: entry.name, sizeBytes: file.size });
  }
  return out;
}
