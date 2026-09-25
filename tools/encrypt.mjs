#!/usr/bin/env node
// Verschlüsselt Beladeliste und Fotos für die Website.
//
//   node tools/encrypt.mjs --password <PW> --content <content.json> [--images <ordner>]
//
// Klartext-Dateien NIE ins Repo legen – nur die erzeugten .enc-Dateien in data/.
// Alternativ geht alles auch im Browser über admin.html.

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { b64, deriveKey, encrypt, decrypt } from '../js/crypto.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));

if (!args.password) {
  console.error('Aufruf: node tools/encrypt.mjs --password <PW> --content <content.json> [--images <ordner>]');
  process.exit(1);
}

const metaPath = join(root, 'data/meta.json');
let meta;
if (existsSync(metaPath)) {
  meta = JSON.parse(await readFile(metaPath, 'utf8'));
} else {
  meta = { version: 1, iterations: 250000, salt: b64.enc(crypto.getRandomValues(new Uint8Array(16))) };
  await writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log('neu: data/meta.json');
}

const key = await deriveKey(args.password, meta);

// Falsches Passwort früh erkennen, statt Dateien mit anderem Schlüssel zu mischen.
const contentEnc = join(root, 'data/content.enc');
if (existsSync(contentEnc)) {
  try { await decrypt(key, await readFile(contentEnc)); }
  catch { console.error('Passwort passt nicht zu den vorhandenen Daten.'); process.exit(1); }
}

if (args.content) {
  const json = JSON.parse(await readFile(args.content, 'utf8'));
  await writeFile(contentEnc, await encrypt(key, new TextEncoder().encode(JSON.stringify(json))));
  console.log('neu: data/content.enc');
}

if (args.images) {
  await mkdir(join(root, 'data/img'), { recursive: true });
  for (const f of await readdir(args.images)) {
    if (!['.jpg', '.jpeg'].includes(extname(f).toLowerCase())) continue;
    const id = basename(f, extname(f)).toLowerCase();
    await writeFile(join(root, 'data/img', id + '.enc'), await encrypt(key, await readFile(join(args.images, f))));
    console.log(`neu: data/img/${id}.enc`);
  }
}
