"use strict";

(() => {
  'use strict';

  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function validateManifest(manifest) {
    if (!isObject(manifest) || !Array.isArray(manifest.tiers) || !manifest.tiers.length || !manifest.tiers.includes(manifest.fallbackTier)) throw new TypeError('Invalid asset manifest tiers');
    if (!Array.isArray(manifest.packs) || !Array.isArray(manifest.records) || !isObject(manifest.aliases || {})) throw new TypeError('Invalid asset manifest registries');
    const packKeys = new Set();
    for (const pack of manifest.packs) {
      if (!isObject(pack) || typeof pack.id !== 'string' || !manifest.tiers.includes(pack.tier) || !['common','zone'].includes(pack.scope)) throw new TypeError('Invalid asset pack');
      if (pack.scope === 'zone' && typeof pack.zone !== 'string') throw new TypeError('Invalid zone asset pack');
      if (!(pack.width > 0 && pack.height > 0 && pack.width <= 2048 && pack.height <= 2048) || typeof pack.src !== 'string') throw new TypeError('Invalid asset pack dimensions');
      const key = `${pack.tier}:${pack.id}`;
      if (packKeys.has(key)) throw new TypeError(`Duplicate asset pack: ${key}`);
      packKeys.add(key);
    }
    for (const record of manifest.records) {
      if (!isObject(record) || typeof record.id !== 'string' || !manifest.tiers.includes(record.tier) || !packKeys.has(`${record.tier}:${record.pack}`)) throw new TypeError('Invalid asset record');
      if (!Array.isArray(record.rect) || record.rect.length !== 4 || record.rect.some(value => !Number.isFinite(value))) throw new TypeError('Invalid asset record rect');
    }
    return manifest;
  }

  function defaultImageFactory(baseUrl) {
    return pack => new Promise((resolve, reject) => {
      if (typeof Image !== 'function') return reject(new Error('Image API unavailable'));
      const image = new Image();
      let settled = false;
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = image.onerror = null;
        ok ? resolve(value) : reject(value);
      };
      const timer = setTimeout(() => finish(false, new Error(`Asset timeout: ${pack.src}`)), 5000);
      image.decoding = 'async';
      image.onload = async () => {
        try {
          if (image.naturalWidth !== pack.width || image.naturalHeight !== pack.height) throw new Error(`Asset dimensions: ${pack.src}`);
          if (typeof image.decode === 'function') await image.decode().catch(() => {});
          finish(true, image);
        } catch (error) {
          finish(false, error);
        }
      };
      image.onerror = () => finish(false, new Error(`Asset load: ${pack.src}`));
      image.src = new URL(pack.src, baseUrl).href;
    });
  }

  function closeImages(images) {
    for (const image of images.values()) {
      try { image.close?.(); } catch (_) {}
    }
  }

  function createManager({ manifest, imageFactory, baseUrl } = {}) {
    validateManifest(manifest);
    const resolvedBase = baseUrl || (typeof document !== 'undefined' ? new URL('./assets/', document.baseURI).href : 'http://localhost/assets/');
    const makeImage = imageFactory || defaultImageFactory(resolvedBase);
    const aliases = Object.freeze({ ...(manifest.aliases || {}) });
    const packIndex = new Map();
    const recordIndex = new Map();
    for (const pack of manifest.packs) {
      const group = pack.scope === 'common' ? 'common' : pack.zone;
      const key = `${pack.tier}:${group}`;
      if (!packIndex.has(key)) packIndex.set(key, []);
      packIndex.get(key).push(pack);
    }
    for (const packs of packIndex.values()) packs.sort((a,b) => a.id.localeCompare(b.id));
    for (const record of manifest.records) {
      const key = `${record.tier}:${record.pack}`;
      if (!recordIndex.has(key)) recordIndex.set(key, []);
      recordIndex.get(key).push(record);
    }
    let requestedTier = manifest.fallbackTier;
    let common = null;
    let zone = null;
    const serial = { common:0, zone:0, tier:0 };

    function requestTierCache(tier) {
      if (tier === manifest.fallbackTier) return;
      try {
        globalThis.navigator?.serviceWorker?.controller?.postMessage({ type:'CACHE_ASSET_TIER', tier, version:manifest.buildVersion });
      } catch (_) {}
    }

    function resolveId(id) {
      return aliases[id] || id;
    }

    function buildEntries(tier, packs, images) {
      const entries = new Map();
      for (const pack of packs) {
        const image = images.get(pack.id);
        for (const record of recordIndex.get(`${tier}:${pack.id}`) || []) entries.set(record.id, Object.freeze({ record, image, pack }));
      }
      return entries;
    }

    async function decodeGroup(tier, groupId) {
      const packs = packIndex.get(`${tier}:${groupId}`) || [];
      if (!packs.length) throw new Error(`No asset group: ${tier}:${groupId}`);
      const settled = await Promise.allSettled(packs.map(pack => Promise.resolve().then(() => makeImage(pack))));
      const images = new Map();
      const skipped = [];
      for (let index = 0; index < settled.length; index++) {
        const result = settled[index];
        const pack = packs[index];
        if (result.status === 'rejected') { skipped.push({ pack, reason: result.reason }); continue; }
        const image = result.value;
        if (!image || image.naturalWidth !== pack.width || image.naturalHeight !== pack.height) {
          skipped.push({ pack, reason: new Error(`Decoded dimensions: ${pack.src}`) });
          continue;
        }
        images.set(pack.id, image);
      }
      if (!images.size) {
        // Every single pack in the group failed — genuinely nothing to show, so surface it
        // as before and let the caller fall back to another tier.
        closeImages(images);
        throw skipped[0]?.reason || new Error(`Incomplete asset group: ${tier}:${groupId}`);
      }
      if (skipped.length) {
        // Partial failure: keep whatever decoded correctly instead of discarding the whole
        // group over one bad pack, so unrelated houses/props/effects still render.
        for (const { pack, reason } of skipped) console.warn(`Aethernfall asset pack skipped: ${tier}:${pack.id}`, reason);
      }
      const okPacks = packs.filter(pack => images.has(pack.id));
      return { id:groupId, tier, packs:okPacks, images, entries:buildEntries(tier, okPacks, images), incomplete: skipped.length > 0 };
    }

    async function loadGroup(groupId, slot) {
      const operation = ++serial[slot];
      const tiers = requestedTier === manifest.fallbackTier ? [requestedTier] : [requestedTier, manifest.fallbackTier];
      const errors = [];
      for (const tier of tiers) {
        try {
          const next = await decodeGroup(tier, groupId);
          if (operation !== serial[slot]) { closeImages(next.images); return { stale:true, tier, fallback:tier !== requestedTier }; }
          const previous = slot === 'common' ? common : zone;
          if (slot === 'common') common = next; else zone = next;
          if (previous && previous !== next) closeImages(previous.images);
          requestTierCache(tier);
          return { tier, fallback:tier !== requestedTier, group:groupId };
        } catch (error) {
          errors.push(error);
        }
      }
      const detail = errors.map(error => error?.message || String(error)).join('; ');
      throw new Error(`Unable to load asset group ${groupId}: ${detail}`);
    }

    async function loadTier(zoneId) {
      if (!manifest.zones?.includes(zoneId)) throw new RangeError(`Unknown asset zone: ${zoneId}`);
      const operation = ++serial.tier;
      const hasCurrentPair = Boolean(common && zone);
      const tiers = hasCurrentPair || requestedTier === manifest.fallbackTier ? [requestedTier] : [requestedTier, manifest.fallbackTier];
      const errors = [];
      for (const tier of tiers) {
        const settled = await Promise.allSettled([decodeGroup(tier, 'common'), decodeGroup(tier, zoneId)]);
        if (settled.every(result => result.status === 'fulfilled')) {
          const nextCommon = settled[0].value, nextZone = settled[1].value;
          if (operation !== serial.tier) {
            closeImages(nextCommon.images); closeImages(nextZone.images);
            return { stale:true, tier };
          }
          const previousCommon = common, previousZone = zone;
          common = nextCommon; zone = nextZone;
          if (previousCommon) closeImages(previousCommon.images);
          if (previousZone) closeImages(previousZone.images);
          requestTierCache(tier);
          return { tier, fallback:tier !== requestedTier, groups:['common', zoneId] };
        }
        for (const result of settled) {
          if (result.status === 'fulfilled') closeImages(result.value.images);
          else errors.push(result.reason);
        }
      }
      throw new Error(`Unable to load atomic asset tier: ${errors.map(error => error?.message || String(error)).join('; ')}`);
    }

    function source(id) {
      const logicalId = resolveId(id);
      return zone?.entries.get(logicalId) || common?.entries.get(logicalId) || null;
    }

    function draw(ctx, id, x, y, options) {
      const entry = source(id);
      if (!entry || !ctx) return false;
      const record = entry.record;
      const rect = record.rect;
      const height = Number(options?.height) > 0 ? Number(options.height) : rect[3];
      const width = Number(options?.width) > 0 ? Number(options.width) : height * rect[2] / rect[3];
      const scaleX = width / rect[2];
      const scaleY = height / rect[3];
      const pivot = record.pivot;
      ctx.save();
      ctx.translate(x, y);
      if (options?.flip) ctx.scale(-1, 1);
      ctx.drawImage(entry.image, rect[0], rect[1], rect[2], rect[3], -pivot[0] * scaleX, -pivot[1] * scaleY, width, height);
      ctx.restore();
      return true;
    }

    return Object.freeze({
      setTier(tier) {
        if (!manifest.tiers.includes(tier)) throw new RangeError(`Unknown asset tier: ${tier}`);
        requestedTier = tier;
        return tier;
      },
      getTier: () => requestedTier,
      loadCommon: () => loadGroup('common', 'common'),
      loadZone: zoneId => {
        if (!manifest.zones?.includes(zoneId)) return Promise.reject(new RangeError(`Unknown asset zone: ${zoneId}`));
        return loadGroup(zoneId, 'zone');
      },
      loadTier,
      releaseZone() { if (zone) closeImages(zone.images); zone = null; },
      source,
      has: id => !!source(id),
      draw,
      snapshot() {
        const groups = [];
        if (common) groups.push({ id:'common', tier:common.tier, imageCount:common.images.size });
        if (zone) groups.push({ id:zone.id, tier:zone.tier, imageCount:zone.images.size });
        const assetSheets = groups.reduce((sum, group) => sum + group.imageCount, 0);
        const decodedBytes = [common, zone].reduce((sum, group) => sum + (group?.packs || []).reduce((size, pack) => size + pack.width * pack.height * 4, 0), 0);
        const activeTier = zone?.tier || common?.tier || '';
        return { requestedTier, activeTier, zone:zone?.id || '', groupCount:groups.length, imageCount:assetSheets, assetSheets, decodedBytes, fallbackUsed:Boolean(activeTier && activeTier !== requestedTier), groups };
      },
      destroy() { if (common) closeImages(common.images); if (zone) closeImages(zone.images); common = zone = null; }
    });
  }

  async function loadManifest(url = './assets/manifest.json', fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') throw new Error('Fetch API unavailable');
    const response = await fetchImpl(url, { cache:'no-cache' });
    if (!response?.ok) throw new Error(`Asset manifest request failed: ${response?.status ?? 'network'}`);
    return validateManifest(await response.json());
  }

  globalThis.AetherAssets = Object.freeze({ createManager, loadManifest, validateManifest });
})();
