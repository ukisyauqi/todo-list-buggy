#!/usr/bin/env node
/**
 * Lint ringan tanpa dependency eksternal untuk website statis ini.
 *
 * Yang diperiksa:
 *  1. Semua <script> inline harus valid secara sintaks.
 *  2. Semua file lokal yang dirujuk (src/href) harus ada.
 *  3. Setiap getElementById('x') harus punya elemen dengan id="x" di HTML.
 *  4. Tidak boleh ada sisa statement debugging (debugger / console.log / FIXME).
 *  5. Struktur HTML dasar harus lengkap dan tag-nya berpasangan.
 *
 * Exit code non-zero bila ada error.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_FILE = join(ROOT, 'index.html');
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/* ------------------------------------------------------------------ *
 * 1. Kumpulkan file sumber yang akan diperiksa
 * ------------------------------------------------------------------ */
function collectJsFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectJsFiles(full, acc);
    else if (/\.m?js$/.test(entry)) acc.push(full);
  }
  return acc;
}

/* ------------------------------------------------------------------ *
 * 2. Cek sintaks file JS (skrip build/lint/test)
 * ------------------------------------------------------------------ */
for (const file of collectJsFiles(ROOT)) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    fail(`Sintaks JS tidak valid: ${relative(ROOT, file)}\n${err.stderr?.toString().trim() || err.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * 3. Cek HTML: script inline, referensi file lokal, getElementById, tag
 * ------------------------------------------------------------------ */
if (!existsSync(HTML_FILE)) {
  fail('index.html tidak ditemukan');
} else {
  const html = readFileSync(HTML_FILE, 'utf8');

  // 3a. Script inline harus valid secara sintaks
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (inlineScripts.length === 0) fail('Tidak ada script inline di index.html');
  inlineScripts.forEach((match, i) => {
    try {
      new Script(match[1], { filename: `index.html#inline-script-${i + 1}` });
    } catch (err) {
      fail(`Script inline #${i + 1} di index.html tidak valid secara sintaks: ${err.message}`);
    }
  });

  // 3b. Referensi file lokal (src/href) harus ada
  const localRefs = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/gi)]
    .map((m) => m[1])
    .filter((ref) => !/^(?:https?:)?\/\//i.test(ref) && !ref.startsWith('#') && !ref.startsWith('data:'));
  for (const ref of localRefs) {
    const target = resolve(dirname(HTML_FILE), ref.split(/[?#]/)[0]);
    if (!existsSync(target)) fail(`Referensi file lokal tidak ditemukan: "${ref}"`);
  }

  // 3c. getElementById harus cocok dengan id yang ada di HTML
  const htmlIds = new Set([...html.matchAll(/\bid\s*=\s*"([^"]+)"/gi)].map((m) => m[1]));
  for (const script of inlineScripts) {
    for (const match of script[1].matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!htmlIds.has(match[1])) {
        fail(`getElementById('${match[1]}') tidak menemukan elemen dengan id="${match[1]}"`);
      }
    }
  }

  // 3d. Sisa statement debugging
  for (const script of inlineScripts) {
    const lines = script[1].split('\n');
    lines.forEach((line, i) => {
      if (/^\s*debugger\b/.test(line)) fail(`Statement "debugger" tersisa di script inline baris ${i + 1}`);
      if (/\bconsole\.(log|debug)\s*\(/.test(line)) fail(`Statement "console.log/debug" tersisa di script inline baris ${i + 1}`);
      if (/\bFIXME\b/.test(line)) fail(`Catatan "FIXME" tersisa di script inline baris ${i + 1}`);
    });
  }

  // 3e. Struktur dasar HTML
  for (const required of ['<html', '<head', '<body', '<title']) {
    if (!html.toLowerCase().includes(required)) fail(`index.html tidak memiliki tag ${required}>`);
  }

  // 3f. Tag HTML harus berpasangan
  const tagless = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const stack = [];
  for (const match of tagless.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g)) {
    const [, closing, tag, selfClosing] = match;
    const name = tag.toLowerCase();
    if (VOID_TAGS.has(name) || selfClosing) continue;
    if (closing) {
      const open = stack.pop();
      if (open !== name) {
        fail(`Tag HTML tidak berpasangan: </${name}> menutup <${open ?? 'kosong'}>`);
        break;
      }
    } else {
      stack.push(name);
    }
  }
  if (stack.length > 0) fail(`Tag HTML tidak ditutup: ${stack.join(', ')}`);
}

/* ------------------------------------------------------------------ *
 * Laporan
 * ------------------------------------------------------------------ */
warnings.forEach((w) => console.warn(`WARN  ${w}`));
if (errors.length > 0) {
  errors.forEach((e) => console.error(`ERROR ${e}`));
  console.error(`\nLint gagal: ${errors.length} error, ${warnings.length} warning.`);
  process.exit(1);
}
console.log(`Lint OK: tidak ada error (${warnings.length} warning).`);
