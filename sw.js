// Cache-first offline shell. Bump VERSION on every release so phones pick up fixes.
const VERSION = 'v10';
// voice engine + model (~95 MB): cached on first use, kept across releases; rename to refresh
const VOICE_CACHE = 'voice-1';
const VOICE_FILES = /\/vendor\/piper\/|huggingface\.co|hf\.co/;
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/splash-1290x2796.png',
  'src/app.js', 'src/style.css', 'src/pdf.js', 'src/parse.js', 'src/query.js', 'src/export-text.js', 'src/export-image.js', 'src/store.js', 'src/aliases.js', 'src/speak.js',
  'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== VOICE_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (VOICE_FILES.test(e.request.url)) {
    e.respondWith(caches.open(VOICE_CACHE).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
