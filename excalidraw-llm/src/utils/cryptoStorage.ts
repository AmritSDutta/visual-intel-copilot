/**
 * Web Crypto Storage (AES-GCM-256)
 * 
 * Provides client-side encryption at rest for sensitive API keys stored in localStorage.
 * Uses native browser Web Cryptography API (window.crypto.subtle) with non-extractable keys.
 */

const DB_NAME = 'ExcalidrawSecureVault';
const STORE_NAME = 'keys';
const KEY_ID = 'device_master_key_v1';
const PREFIX = '__ENC__:v1:';

let cachedCryptoKey: CryptoKey | null = null;

/**
 * Open or create the IndexedDB store for holding the non-extractable master CryptoKey.
 */
function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves or generates a non-extractable AES-GCM 256-bit CryptoKey.
 */
async function getMasterKey(): Promise<CryptoKey> {
  if (cachedCryptoKey) {
    return cachedCryptoKey;
  }

  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Cryptography API is not available');
  }

  try {
    const db = await openKeyDb();
    const existingKey = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_ID);
      req.onsuccess = () => resolve(req.result as CryptoKey);
      req.onerror = () => reject(req.error);
    });

    if (existingKey) {
      cachedCryptoKey = existingKey;
      return existingKey;
    }

    // Generate a fresh 256-bit AES-GCM non-extractable key
    const newKey = await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      false, // non-extractable: raw key bytes cannot be extracted even via XSS
      ['encrypt', 'decrypt']
    );

    // Persist key object into IndexedDB
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(newKey, KEY_ID);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    cachedCryptoKey = newKey;
    return newKey;
  } catch {
    // Fallback: in-memory key generation if IndexedDB is blocked
    const fallbackKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    cachedCryptoKey = fallbackKey;
    return fallbackKey;
  }
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts a plaintext string using AES-GCM-256 with a random 12-byte IV.
 */
export async function encryptString(plainText: string): Promise<string> {
  if (!plainText) return '';
  try {
    const key = await getMasterKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plainText);

    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const base64Iv = bufferToBase64(iv);
    const base64Cipher = bufferToBase64(cipherBuffer);

    return `${PREFIX}${base64Iv}:${base64Cipher}`;
  } catch (err) {
    console.error('[CryptoStorage] Encryption error:', err);
    return plainText;
  }
}

/**
 * Decrypts an encrypted string (`__ENC__:v1:...`) back to plaintext.
 * Returns legacy unencrypted strings directly.
 */
export async function decryptString(cipherText: string): Promise<string> {
  if (!cipherText) return '';
  if (!cipherText.startsWith(PREFIX)) {
    // Legacy plaintext string
    return cipherText;
  }

  try {
    const key = await getMasterKey();
    const payload = cipherText.substring(PREFIX.length);
    const [base64Iv, base64Cipher] = payload.split(':');

    if (!base64Iv || !base64Cipher) {
      return '';
    }

    const iv = base64ToBuffer(base64Iv);
    const cipherBuffer = base64ToBuffer(base64Cipher);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      key,
      cipherBuffer as any
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.warn('[CryptoStorage] Decryption failed or invalid key context:', err);
    return '';
  }
}

/**
 * Saves a sensitive value to localStorage encrypted with AES-GCM-256.
 */
export async function setItemEncrypted(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!value) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    return;
  }

  try {
    const encrypted = await encryptString(value);
    localStorage.setItem(key, encrypted);
    sessionStorage.setItem(key, value); // Ephemeral plaintext in memory session
  } catch {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  }
}

/**
 * Retrieves and decrypts a sensitive value from localStorage or sessionStorage.
 */
export async function getItemEncrypted(key: string): Promise<string> {
  if (typeof window === 'undefined') return '';

  // Check sessionStorage first (ephemeral in memory for current tab)
  const sessionVal = sessionStorage.getItem(key);
  if (sessionVal && !sessionVal.startsWith(PREFIX)) {
    return sessionVal;
  }

  // Read from localStorage and decrypt
  const storedVal = localStorage.getItem(key);
  if (!storedVal) return '';

  const decrypted = await decryptString(storedVal);

  // Auto-upgrade legacy plaintext in localStorage to encrypted format
  if (decrypted && !storedVal.startsWith(PREFIX)) {
    setItemEncrypted(key, decrypted).catch(() => {});
  }

  if (decrypted) {
    sessionStorage.setItem(key, decrypted);
  }

  return decrypted;
}

/**
 * Removes a sensitive key from both localStorage and sessionStorage.
 */
export function removeItem(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}
