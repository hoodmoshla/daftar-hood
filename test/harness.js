/* ═══════════════════════════════════════════════════════════════
   بيئة اختبار: تشغيل كود المتصفح داخل Node
   تُحاكي localStorage والنوافذ لاختبار المنطق فعليًا.
   ═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app');

/* ── محاكاة localStorage ──────────────────────────────────── */
function makeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    clear: () => map.clear(),
    _dump: () => Object.fromEntries(map),
    get length() { return map.size; }
  };
}

/* ── محاكاة DOM مختصرة ────────────────────────────────────── */
function makeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], childNodes: [], style: {}, dataset: {}, classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { f ? this._s.add(c) : this._s.delete(c); } },
      contains(c) { return this._s.has(c); }
    },
    attributes: {},
    _html: '', _text: '', value: '', id: '', type: '',
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, blur() {}, select() {}, click() {}, scrollIntoView() {},
    setSelectionRange() {}, scrollTo() {}, scrollBy() {},
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); }
  };
  return el;
}

function makeDocument() {
  const registry = {};
  return {
    body: makeElement('body'),
    documentElement: makeElement('html'),
    createElement: makeElement,
    getElementById: id => registry[id] || (registry[id] = makeElement('div')),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    execCommand() { return true; },
    _registry: registry
  };
}

/* ── إنشاء البيئة ─────────────────────────────────────────── */
function createEnv(opts) {
  opts = opts || {};
  const storage = makeStorage();
  const document = makeDocument();

  const win = {
    localStorage: storage,
    document,
    navigator: {
      clipboard: { writeText: async () => true },
      userAgent: 'node-test'
    },
    location: { origin: 'http://localhost', pathname: '/', protocol: 'http:' },
    console: opts.quiet ? { log(){}, warn(){}, error(){}, info(){} } : console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async () => { throw new Error('network disabled in tests'); },
    AbortController: global.AbortController,
    Blob: class { constructor(parts){ this.size = String(parts && parts[0] || '').length; } },
    URL: global.URL,
    URLSearchParams: global.URLSearchParams,
    Intl, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
    Promise, Map, Set, isNaN, isFinite, parseFloat, parseInt, encodeURIComponent, decodeURIComponent,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    scrollTo() {}, scrollBy() {}, scrollX: 0, scrollY: 0,
    innerHeight: 900, innerWidth: 412,
    Notification: undefined,
    SpeechRecognition: undefined,
    screen: { width: 412, height: 915 }
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  const ctx = vm.createContext(win);

  // تحميل ملفات التطبيق بالترتيب نفسه المستخدم في index.html
  ['store.js', 'ai.js', 'assist.js', 'calendar.js', 'ui.js'].forEach(f => {
    const code = fs.readFileSync(path.join(APP, 'js', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });

  return { win, ctx, storage };
}

/* ── إطار اختبار مبسّط ────────────────────────────────────── */
let passed = 0, failed = 0, currentSuite = '';
const failures = [];

function suite(name) {
  currentSuite = name;
  console.log('\n\x1b[1m\x1b[36m▸ ' + name + '\x1b[0m');
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (e) {
    failed++;
    failures.push({ suite: currentSuite, name, error: e.message });
    console.log('  \x1b[31m✗\x1b[0m ' + name + '\n      \x1b[31m' + e.message + '\x1b[0m');
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (e) {
    failed++;
    failures.push({ suite: currentSuite, name, error: e.message });
    console.log('  \x1b[31m✗\x1b[0m ' + name + '\n      \x1b[31m' + e.message + '\x1b[0m');
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'فشل التحقق');
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'قيمة غير متوقعة') + ' — المتوقع: ' + JSON.stringify(expected) +
      ' | الفعلي: ' + JSON.stringify(actual));
  }
}
function assertIncludes(haystack, needle, msg) {
  if (String(haystack).indexOf(needle) === -1) {
    throw new Error((msg || 'نص مفقود') + ' — يبحث عن: «' + needle + '» في: «' +
      String(haystack).slice(0, 200) + '…»');
  }
}
function assertNotIncludes(haystack, needle, msg) {
  if (String(haystack).indexOf(needle) !== -1) {
    throw new Error((msg || 'نص غير مرغوب موجود') + ' — «' + needle + '»');
  }
}

function report() {
  console.log('\n' + '─'.repeat(58));
  if (failed === 0) {
    console.log('\x1b[1m\x1b[32m✓ نجحت جميع الاختبارات: ' + passed + '\x1b[0m');
  } else {
    console.log('\x1b[1m\x1b[31m✗ فشل ' + failed + ' من ' + (passed + failed) + '\x1b[0m');
    failures.forEach(f => console.log('  • [' + f.suite + '] ' + f.name + ': ' + f.error));
  }
  console.log('─'.repeat(58));
  return failed === 0 ? 0 : 1;
}

module.exports = {
  createEnv, suite, test, testAsync, assert, assertEq,
  assertIncludes, assertNotIncludes, report,
  get failedCount() { return failed; },
  get passedCount() { return passed; }
};