// Password-based file encryption: AES-256-GCM with a PBKDF2-derived key.
// The encrypted file is a small JSON envelope so future versions can migrate
// KDF parameters without breaking old files.

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedEnvelope {
  format: "depotwatch-orange";
  encrypted: true;
  kdf: { algo: "PBKDF2-SHA256"; iterations: number; salt: string };
  cipher: { algo: "AES-256-GCM"; iv: string };
  payload: string; // base64 ciphertext
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPortfolio(
  json: string,
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(json),
  );
  const envelope: EncryptedEnvelope = {
    format: "depotwatch-orange",
    encrypted: true,
    kdf: {
      algo: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
    },
    cipher: { algo: "AES-256-GCM", iv: toBase64(iv) },
    payload: toBase64(ciphertext),
  };
  return JSON.stringify(envelope);
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Decryption failed — wrong password or corrupted file");
    this.name = "WrongPasswordError";
  }
}

export function isEncryptedEnvelope(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return parsed?.format === "depotwatch-orange" && parsed?.encrypted === true;
  } catch {
    return false;
  }
}

export async function decryptPortfolio(
  fileText: string,
  password: string,
): Promise<string> {
  const envelope = JSON.parse(fileText) as EncryptedEnvelope;
  const salt = fromBase64(envelope.kdf.salt);
  const iv = fromBase64(envelope.cipher.iv);
  const key = await deriveKey(password, salt, envelope.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      fromBase64(envelope.payload) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPasswordError();
  }
}
