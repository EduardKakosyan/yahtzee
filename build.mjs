/**
 * Bundles src/ into public/ as plain static files.
 * - rules.js + app.js become one classic script, so the app never depends on module
 *   resolution when served from a sub-path.
 * - the service worker's cache name is stamped with a hash of the shipped assets, so a
 *   new build takes over on the next launch instead of stranding anyone on a stale cache.
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, 'src');
const out = join(root, 'public');
const iconDir = join(out, 'icons');

const rules = readFileSync(join(srcDir, 'rules.js'), 'utf8').replace(/^export\s+/gm, '');
const app = readFileSync(join(srcDir, 'app.js'), 'utf8')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/rules\.js';?[ \t]*\n/, '');
const bundle = `/* Camp Yahtzee — bundled build; source lives in src/. */\n(function () {\n'use strict';\n\n${rules}\n\n${app}\n})();\n`;

const assets = {
  'index.html': readFileSync(join(srcDir, 'index.html'), 'utf8'),
  'styles.css': readFileSync(join(srcDir, 'styles.css'), 'utf8'),
  'app.js': bundle,
  'manifest.webmanifest': readFileSync(join(srcDir, 'manifest.webmanifest'), 'utf8'),
};

const hash = createHash('sha256');
for (const name of Object.keys(assets).sort()) hash.update(assets[name]);
const icons = existsSync(iconDir) ? readdirSync(iconDir).filter((f) => f.endsWith('.png')).sort() : [];
for (const f of icons) hash.update(readFileSync(join(iconDir, f)));
const version = hash.digest('hex').slice(0, 12);

assets['sw.js'] = readFileSync(join(srcDir, 'sw.js'), 'utf8').replaceAll('__VERSION__', version);

mkdirSync(out, { recursive: true });
for (const [name, body] of Object.entries(assets)) writeFileSync(join(out, name), body);
console.log(`built ${Object.keys(assets).length} files -> public/ (build ${version}, ${icons.length} icons)`);
