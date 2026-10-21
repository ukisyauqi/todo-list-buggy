#!/usr/bin/env node
/**
 * Build statis tanpa dependency eksternal.
 *
 * Website ini adalah situs statis (HTML/CSS/JS) tanpa proses bundling,
 * sehingga "build" berarti menyalin sumber statis ke folder `dist/` yang
 * siap di-deploy, lalu memvalidasi hasilnya.
 */
import { readFileSync, existsSync, mkdirSync, rmSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'dist');
const TOOLING_DIRS = new Set(['node_modules', 'dist', 'scripts', 'test', '.git']);
const STATIC_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.svg', '.png', '.jpg', '.jpeg',
  '.gif', '.webp', '.avif', '.ico', '.txt', '.webmanifest', '.xml',
]);

function collectStaticFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (TOOLING_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectStaticFiles(full, acc);
    else if (STATIC_EXTENSIONS.has(extname(entry).toLowerCase())) acc.push(full);
  }
  return acc;
}

// 1. Bersihkan output sebelumnya
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// 2. Salin seluruh aset statis
const files = collectStaticFiles(ROOT);
for (const file of files) {
  const target = join(OUT_DIR, relative(ROOT, file));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
  console.log(`  copied  ${relative(ROOT, file)} -> ${relative(ROOT, target)}`);
}

// 3. Validasi output
const outIndex = join(OUT_DIR, 'index.html');
if (!existsSync(outIndex)) {
  console.error('Build gagal: dist/index.html tidak terbentuk.');
  process.exit(1);
}
const html = readFileSync(outIndex, 'utf8');
for (const marker of ['id="form"', 'id="input"', 'id="list"', 'function deleteTodo']) {
  if (!html.includes(marker)) {
    console.error(`Build gagal: dist/index.html tidak lengkap (tidak menemukan ${marker}).`);
    process.exit(1);
  }
}

console.log(`\nBuild OK: ${files.length} file statis -> ${relative(ROOT, OUT_DIR)}/`);
