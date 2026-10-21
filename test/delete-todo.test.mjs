/**
 * Regression test untuk bug "Tombol Hapus tidak berfungsi".
 *
 * Script inline pada index.html dieksekusi di Node (vm) dengan stub DOM
 * minimal, sehingga alur pengguna (klik tombol "Hapus") bisa diuji tanpa
 * browser dan tanpa dependency eksternal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ *
 * Stub DOM minimal
 * ------------------------------------------------------------------ */
function createElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    listeners: {},
    dataset: {},
    style: {},
    className: '',
    textContent: '',
    value: '',
    type: '',
    checked: false,
    _innerHTML: '',
    classList: {
      _classes: new Set(),
      add(...names) { names.forEach((n) => this._classes.add(n)); },
      remove(...names) { names.forEach((n) => this._classes.delete(n)); },
      contains(name) { return this._classes.has(name); },
    },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(value) { this._innerHTML = value; this.children = []; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    addEventListener(type, handler) {
      (this.listeners[type] ||= []).push(handler);
    },
    dispatchEvent(event) {
      (this.listeners[event.type] || []).forEach((handler) => handler(event));
      return true;
    },
    focus() { this.focused = true; },
  };
  return el;
}

/** Memuat index.html ke sandbox dan mengembalikan handle untuk interaksi. */
function loadApp() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const script = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(script, 'index.html harus memuat script inline');

  const elements = {
    form: createElement('form'),
    input: createElement('input'),
    list: createElement('ul'),
  };
  const document = {
    getElementById: (id) => elements[id] ?? null,
    createElement,
    addEventListener() {},
  };
  const store = new Map();
  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => store.clear(),
  };

  const sandbox = { document, localStorage };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script[1], sandbox, { filename: 'index.html#inline-script' });

  return {
    elements,
    store,
    get todos() { return sandbox.__todos(); },
    actions: sandbox.__actions,
    /** Menambah todo lewat form, seperti yang dilakukan pengguna. */
    submit(text) {
      elements.input.value = text;
      elements.form.dispatchEvent({ type: 'submit', preventDefault() {} });
    },
    /** Item yang ditampilkan di list (elemen <li>). */
    get items() { return elements.list.children; },
    /** Tombol "Hapus" pada item ke-`index`. */
    deleteButton(index) {
      const li = elements.list.children[index];
      assert.ok(li, `item ke-${index} tidak ada`);
      const button = li.children.find((child) => child.tagName === 'BUTTON');
      assert.ok(button, `item ke-${index} tidak punya tombol Hapus`);
      return button;
    },
    storedTodos() {
      const raw = store.get('todos');
      return raw ? JSON.parse(raw) : [];
    },
  };
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */
test('menambah todo lewat form menambah item ke list dan localStorage', () => {
  const app = loadApp();

  app.submit('Belajar Next.js');
  app.submit('Perbaiki bug delete');

  assert.equal(app.items.length, 2);
  assert.equal(app.todos.length, 2);
  assert.equal(app.storedTodos().length, 2);
  assert.equal(app.items[0].children[1].textContent, 'Belajar Next.js');
});

test('klik tombol Hapus menghapus item dari list dan localStorage', () => {
  const app = loadApp();

  app.submit('Belajar Next.js');
  app.submit('Perbaiki bug delete');
  assert.equal(app.items.length, 2, 'dua todo harus ditambahkan sebelum dihapus');

  app.deleteButton(0).dispatchEvent({ type: 'click' });

  assert.equal(app.items.length, 1, 'satu item harus tersisa di list');
  assert.equal(app.todos.length, 1, 'satu item harus tersisa di state');
  assert.equal(app.storedTodos().length, 1, 'localStorage harus ikut terupdate');
  assert.equal(app.todos[0].text, 'Perbaiki bug delete', 'item yang salah yang terhapus');
  assert.equal(app.items[0].children[1].textContent, 'Perbaiki bug delete');
});

test('tombol Hapus menghapus item yang dipilih saja', () => {
  const app = loadApp();

  app.submit('A');
  app.submit('B');
  app.submit('C');

  app.deleteButton(1).dispatchEvent({ type: 'click' });

  assert.deepEqual([...app.todos].map((t) => t.text), ['A', 'C']);
  assert.deepEqual(app.storedTodos().map((t) => t.text), ['A', 'C']);
});

test('deleteTodo dengan id yang tidak ada tidak mengubah data', () => {
  const app = loadApp();

  app.submit('A');
  app.submit('B');

  app.actions.deleteTodo(999999);

  assert.equal(app.todos.length, 2);
  assert.equal(app.storedTodos().length, 2);
});

test('id todo yang ditambahkan berurutan tetap unik', () => {
  const app = loadApp();

  app.submit('A');
  app.submit('B');
  app.submit('C');

  const ids = app.todos.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'id todo harus unik');
});

test('menandai todo sebagai selesai tetap berfungsi setelah perbaikan hapus', () => {
  const app = loadApp();

  app.submit('A');
  const checkbox = app.items[0].children[0];
  checkbox.dispatchEvent({ type: 'change' });

  assert.equal(app.todos[0].done, true);
  assert.equal(app.storedTodos()[0].done, true);
});
