const APP_CACHE = 'eng-dashboard-cache-v1';
const CORE_ASSETS = [
  './english-learning-dashboard.html',
  './manifest.json',
  './service-worker.js',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network-first for page, cache-first fallback for static
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Handle share target route - let it pass to navigation (POST captured separately)
  if (url.pathname === '/share-target') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./english-learning-dashboard.html'))
    );
    return;
  }

  // static assets
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const resClone = res.clone();
      caches.open(APP_CACHE).then((cache) => cache.put(req, resClone));
      return res;
    }).catch(() => cached))
  );
});

// Share Target handler (Web Share Target API)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const files = formData.getAll('files');
        let importedPayload = null;
        for (const file of files) {
          if (!file) continue;
          if (file.type === 'application/json' || file.name.endsWith('.json')) {
            const text = await file.text();
            try {
              importedPayload = JSON.parse(text);
              break;
            } catch {}
          }
        }

        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (allClients.length > 0) {
          allClients[0].postMessage({ type: 'WST_IMPORT', payload: importedPayload });
          return Response.redirect('./english-learning-dashboard.html', 303);
        } else {
          // Open a new window and then rely on postMessage to late deliver
          await self.clients.openWindow('./english-learning-dashboard.html');
          // Store temporarily in cache storage as fallback
          if (importedPayload) {
            const stash = new Response(JSON.stringify(importedPayload), { headers: { 'content-type': 'application/json' } });
            const cache = await caches.open(APP_CACHE);
            await cache.put(new Request('./__pending-shared.json'), stash);
          }
          return Response.redirect('./english-learning-dashboard.html', 303);
        }
      } catch (e) {
        return Response.redirect('./english-learning-dashboard.html', 303);
      }
    })());
  }
});

// On page load, page can ask for pending shared data
self.addEventListener('message', async (event) => {
  const msg = event.data || {};
  if (msg && msg.type === 'GET_PENDING_SHARED') {
    const cache = await caches.open(APP_CACHE);
    const res = await cache.match('./__pending-shared.json');
    if (res) {
      const data = await res.json();
      event.source.postMessage({ type: 'PENDING_SHARED', payload: data });
      await cache.delete('./__pending-shared.json');
    } else {
      event.source.postMessage({ type: 'PENDING_SHARED', payload: null });
    }
  }
});


