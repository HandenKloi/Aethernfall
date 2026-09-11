'use strict';

const VERSION = '3.7.1';
// Scope isolates caches of different GitHub Pages repositories on the same origin.
const PREFIX = 'aethernfall:' + self.registration.scope + ':';
const CACHE_NAME = PREFIX + VERSION;
const CORE = ['./assets/art/portal.svg', './physics.js?v=' + VERSION, './art.js?v=' + VERSION, './assets/art/characters.webp', './assets/art/objects.webp', './assets/art/terrain.webp', './', './index.html', './style.css?v=' + VERSION, './game.js?v=' + VERSION, './manifest.json?v=' + VERSION, './assets/icon-192.png', './assets/icon-512.png', ...['grass', 'dirt', 'stone', 'water', 'wood', 'foliage', 'rune'].map(n => './assets/textures/' + n + '.png')];
self.addEventListener('install', event => {
  // Reject a partial installation; the previous worker stays usable.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE.map(url => new Request(new URL(url, self.registration.scope), {
    cache: 'reload'
  })))));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request,
    url = new URL(req.url),
    scope = new URL(self.registration.scope);
  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const relative = url.pathname.slice(scope.pathname.length);
  if (req.mode === 'navigate' && (relative === '' || relative === 'index.html')) {
    // Serve one fully installed release, even when the network is unreliable.
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(new URL('./index.html', scope).href)) || fetch(req)));
  } else if (CORE.some(path => new URL(path, scope).href === url.href)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(req)) || fetch(req)));
  }
});
