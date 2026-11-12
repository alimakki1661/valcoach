/**
 * metaStore.js
 *
 * Loads data/meta.json once at server start and exposes it as a singleton.
 * If the file is missing or unreadable, the store returns null — callers must
 * handle null gracefully so the existing app flow is never broken.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const META_PATH = path.join(__dirname, '..', 'data', 'meta.json');

let meta = null; // null until loaded, or if file is absent

export async function loadMeta() {
  try {
    const raw = await fs.readFile(META_PATH, 'utf8');
    meta = JSON.parse(raw);
    const { players, totalMatches } = meta.sample ?? {};
    console.log(`Meta snapshot loaded: ${players} players, ${totalMatches} matches (${meta.generatedAt})`);
  } catch (err) {
    console.warn(`Meta snapshot not available (will run without it): ${err.message}`);
    meta = null;
  }
}

/** Returns the loaded meta object, or null if unavailable. */
export function getMeta() {
  return meta;
}
