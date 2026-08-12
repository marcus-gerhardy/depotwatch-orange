// Local-first file handling.
//
// Primary mode: File System Access API (Chrome/Edge/Opera) — the user picks the
// portfolio file once, we keep the handle and write changes back automatically.
// Fallback (Safari/Firefox): <input type="file"> to open, Blob download to save.

export type FileMode = "fsa" | "fallback";

interface FsaWindow extends Window {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
}

export function detectFileMode(): FileMode {
  if (typeof window === "undefined") return "fallback";
  const w = window as FsaWindow;
  return typeof w.showOpenFilePicker === "function" &&
    typeof w.showSaveFilePicker === "function"
    ? "fsa"
    : "fallback";
}

const PICKER_TYPES = [
  {
    description: "DepotWatch Portfolio",
    accept: { "application/json": [".dwp", ".json"] },
  },
];

export async function pickFileForOpen(): Promise<{
  handle: FileSystemFileHandle | null;
  file: File;
} | null> {
  const w = window as FsaWindow;
  if (typeof w.showOpenFilePicker === "function") {
    try {
      const [handle] = await w.showOpenFilePicker({ types: PICKER_TYPES });
      return { handle, file: await handle.getFile() };
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return null;
      throw e;
    }
  }
  // Fallback: hidden input element.
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".dwp,.json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { handle: null, file } : null);
    };
    // Cancel never fires reliably; also resolve null when focus returns.
    window.addEventListener(
      "focus",
      () => setTimeout(() => resolve(null), 500),
      { once: true },
    );
    input.click();
  });
}

export async function pickFileForCreate(): Promise<FileSystemFileHandle | null> {
  const w = window as FsaWindow;
  if (typeof w.showSaveFilePicker !== "function") return null;
  try {
    return await w.showSaveFilePicker({
      suggestedName: "portfolio.dwp",
      types: PICKER_TYPES,
    });
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return null;
    throw e;
  }
}

export async function writeToHandle(
  handle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export function downloadAsFile(
  content: string,
  filename: string,
  /** The portfolio file is JSON; a tax export is CSV. */
  mime = "application/json",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
