const ALGO = "AES-GCM";
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

let cachedKey: CryptoKey | null = null;

function getKeyMaterial(): string {
  const key = import.meta.env.VITE_ENCRYPTION_KEY;
  if (!key || typeof key !== "string" || key.length < 32) {
    return "";
  }
  return key;
}

export function isEncryptionEnabled(): boolean {
  return getKeyMaterial().length >= 32;
}

async function deriveKey(): Promise<CryptoKey> {
  if (cachedKey) {
    return cachedKey;
  }

  const material = getKeyMaterial();
  const encoder = new TextEncoder();
  const rawKey = await crypto.subtle.importKey("raw", encoder.encode(material).slice(0, 32), ALGO, false, [
    "encrypt",
    "decrypt",
  ]);
  cachedKey = rawKey;
  return rawKey;
}

export async function encryptField(plaintext: string): Promise<string> {
  if (!plaintext || !isEncryptionEnabled()) {
    return plaintext;
  }

  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);

  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  return `enc:${btoa(String.fromCharCode(...combined))}`;
}

export async function decryptField(stored: string): Promise<string> {
  if (!stored || !stored.startsWith("enc:") || !isEncryptionEnabled()) {
    return stored;
  }

  try {
    const key = await deriveKey();
    const raw = Uint8Array.from(atob(stored.slice(4)), (c) => c.charCodeAt(0));

    const iv = raw.slice(0, IV_LENGTH);
    const ciphertext = raw.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return stored;
  }
}

export async function encryptNullable(value: string | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }
  return encryptField(value);
}

export async function decryptNullable(value: string | null | undefined): Promise<string | null> {
  if (!value) {
    return null;
  }
  return decryptField(value);
}
