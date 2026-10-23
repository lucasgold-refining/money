const CACHE = 'emz-money-v10';
const CORE = ['./', './index.html', './manifest.json'];
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './fonts/manrope-400-800.woff2', './fonts/playfair-title.woff2'];
// v7: no skipWaiting on install. A first install activates straight away anyway (nothing to replace);
// an update waits until the page asks (user tapped "New version ready"), so nothing swaps mid-session.
// One exception: replacing a v1–v6 worker (network-first, the slow one). The page that installs v7 is
// already the v7 page, so taking over at once is safe and makes the very next open instant.
const LEGACY = /^emz-money-v[1-6]$/;
self.addEventListener('install', e => {
  // page + manifest must cache; icons/fonts are best-effort so one missing file can't block the update
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))
      .then(() => Promise.all(ASSETS.filter(u => !CORE.includes(u)).map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))))
    .then(() => caches.keys()).then(keys => { if (keys.some(k => LEGACY.test(k))) return self.skipWaiting(); }));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'skip-waiting') self.skipWaiting(); });
const dropOld = () => caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))));
// After page loads, drop only v1–v6 caches (a late write by the old worker can re-create one); never a newer, waiting version's cache.
const dropLegacy = () => caches.keys().then(keys => Promise.all(keys.filter(k => LEGACY.test(k)).map(k => caches.delete(k))));
self.addEventListener('activate', e => { e.waitUntil(dropOld().then(() => self.clients.claim())); });
async function tell(msg) { (await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })).forEach(c => c.postMessage(msg)); }
// Page: stale-while-revalidate. Answer from cache instantly; refresh the cached copy in the background
// and tell open pages if it changed (they show "New version ready").
async function page(e) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('./index.html');
  const oldCopy = cached ? cached.clone() : null; // cloned now: `cached` itself goes to the page
  const refresh = fetch('./index.html', { cache: 'no-cache' }).then(async r => {
    if (!r.ok) return r;
    const fresh = await r.clone().text(), old = oldCopy ? await oldCopy.text() : null;
    if (fresh !== old) { await cache.put('./index.html', r.clone()); if (old !== null) setTimeout(() => tell({ type: 'index-updated' }), 1000); }
    return r;
  });
  if (cached) { e.waitUntil(refresh.catch(() => {}).then(dropLegacy)); return cached; }
  return refresh.catch(() => caches.match('./'));
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(page(e)); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
