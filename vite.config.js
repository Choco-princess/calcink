import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';

const base = process.env.CALCINK_BASE || '/';

export default defineConfig({
  base,
  plugins: [{
    name: 'calcink-offline',
    generateBundle(_options, bundle) {
      const files = [
        '',
        'index.html',
        'model/model.json',
        'model/group1-shard1of1.bin',
        'model/LICENSE',
        ...Object.keys(bundle).filter(name => name !== 'sw.js')
      ];
      const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12);
      const source = `
const CACHE = 'calcink-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(FILES.map(path => new URL(path, self.registration.scope).href))
  ).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('calcink-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(caches.match(event.request, { ignoreVary: true }).then(cached => cached ||
    fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    })
  ));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  }]
});
