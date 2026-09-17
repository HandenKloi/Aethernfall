"use strict";

/* Aethernfall 5.1.1 — directional actors and cached zone-material frames. */
(() => {
  'use strict';

  const sheets = {
    portal: {
      src: './assets/art/portal.svg',
      width: 160,
      height: 200
    },
    characters: {
      src: './assets/art/characters.webp',
      width: 1536,
      height: 1024
    },
    objects: {
      src: './assets/art/objects.webp',
      width: 1448,
      height: 1086
    },
    terrain: {
      src: './assets/art/terrain.webp',
      width: 1254,
      height: 1254
    }
  };
  const sprites = {
    portal: ['portal', 0, 0, 160, 200],
    hero: ['characters', 121, 8, 271, 494],
    heroBack: ['characters', 621, 12, 274, 491],
    scout: ['characters', 1127, 10, 279, 488],
    raider: ['characters', 126, 510, 267, 506],
    boar: ['characters', 534, 561, 440, 425],
    guardian: ['characters', 1032, 498, 478, 518],
    pine: ['objects', 69, 10, 241, 350],
    oak: ['objects', 370, 20, 344, 333],
    rock: ['objects', 751, 98, 316, 250],
    house: ['objects', 1121, 14, 299, 339],
    ruins: ['objects', 57, 361, 278, 360],
    shrine: ['objects', 398, 372, 293, 349],
    herb: ['objects', 738, 394, 323, 305],
    wood: ['objects', 1113, 437, 310, 257],
    ore: ['objects', 54, 761, 281, 291],
    sword: ['objects', 397, 731, 293, 329],
    armor: ['objects', 757, 733, 300, 330],
    potion: ['objects', 1172, 740, 204, 303]
  };
  const images = {};
  const materials = [{}, {}, {}, {}, {}];
  const managedDrawOptions = { height:0, flip:false };
  const zonePatternCache = new Map();
  let loading, terrainReady = false, assetManager = null;
  const managedSource = name => assetManager?.source(name) || null;
  function sheetManaged(sheetName) {
    if (!assetManager || !['characters','objects'].includes(sheetName)) return false;
    if (sheetName === 'characters') return assetManager.has('player.ranger') && assetManager.has('npc.lyra');
    return Object.entries(sprites).filter(([, rect]) => rect[0] === sheetName).every(([name]) => assetManager.has(name));
  }
  function makeSurfaces(image) {
    terrainReady = false;
    // Mirrored repetitions share edge pixels, avoiding hard terrain tile seams.
    ['grass', 'stone', 'dirt', 'water'].forEach((name, index) => {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 384;
      const c = tile.getContext('2d');
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        c.save();
        c.translate(x ? 384 : 0, y ? 384 : 0);
        c.scale(x ? -1 : 1, y ? -1 : 1);
        c.drawImage(image, index % 2 * 627, Math.floor(index / 2) * 627, 627, 627, 0, 0, 192, 192);
        c.restore();
      }
      for (let level = 0; level < 5; level++) {
        const variant = document.createElement('canvas');
        variant.width = variant.height = 384;
        const c = variant.getContext('2d');
        c.drawImage(tile, 0, 0);
        // Keep the photographic base in every preset; add readable material features.
        const density = [0, 35, 90, 180, 280][level];
        for (let n = 0; n < density; n++) {
          const noise = v => {
            const k = Math.sin(v * 127.1 + index * 311.7) * 43758.5453;
            return k - Math.floor(k);
          };
          const x = noise(n + 1) * 360 + 12,
            y = noise(n + 703) * 360 + 12;
          c.strokeStyle = name === 'grass' ? n % 3 ? '#82955a88' : '#203f3088' : name === 'stone' ? '#b4b69d66' : name === 'water' ? '#b4f0e744' : '#bba47c55';
          c.lineWidth = level >= 2 ? 2 : 1.5;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + (n % 3 - 1) * 2, y - (name === 'grass' ? 3 + n % 5 : 1));
          c.stroke();
          if (name === 'grass') {
            c.strokeStyle = n % 2 ? '#bec779aa' : '#193c27bb';
            c.beginPath();
            c.moveTo(x, y);
            c.quadraticCurveTo(x - 6, y - 5, x - 4, y - 12);
            c.moveTo(x, y);
            c.quadraticCurveTo(x + 7, y - 4, x + 6, y - 9);
            c.stroke();
            if (level >= 2 && n % 4 === 0) {
              c.fillStyle = '#e3d6a8';
              c.fillRect(x - 5, y - 13, 3, 3);
            }
          } else if (name !== 'water') {
            c.fillStyle = '#23352888';
            c.beginPath();
            c.ellipse(x, y, 6 + n % 5, 3 + n % 3, 0, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = name === 'stone' ? '#b9ba9faa' : '#b6a084aa';
            c.beginPath();
            c.moveTo(x - 4, y);
            c.lineTo(x - 2, y - 3);
            c.lineTo(x + 3 + n % 3, y - 2);
            c.lineTo(x + 4, y + 1);
            c.lineTo(x, y + 2);
            c.closePath();
            c.fill();
          }
          if (level >= 2 && n % 9 === 0 && name === 'grass') {
            c.fillStyle = '#d7cd95';
            c.fillRect(x, y - 4, 2, 2);
          }
          if (level >= 4 && n % 19 === 0) {
            c.save();
            c.globalAlpha = .55;
            if (name === 'grass') {
              c.fillStyle = n % 38 ? '#d8b6db' : '#f1d278';
              c.beginPath(); c.arc(x + 4, y - 8, 1.7, 0, Math.PI * 2); c.fill();
            } else if (name === 'stone') {
              c.strokeStyle = '#4a4b45'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 7, y + 4); c.lineTo(x - 2, y - 2); c.lineTo(x + 5, y + 1); c.stroke();
            } else if (name === 'dirt') {
              c.fillStyle = '#6f5742'; c.fillRect(x - 1, y - 1, 2, 2);
            } else if (name === 'water') {
              c.fillStyle = '#d6fff3'; c.fillRect(x - 5, y - 2, 10, 1);
            }
            c.restore();
          }
          if (level >= 4 && n % 7 === 0) {
            c.save();
            c.globalAlpha = .42;
            c.strokeStyle = name === 'water' ? '#d8fff0' : name === 'stone' ? '#d6d1ba' : name === 'dirt' ? '#dac49b' : '#dce4a4';
            c.lineWidth = 1;
            c.beginPath();
            if (name === 'water') {
              c.moveTo(x - 7, y);
              c.quadraticCurveTo(x, y - 2, x + 8, y);
            } else {
              c.moveTo(x - 2, y + 1);
              c.lineTo(x + 3, y - 2);
            }
            c.stroke();
            c.restore();
          }
        }
        materials[level][name] = variant;
      }
      // Variants own their pixels after drawImage(); release the redundant base tile.
      tile.width = tile.height = 0;
    });
    terrainReady = true;
  }
  function load(changed = () => {}) {
    if (loading) return loading;
    loading = Promise.all(Object.entries(sheets).filter(([name]) => !sheetManaged(name)).map(([name, sheet]) => new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };
      const timer = setTimeout(finish, 2500);
      image.decoding = 'async';
      image.onload = () => {
        try {
          if (image.naturalWidth !== sheet.width || image.naturalHeight !== sheet.height) throw Error('Atlas size: ' + name);
          images[name] = image;
          if (name === 'terrain') makeSurfaces(image);
          changed();
        } catch (error) {
          console.warn('Aethernfall art', error);
        }
        image.onload = image.onerror = null;
        finish();
      };
      image.onerror = () => {
        image.onload = image.onerror = null;
        finish();
      };
      image.src = new URL(sheet.src, document.baseURI).href;
    })));
    return loading;
  }
  function draw(ctx, name, x, y, height, flip = false) {
    if (assetManager) {
      managedDrawOptions.height = height;
      managedDrawOptions.flip = flip;
      if (assetManager.draw(ctx, name, x, y, managedDrawOptions)) return true;
    }
    const rect = sprites[name];
    if (!rect || !images[rect[0]]) return false;
    const width = height * rect[3] / rect[4];
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(images[rect[0]], rect[1], rect[2], rect[3], rect[4], -width / 2, -height, width, height);
    ctx.restore();
    return true;
  }
  function drawFrame(ctx, name, x, y, options = {}) {
    const entry = managedSource(name);
    if (!entry) return false;
    const frames = entry.record.frames || [entry.record.rect];
    const frame = frames[Math.max(0, Math.floor(options.frame || 0)) % frames.length];
    const height = Number(options.height) || frame[3], width = Number(options.width) || height * frame[2] / frame[3];
    ctx.save(); ctx.translate(x, y); if (options.flip) ctx.scale(-1, 1);
    ctx.drawImage(entry.image, frame[0], frame[1], frame[2], frame[3], -width / 2, -height, width, height);
    ctx.restore();
    return true;
  }
  // Positional hot-path API used by the bounded VFX pool. It deliberately
  // avoids per-frame option objects and keeps atlas animation allocation-free.
  function drawVfxFrame(ctx, name, x, y, height, frameIndex = 0, rotation = 0, alpha = 1) {
    const entry = managedSource(name);
    if (!entry) return false;
    const frames = entry.record.frames || [entry.record.rect];
    const frame = frames[Math.max(0, Math.floor(frameIndex)) % frames.length];
    const width = height * frame[2] / frame[3];
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    ctx.globalAlpha *= alpha;
    ctx.drawImage(entry.image, frame[0], frame[1], frame[2], frame[3], -width / 2, -height / 2, width, height);
    ctx.restore();
    return true;
  }
  function zonePattern(ctx, name, frame = 0) {
    const entry = managedSource(name);
    if (!entry || typeof document === 'undefined') return null;
    const frames = entry.record.frames || [entry.record.rect];
    const index = Math.max(0, Math.floor(frame)) % Math.min(11, frames.length);
    const key = `${entry.record.tier}:${name}:${index}`;
    if (zonePatternCache.has(key)) return zonePatternCache.get(key);
    const rect = frames[index], tile = document.createElement('canvas');
    // A stable world-space macro tile keeps Low and Auto visually painterly.
    // The authored frame is already edge-safe, so no mirror symmetry is added.
    const size = 384;
    tile.width = size; tile.height = size;
    const c = tile.getContext('2d', { alpha:false });
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(entry.image, rect[0], rect[1], rect[2], rect[3], 0, 0, size, size);
    const pattern = ctx.createPattern(tile, 'repeat');
    zonePatternCache.set(key, pattern);
    return pattern;
  }
  function patterns(ctx, detail = 1) {
    const result = {};
    for (const [name, tile] of Object.entries(materials[detail] || materials[1])) result[name] = ctx.createPattern(tile, 'repeat');
    return result;
  }
  function weapon(ctx, x, y, height, angle) {
    const managed = managedSource('sword'), r = managed?.record.rect || sprites.sword,
      offset = managed ? 0 : 1, image = managed?.image || images[r[0]];
    if (!image) return false;
    const width = height * r[offset + 2] / r[offset + 3];
    // The source sword points down-left; anchor at the grip, not the tile edge.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle - 2.28);
    ctx.drawImage(image, r[offset], r[offset + 1], r[offset + 2], r[offset + 3], -width * .82, -height * .17, width, height);
    ctx.restore();
    return true;
  }
  // A small cutout rig reuses atlas pixels: two legs, torso, head and arms.
  // Angles stay small at the joins; no image decoding or canvases per frame.
  function legacyActor(ctx, name, x, y, height, t, walk, action, progress, flip = false, death = 0) {
    const managed = managedSource(name), r = managed?.record.rect || sprites[name],
      offset = managed ? 0 : 1, image = managed?.image || (r && images[r[0]]);
    if (!r || !image) return false;
    const width = height * r[offset + 2] / r[offset + 3],
      stride = Math.sin(t * 10) * walk;
    const arm = armAngle(action, progress, t, walk);
    const lean = bodyLean(action, progress);
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.rotate(lean + death * 1.35);
    ctx.scale(1, 1 + Math.sin(t * 2) * .009);
    if (name === 'boar') {
      drawActorPart(ctx, r, image, offset, width, height, 0, .72, .5, .28, stride * .12);
      drawActorPart(ctx, r, image, offset, width, height, .5, .72, .5, .28, -stride * .12);
      drawActorPart(ctx, r, image, offset, width, height, 0, 0, 1, .72);
    } else {
      drawActorPart(ctx, r, image, offset, width, height, 0, .72, .5, .28, stride * .15);
      drawActorPart(ctx, r, image, offset, width, height, .5, .72, .5, .28, -stride * .15);
      drawActorPart(ctx, r, image, offset, width, height, .23, .28, .54, .44);
      drawActorPart(ctx, r, image, offset, width, height, 0, 0, 1, .28, Math.sin(t * 1.5) * .012, .5, .28);
      drawActorPart(ctx, r, image, offset, width, height, 0, .28, .23, .44, arm, .22, .30);
      drawActorPart(ctx, r, image, offset, width, height, .77, .28, .23, .44, -arm, .78, .30);
    }
    ctx.restore();
    return true;
  }
  function actorFrame(entry, direction = 'front') {
    const index = Math.max(0, entry.record.directions?.indexOf(direction) ?? 0);
    return entry.record.frames?.[index] || entry.record.rect;
  }
  function drawActorFrame(ctx, entry, direction, height, flip = false) {
    if (!entry) return false;
    const frame = actorFrame(entry, direction), width = height * frame[2] / frame[3];
    ctx.save();
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(entry.image, frame[0], frame[1], frame[2], frame[3], -width / 2, -height, width, height);
    ctx.restore();
    return true;
  }
  function clipTransform(clip, progress, t, moving) {
    const pulse = Math.sin(Math.PI * Math.min(1, progress));
    const result = { rotation:0, x:0, y:moving ? Math.sin(t * 12) * 1.4 : Math.sin(t * 2) * .35, sx:1, sy:1 };
    if (clip.startsWith('attack_') || clip.endsWith('_release') || clip === 'riposte' || clip === 'shoot') {
      result.rotation = pulse * .13; result.x = pulse * 5;
    } else if (clip.endsWith('_windup') || clip === 'cast' || clip === 'aim') {
      result.rotation = -pulse * .08; result.sy = 1 - pulse * .045;
    } else if (clip === 'block' || clip === 'parry') {
      result.rotation = -pulse * .06; result.sx = 1 + pulse * .035;
    } else if (clip === 'dodge' || clip === 'charge') {
      result.rotation = -.3 * pulse; result.x = pulse * 10;
    } else if (clip === 'hit' || clip === 'stagger') result.rotation = -.14 * pulse;
    else if (clip === 'death') result.rotation = progress * 1.35;
    else if (clip === 'phase_shift') { result.sx = 1 + pulse * .11; result.sy = 1 + pulse * .08; }
    return result;
  }
  function bossAttachments(ctx, record, height, clip, progress, phase2) {
    if (!phase2 && clip !== 'phase_shift') return;
    const color = record.phase2 === 'ice_wings' ? '#8fdcff' : record.phase2 === 'ember_blades' ? '#ef8d55' : record.phase2 === 'bloom_wings' ? '#79b86d' : '#bc85ff';
    const pulse = .82 + Math.sin(progress * Math.PI) * .18;
    ctx.save(); ctx.globalAlpha = .62; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, height * .025);
    if (record.phase2 === 'orbit_slabs') {
      for (const sign of [-1,1]) ctx.strokeRect(sign * height * .47 - height*.06, -height*.72, height*.12, height*.31);
    } else {
      for (const sign of [-1,1]) {
        ctx.beginPath(); ctx.moveTo(sign*height*.22,-height*.58); ctx.lineTo(sign*height*.58*pulse,-height*.82); ctx.lineTo(sign*height*.42,-height*.35); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }
  function marksmanAttachment(ctx, height, clip, progress) {
    if (clip !== 'aim' && clip !== 'shoot') return;
    const pull = clip === 'aim' ? Math.min(1, progress) : 1 - Math.min(1, progress);
    ctx.save(); ctx.strokeStyle = '#f2db9a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(height*.08,-height*.56); ctx.lineTo(height*(.24+.18*pull),-height*.56); ctx.stroke();
    ctx.fillStyle = '#f2db9a'; ctx.beginPath(); ctx.moveTo(height*(.25+.18*pull),-height*.56); ctx.lineTo(height*(.18+.18*pull),-height*.60); ctx.lineTo(height*(.18+.18*pull),-height*.52); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function managedActor(ctx, name, x, y, options) {
    const entry = managedSource(name);
    if (!entry?.record?.actorContract) return false;
    const height = Number(options.height) || entry.record.frames?.[0]?.[3] || entry.record.rect[3];
    const direction = options.direction || 'front', clip = options.clip || 'idle';
    const progress = Number.isFinite(options.progress) ? options.progress : 0;
    const transform = clipTransform(clip, progress, Number(options.time) || 0, !!options.moving);
    const flip = direction === 'side' && !!options.flip;
    ctx.save(); ctx.translate(x + transform.x * (flip ? -1 : 1), y + transform.y); if (flip) ctx.scale(-1,1);
    ctx.rotate(transform.rotation * (flip ? -1 : 1)); ctx.scale(transform.sx, transform.sy);
    bossAttachments(ctx, entry.record, height, clip, progress, options.phase2);
    drawActorFrame(ctx, entry, direction, height, false);
    // The painterly player master already contains coherent armor, cloth and
    // weapon detail. The rejected 5.1.0 polygon equipment masks are intentionally not
    // composited over it; equipment still affects gameplay and UI normally.
    if (entry.record.rig === 'marksman') marksmanAttachment(ctx, height, clip, progress);
    ctx.restore(); return true;
  }
  function actor(ctx, name, x, y, options, ...legacy) {
    if (options && typeof options === 'object') return managedActor(ctx, name, x, y, options);
    return legacyActor(ctx, name, x, y, options, ...legacy);
  }
  function drawActorPart(ctx, r, image, offset, width, height, u, v, w, h, angle = 0, px = u + w / 2, py = v) {
    ctx.save();
    ctx.translate((px - .5) * width, (py - 1) * height);
    ctx.rotate(angle);
    ctx.drawImage(image, r[offset] + u * r[offset + 2], r[offset + 1] + v * r[offset + 3], w * r[offset + 2], h * r[offset + 3], (u - px) * width, (v - py) * height, w * width + .3, h * height + .3);
    ctx.restore();
  }
  function icon(name) {
    if (name === 'shield') return '<svg class="assetIcon" viewBox="-20 -24 40 52" aria-hidden="true"><path d="M-17-19Q0-27 17-19L15 7Q10 20 0 25Q-10 20-15 7Z" fill="#38525e" stroke="#d0be84" stroke-width="3"/><path d="M0-18V18M-11-8H11" stroke="#c7b57b" stroke-width="3"/></svg>';
    const managed = managedSource(name);
    if (managed) {
      const r = managed.record.rect, sheet = managed.pack;
      return `<svg class="assetIcon" aria-hidden="true" viewBox="${r.join(' ')}"><image href="assets/${sheet.src}" width="${sheet.width}" height="${sheet.height}"/></svg>`;
    }
    const r = sprites[name];
    if (!r) return '';
    const sheet = sheets[r[0]];
    return `<svg class="assetIcon" aria-hidden="true" viewBox="${r.slice(1).join(' ')}"><image href="${sheet.src}" width="${sheet.width}" height="${sheet.height}"/></svg>`;
  }
  function bodyLean(action, progress) {
    const amount = action === 'attack' || action === 'cast' ? .18 : action === 'gather' ? .14 : action === 'hit' ? -.12 : action === 'dodge' ? -.65 : 0;
    return Math.sin(Math.PI * Math.min(1, progress)) * amount;
  }
  function armAngle(action, progress, t, walk) {
    const pulse = Math.sin(Math.PI * Math.min(1, progress));
    if (action === 'attack' || action === 'cast') return -pulse * .65;
    if (action === 'block') return -.65;
    if (action === 'drink') return -pulse * .7;
    if (action === 'gather') return pulse * .3;
    return Math.sin(t * 10) * walk * .12 + Math.sin(t * 1.8) * .015;
  }
  const hands = [{
    x: 0,
    y: 0
  }, {
    x: 0,
    y: 0
  }];
  function hand(action, progress, t, walk, left) {
    const width = 88 * 271 / 494,
      angle = armAngle(action, progress, t, walk) * (left ? 1 : -1),
      h = hands[left ? 1 : 0];
    const dx = (left ? -.09 : .06) * width,
      dy = .33 * 88;
    h.x = (left ? -.28 : .28) * width + dx * Math.cos(angle) - dy * Math.sin(angle);
    h.y = -.7 * 88 + dx * Math.sin(angle) + dy * Math.cos(angle);
    return h;
  }
  function shield(ctx, x, y, size, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle * .12);
    ctx.scale(size / 48, size / 48);
    ctx.fillStyle = '#334f5b';
    ctx.strokeStyle = '#cdbd88';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-17, -19);
    ctx.quadraticCurveTo(0, -27, 17, -19);
    ctx.lineTo(15, 7);
    ctx.quadraticCurveTo(10, 20, 0, 25);
    ctx.quadraticCurveTo(-10, 20, -15, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#9caca9';
    ctx.lineWidth = 1;
    for (let i = -9; i <= 9; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, -15);
      ctx.lineTo(i, 12 - Math.abs(i));
      ctx.stroke();
    }
    ctx.strokeStyle = '#e3ca85';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(0, 17);
    ctx.moveTo(-11, -7);
    ctx.lineTo(11, -7);
    ctx.stroke();
    ctx.restore();
  }
  window.AetherArt = {
    hand,
    shield,
    bodyLean,
    load,
    draw,
    drawFrame,
    drawVfxFrame,
    zonePattern,
    actor,
    weapon,
    patterns,
    icon,
    setAssetManager(manager) { assetManager = manager || null; zonePatternCache.clear(); },
    has: name => !!managedSource(name) || !!images[sprites[name]?.[0]],
    get terrainReady() {
      return terrainReady;
    }
  };
})();
