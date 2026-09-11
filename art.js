"use strict";

/* Aethernfall 4.0.2 — shared raster atlases; all rectangles use source pixels. */
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
  let loading, terrainReady = false;
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
    loading = Promise.all(Object.entries(sheets).map(([name, sheet]) => new Promise(resolve => {
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
  function patterns(ctx, detail = 1) {
    const result = {};
    for (const [name, tile] of Object.entries(materials[detail] || materials[1])) result[name] = ctx.createPattern(tile, 'repeat');
    return result;
  }
  function weapon(ctx, x, y, height, angle) {
    const r = sprites.sword;
    if (!images[r[0]]) return false;
    const width = height * r[3] / r[4];
    // The source sword points down-left; anchor at the grip, not the tile edge.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle - 2.28);
    ctx.drawImage(images[r[0]], r[1], r[2], r[3], r[4], -width * .82, -height * .17, width, height);
    ctx.restore();
    return true;
  }
  // A small cutout rig reuses atlas pixels: two legs, torso, head and arms.
  // Angles stay small at the joins; no image decoding or canvases per frame.
  function actor(ctx, name, x, y, height, t, walk, action, progress, flip = false, death = 0) {
    const r = sprites[name];
    if (!r || !images[r[0]]) return false;
    const width = height * r[3] / r[4],
      stride = Math.sin(t * 10) * walk;
    const arm = armAngle(action, progress, t, walk);
    const lean = bodyLean(action, progress);
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.rotate(lean + death * 1.35);
    ctx.scale(1, 1 + Math.sin(t * 2) * .009);
    if (name === 'boar') {
      drawActorPart(ctx, r, width, height, 0, .72, .5, .28, stride * .12);
      drawActorPart(ctx, r, width, height, .5, .72, .5, .28, -stride * .12);
      drawActorPart(ctx, r, width, height, 0, 0, 1, .72);
    } else {
      drawActorPart(ctx, r, width, height, 0, .72, .5, .28, stride * .15);
      drawActorPart(ctx, r, width, height, .5, .72, .5, .28, -stride * .15);
      drawActorPart(ctx, r, width, height, .23, .28, .54, .44);
      drawActorPart(ctx, r, width, height, 0, 0, 1, .28, Math.sin(t * 1.5) * .012, .5, .28);
      drawActorPart(ctx, r, width, height, 0, .28, .23, .44, arm, .22, .30);
      drawActorPart(ctx, r, width, height, .77, .28, .23, .44, -arm, .78, .30);
    }
    ctx.restore();
    return true;
  }
  function drawActorPart(ctx, r, width, height, u, v, w, h, angle = 0, px = u + w / 2, py = v) {
    ctx.save();
    ctx.translate((px - .5) * width, (py - 1) * height);
    ctx.rotate(angle);
    ctx.drawImage(images[r[0]], r[1] + u * r[3], r[2] + v * r[4], w * r[3], h * r[4], (u - px) * width, (v - py) * height, w * width + .3, h * height + .3);
    ctx.restore();
  }
  function icon(name) {
    if (name === 'shield') return '<svg class="assetIcon" viewBox="-20 -24 40 52" aria-hidden="true"><path d="M-17-19Q0-27 17-19L15 7Q10 20 0 25Q-10 20-15 7Z" fill="#38525e" stroke="#d0be84" stroke-width="3"/><path d="M0-18V18M-11-8H11" stroke="#c7b57b" stroke-width="3"/></svg>';
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
    actor,
    weapon,
    patterns,
    icon,
    has: name => !!images[sprites[name]?.[0]],
    get terrainReady() {
      return terrainReady;
    }
  };
})();

