'use strict';

const VERSION = '5.1.9';
// Scope isolates caches of different GitHub Pages repositories on the same origin.
const PREFIX = 'aethernfall:' + self.registration.scope + ':';
const ASSET_TIER_PREFIX = 'aethernfall-assets:' + self.registration.scope;
const CACHE_NAME = PREFIX + VERSION;
const VALID_TIERS = new Set(['low','medium','high','very-high','ultra']);
const fallbackTier = 'low';
const LOW_PACKS = [
  './assets/packs/low/common-actors.webp', './assets/packs/low/common-equipment.webp', './assets/packs/low/common-portraits.webp', './assets/packs/low/common-props.webp', './assets/packs/low/common-items.webp', './assets/packs/low/common-vfx-foundation.webp', './assets/packs/low/common-vfx-combat.webp', './assets/packs/low/common-vfx-world.webp', './assets/packs/low/common-vfx-projectiles.webp',
  './assets/packs/low/ashfield-actors.webp', './assets/packs/low/ashfield-terrain.webp', './assets/packs/low/ashfield-props.webp',
  './assets/packs/low/frostmere-actors.webp', './assets/packs/low/frostmere-terrain.webp', './assets/packs/low/frostmere-props.webp',
  './assets/packs/low/mistwood-actors.webp', './assets/packs/low/mistwood-terrain.webp', './assets/packs/low/mistwood-props.webp',
  './assets/packs/low/starreach-actors.webp', './assets/packs/low/starreach-terrain.webp', './assets/packs/low/starreach-props.webp',
  './assets/packs/low/stonevale-actors.webp', './assets/packs/low/stonevale-terrain.webp', './assets/packs/low/stonevale-props.webp'
];
const CORE = ['./assets/art/portal.svg', './debug-overlay.js?v=' + VERSION, './physics.js?v=' + VERSION, './assets.js?v=' + VERSION, './art.js?v=' + VERSION, './vfx.js?v=' + VERSION, './ui-icons.js?v=' + VERSION, './assets/ui/actions.svg', './assets/ui/navigation.svg', './assets/ui/camp.svg', './assets/ui/map.svg', './assets/ui/status.svg', './assets/art/characters.webp', './assets/art/objects.webp', './assets/art/terrain.webp', './assets/manifest.json?v=' + VERSION, './', './index.html', './style.css?v=' + VERSION, './audio.js?v=' + VERSION, './persistence.js?v=' + VERSION, './quests.js?v=' + VERSION, './combat.js?v=' + VERSION, './builds.js?v=' + VERSION, './world.js?v=' + VERSION, './zone-visuals.js?v=' + VERSION, './arenas.js?v=' + VERSION, './story.js?v=' + VERSION, './game.js?v=' + VERSION, './manifest.json?v=' + VERSION, './assets/icon-192.png', './assets/icon-512.png', ...LOW_PACKS, ...['grass', 'dirt', 'stone', 'water', 'wood', 'foliage', 'rune'].map(n => './assets/textures/' + n + '.png')];
function assetTierCacheName(tier) { return ASSET_TIER_PREFIX + VERSION + ':' + tier; }
async function cacheAssetTier(tier) {
  if (!VALID_TIERS.has(tier) || tier === fallbackTier) return false;
  const response = await fetch(new URL('./assets/manifest.json?v=' + VERSION, self.registration.scope));
  if (!response.ok) return false;
  const manifest = await response.json();
  if (manifest.buildVersion !== VERSION) return false;
  const urls = manifest.packs.filter(pack => pack.tier === tier).map(pack => new Request(new URL('./assets/' + pack.src, self.registration.scope), { cache:'reload' }));
  await (await caches.open(assetTierCacheName(tier))).addAll(urls);
  return true;
}
self.addEventListener('install', event => {
  // Reject a partial installation; the previous worker stays usable.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE.map(url => new Request(new URL(url, self.registration.scope), {
    cache: 'reload'
  })))));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'CACHE_ASSET_TIER' && event.data.version === VERSION && VALID_TIERS.has(event.data.tier)) event.waitUntil(cacheAssetTier(event.data.tier).catch(() => false));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith(PREFIX) || key.startsWith(ASSET_TIER_PREFIX)) && key !== CACHE_NAME && !key.startsWith(ASSET_TIER_PREFIX + VERSION + ':')).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
  } else if (relative.startsWith('assets/packs/')) {
    event.respondWith(caches.match(req).then(async cached => {
      if (cached) return cached;
      const response = await fetch(req);
      const tier = relative.split('/')[2];
      if (response.ok && VALID_TIERS.has(tier)) (await caches.open(assetTierCacheName(tier))).put(req, response.clone());
      return response;
    }));
  } else if (CORE.some(path => new URL(path, scope).href === url.href)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(req)) || fetch(req)));
  }
});
