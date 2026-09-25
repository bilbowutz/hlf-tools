// Verschlüsselung der Inhalte (Fotos + Beladeliste).
// Format jeder .enc-Datei: 12 Byte IV + AES-256-GCM-Ciphertext.
// Der Schlüssel wird per PBKDF2 aus dem Passwort und dem Salt in data/meta.json abgeleitet.

const KEY_STORAGE = 'hlf.key';

export const b64 = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  dec: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

export async function loadMeta(base = '') {
  const res = await fetch(base + 'data/meta.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('meta.json fehlt');
  return res.json();
}

export async function deriveKey(password, meta) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64.dec(meta.salt), iterations: meta.iterations },
    material, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return out;
}

export async function decrypt(key, buf) {
  const bytes = new Uint8Array(buf);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
}

export async function fetchDecrypted(key, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return decrypt(key, await res.arrayBuffer());
}

export async function fetchContent(key, base = '') {
  const plain = await fetchDecrypted(key, base + 'data/content.enc');
  return JSON.parse(new TextDecoder().decode(plain));
}

// Pfad eines Fotos; `rev` ändert sich, wenn das Foto ersetzt wird (neu laden statt Cache)
export function imagePath(imageId, rev) {
  return `data/img/${imageId}.enc${rev ? `?v=${rev}` : ''}`;
}

export async function fetchImageUrl(key, imageId, rev) {
  const plain = await fetchDecrypted(key, imagePath(imageId, rev));
  return URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }));
}

// Schlüssel lokal merken, damit man das Passwort nur einmal eingeben muss.
export async function rememberKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  try { localStorage.setItem(KEY_STORAGE, b64.enc(raw)); } catch {}
}

export async function recallKey() {
  let stored = null;
  try { stored = localStorage.getItem(KEY_STORAGE); } catch {}
  if (!stored) return null;
  return crypto.subtle.importKey('raw', b64.dec(stored), 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export function forgetKey() {
  try { localStorage.removeItem(KEY_STORAGE); } catch {}
}
