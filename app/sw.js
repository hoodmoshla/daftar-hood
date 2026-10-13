/* ═══════════════════════════════════════════════════════════════
   دفتر هود الذكي — service worker
   يخزّن ملفات التطبيق فقط، ليبدأ التطبيق دون إنترنت.
   ملاحظة صادقة: هذا لا يمنح إشعارات في الخلفية — التخزين فقط.
   ═══════════════════════════════════════════════════════════════ */
const CACHE = 'daftar-hood-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/store.js',
  './js/ai.js',
  './js/assist.js',
  './js/calendar.js',
  './js/ui.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(err => console.warn('[sw] بعض الملفات لم تُخزّن:', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // لا نتدخل في طلبات Google APIs أو أي خدمة خارجية — تمر مباشرة
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') return;

  // الملفات المحلية: من الكاش أولًا (سريع ويعمل دون إنترنت)
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);

      return cached || network;
    })
  );
});