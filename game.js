(() => {
  'use strict';

  const BUILD_VERSION = '3.4.0';
  const art = window.AetherArt;
  const itemArt = id => art ? art.icon({healing:'potion',dawnBlade:'sword',wardenArmor:'armor',guardianToken:'armor',emberShard:'ore'}[id] || id) : '';
  const $ = id => document.getElementById(id);
  const canvas = $('game'),
    ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
  const mcanvas = $('minimap'),
    mctx = mcanvas.getContext('2d', {
      alpha: false
    });
  const ui = {
    hp: $('hpFill'),
    stamina: $('staminaFill'),
    xp: $('xpFill'),
    level: $('levelText'),
    zone: $('zoneText'),
    objective: $('objectiveText'),
    questTitle: $('questTitle'),
    questProgress: $('questProgress'),
    toast: $('toast'),
    modal: $('modal'),
    modalTitle: $('modalTitle'),
    modalBody: $('modalBody'),
    actionUse: $('actionUse'),
    actionLabel: $('actionLabel'),
    badge: $('zoneBadge'),
    loading: $('loadingOverlay'),
    loadText: $('loadText'),
    loadFill: $('loadFill'),
    herb: $('herbCount'),
    wood: $('woodCount'),
    ore: $('oreCount'),
    gold: $('goldCount'),
    perf: $('perfMonitor'),
    perfFps: $('perfFps'),
    perfTarget: $('perfTarget'),
    perfFrame: $('perfFrame'),
    perfRender: $('perfRender'),
    perfScale: $('perfScale'),
    perfDevice: $('perfDevice'),
    lootTicker: $('lootTicker'),
    perfPill: $('perfPill'),
    perfPillFps: $('perfPillFps'),
    perfPillMs: $('perfPillMs'),
    netPill: $('netPill')
  };

  // Modern mobile browsers share the Pointer Events input path.
  const touchCap = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!touchCap) {
    console.warn('Touch not detected. Mouse fallback enabled.');
  }
  const device = {
    ram: Number(navigator.deviceMemory) || null,
    cores: Number(navigator.hardwareConcurrency) || 4,
    dpr: devicePixelRatio || 1,
    ios: /iPhone|iPad|iPod/i.test(navigator.userAgent),
    android: /Android/i.test(navigator.userAgent)
  };
  const QUALITY = {
    low: {
      ambient: 18,
      particles: 12,
      textureScale: .44,
      shadow: .06,
      fog: .07,
      detail: 0
    },
    medium: {
      ambient: 28,
      particles: 20,
      textureScale: .60,
      shadow: .16,
      fog: .12,
      detail: 1
    },
    high: {
      ambient: 40,
      particles: 30,
      textureScale: .76,
      shadow: .26,
      fog: .17,
      detail: 2
    },
    'very-high': {
      ambient: 54,
      particles: 42,
      textureScale: .88,
      shadow: .36,
      fog: .21,
      detail: 3
    }
  };
  const FPS = [30, 40, 45, 60];
  const detected = device.ios ? 'medium' : device.ram >= 8 && device.cores >= 8 ? 'high' : device.ram >= 6 && device.cores >= 6 ? 'high' : device.ram >= 4 && device.cores >= 4 ? 'medium' : 'low';
  const testStorage = new Map();
  const storage = {
    getItem(key) {
      try {
        return globalThis.__AETHER_TEST__ ? testStorage.get(key) ?? null : localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        if (globalThis.__AETHER_TEST__) testStorage.set(key, String(value));else localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
  };
  let settings = {
    quality: storage.getItem('aef_quality') || detected,
    fps: Number(storage.getItem('aef_fps') || 60)
  };
  if (!Object.hasOwn(QUALITY, settings.quality)) settings.quality = detected;
  if (!FPS.includes(settings.fps)) settings.fps = 60;
  let profile = QUALITY[settings.quality];
  let W = innerWidth,
    H = innerHeight,
    DPR = 1,
    time = 0,
    rafId = 0,
    transitioning = false,
    perfMonitorEnabled = storage.getItem('aef_perf_monitor') === '1',
    perfLastGameFrame = 0,
    perfFrameCount = 0,
    perfRenderTotal = 0,
    perfFrameGapTotal = 0,
    perfWindowStart = performance.now(),
    perfActualFps = 0,
    perfAvgFrameMs = 0,
    perfAvgRenderMs = 0,
    nextRenderAt = 0,
    lastFrame = 0;
  const WORLD = {
    w: 2800,
    h: 1800
  };
  const SAVE = 'aethernfall_save_v30';
  const LEGACY_SAVES = ['aethernfall_save_v27', 'aethernfall_save_v21', 'aethernfall_save_v11'];
  const zones = {
    mistwood: {
      name: 'Туманный лес',
      badge: 'ЛЕС',
      base: '#0e1a15',
      ground: '#2f5538',
      accent: '#83b07a',
      water: '#2b6872',
      scout: {
        x: 470,
        y: 420
      },
      camp: {
        x: 360,
        y: 500
      },
      portal: {
        x: 2100,
        y: 850
      },
      quest: {
        id: 'mist',
        title: 'Следы в тумане',
        steps: ['Поговорите с разведчиком', 'Соберите 3 травы', 'Победите 4 налётчиков', 'Перейдите в Каменную долину']
      },
      next: 'stonevale',
      resources: ['herb', 'wood']
    },
    stonevale: {
      name: 'Каменная долина',
      badge: 'РУИНЫ',
      base: '#292c2c',
      ground: '#6a6558',
      accent: '#c1a876',
      water: '#456167',
      scout: {
        x: 450,
        y: 430
      },
      camp: {
        x: 340,
        y: 520
      },
      portal: {
        x: 210,
        y: 820
      },
      quest: {
        id: 'stone',
        title: 'Пепел старого мира',
        steps: ['Поговорите с разведчиком', 'Соберите 2 руды', 'Победите стража руин', 'Перейдите в Пепельные поля']
      },
      next: 'ashfield',
      resources: ['ore', 'herb']
    },
    ashfield: {
      name: 'Пепельные поля',
      badge: 'ПЕПЕЛ',
      base: '#332522',
      ground: '#735c4b',
      accent: '#d09564',
      water: '#66484b',
      scout: {
        x: 1880,
        y: 1120
      },
      camp: {
        x: 2040,
        y: 1020
      },
      portal: {
        x: 330,
        y: 420
      },
      quest: {
        id: 'ash',
        title: 'Осколок пламени',
        steps: ['Поговорите с хранителем', 'Соберите 4 древесины', 'Победите 6 врагов', 'Вернитесь в Туманный лес']
      },
      next: 'mistwood',
      resources: ['wood', 'ore']
    }
  };
  const player = {
    x: 360,
    y: 500,
    r: 21,
    hp: 240,
    maxHp: 240,
    stamina: 100,
    maxStamina: 100,
    level: 6,
    xp: 34,
    xpNeed: 160,
    gold: 125,
    damage: 32,
    dir: 0,
    speed: 205,
    attackCd: 0,
    dodgeUntil: 0,
    dodgeCd: 0,
    blocking: false,
    combo: 0,
    comboTimer: 0,
    inv: {
      wood: 0,
      ore: 0,
      herb: 0
    },
    equipment: {
      weapon: 'Меч следопыта',
      armor: 'Панцирь следопыта'
    },
    shopOwned: {},
    quests: {
      mist: {
        step: 0,
        herb: 0,
        kills: 0
      },
      stone: {
        step: 0,
        ore: 0,
        guardian: 0
      },
      ash: {
        step: 0,
        wood: 0,
        kills: 0
      }
    }
  };
  let zoneId = 'mistwood',
    entities = [],
    particles = [],
    projectiles = [],
    ambient = [],
    textureImages = {},
    patterns = {},
    interactionLock = 0;
  let lootDrops = [],
    floatingTexts = [];
  const LOOT_TABLE = {
    common: [{
      id: 'coin',
      label: 'Монеты',
      chance: .72,
      count: 6
    }, {
      id: 'herb',
      label: 'Лекарственная трава',
      chance: .18,
      count: 1
    }, {
      id: 'wood',
      label: 'Древесина',
      chance: .10,
      count: 1
    }],
    guardian: [{
      id: 'coin',
      label: 'Монеты',
      chance: .55,
      count: 35
    }, {
      id: 'ore',
      label: 'Серебряная руда',
      chance: .25,
      count: 1
    }, {
      id: 'guardianToken',
      label: 'Знак стража',
      chance: .20,
      count: 1
    }]
  };
  const FIXED_STEP = 1 / 60;
  let accumulator = 0,
    suspended = false,
    nextMapAt = 0,
    nextUIAt = 0,
    nextSaveAt = 15000,
    atmosphereGradient = null;
  const joy = {
      id: null,
      x: 0,
      y: 0,
      bounds: null
    },
    joyEl = $('joystick'),
    stick = $('stick');
  const drawQueue = [],
    staticDrawables = ['camp', 'scout', 'portal', 'player'].map(kind => ({
      kind,
      y: 0
    }));
  const sortDepth = (a, b) => a.y - b.y;
  function visible(x, y, margin = 80) {
    return Math.abs(x - player.x) < W / 2 + margin && Math.abs((y - player.y) * .82) < H / 2 + margin;
  }
  function setText(el, value) {
    if (el && el.textContent !== String(value)) el.textContent = String(value);
  }
  function setWidth(el, value) {
    if (el.style.width !== value) el.style.width = value;
  }
  function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }
  function capture(el, id) {
    try {
      el.setPointerCapture(id);
    } catch {}
  }
  function isPaused() {
    return suspended || transitioning || !ui.modal.classList.contains('hidden');
  }
  function resetInput() {
    resetJoy();
    look.ids.clear();
    player.blocking = false;
    document.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed'));
  }
  function suspend() {
    resetInput();
    suspended = true;
    cancelAnimationFrame(rafId);
    rafId = 0;
    save();
  }
  function resume() {
    if (document.hidden) return;
    suspended = false;
    applyGraphics();
    resetFrameLimiter();
    if (started && !rafId) if (!globalThis.__AETHER_TEST__) rafId = requestAnimationFrame(renderFrame);
  }
  function resizeViewport() {
    resetInput();
    applyGraphics();
    resetFrameLimiter();
  }
  addEventListener('resize', resizeViewport, {
    passive: true
  });
  window.visualViewport?.addEventListener('resize', resizeViewport, {
    passive: true
  });
  addEventListener('orientationchange', resetInput, {
    passive: true
  });
  addEventListener('blur', suspend);
  addEventListener('focus', resume);
  addEventListener('pagehide', suspend);
  addEventListener('pageshow', resume);
  document.addEventListener('visibilitychange', () => document.hidden ? suspend() : resume());
  function drawCombatFeedback() {
    const s = screenPos(player.x, player.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, .82);
    if (player.attackCd > .16) {
      const phase = (.42 - player.attackCd) / .26;
      ctx.strokeStyle = 'rgba(255,224,153,' + (1 - phase) + ')';
      ctx.lineWidth = 3 + player.combo;
      ctx.beginPath();
      ctx.arc(0, 0, 55 + phase * 12, player.dir - 1 + phase * .6, player.dir + .7 + phase * .6);
      ctx.stroke();
    }
    if (time < player.dodgeUntil) {
      ctx.strokeStyle = 'rgba(143,218,222,.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 12, 33, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    const hit = nearbyInteraction();
    if (hit) {
      const e = hit.entity || zones[zoneId].portal;
      if (visible(e.x, e.y)) {
        const p = screenPos(e.x, e.y);
        ctx.strokeStyle = 'rgba(240,213,142,.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 14, 25, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  async function registerPWA() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
      const button = $('updateBtn');
      const offer = () => {
        if (reg.waiting) button.classList.remove('hidden');
      };
      offer();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', offer);
      });
      button.addEventListener('click', () => {
        if (!reg.waiting) return;
        if (!save()) {
          toast('Обновление отложено: прогресс не сохранён');
          return;
        }
        resetInput();
        button.disabled = true;
        reg.waiting.postMessage({
          type: 'ACTIVATE'
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!button.disabled || reloading) return;
        reloading = true;
        location.reload();
      });
      addEventListener('online', () => reg.update().catch(() => {}));
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
      reg.update().catch(() => {});
    } catch (err) {
      console.warn('Offline installation unavailable', err);
    }
  }
  const look = {
    ids: new Set(),
    lastX: 0
  };
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function angleDiff(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }
  function rng(seed) {
    const x = Math.sin(seed * 928.371) * 43758.5453;
    return x - Math.floor(x);
  }
  function updateNetworkStatus() {
    const online = navigator.onLine !== false;
    if (ui.netPill) {
      setText(ui.netPill, online ? '● ONLINE' : '● OFFLINE');
      ui.netPill.classList.toggle('online', online);
      ui.netPill.classList.toggle('offline', !online);
    }
  }
  addEventListener('online', updateNetworkStatus, {
    passive: true
  });
  addEventListener('offline', updateNetworkStatus, {
    passive: true
  });
  function migrateLegacySave() {
    if (storage.getItem(SAVE)) return;
    for (const key of LEGACY_SAVES) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        if (storage.setItem(SAVE, raw)) return;
      } catch {}
    }
  }
  migrateLegacySave();
  const defaults = JSON.parse(JSON.stringify(player));
  let saveEnvelope = {},
    saveBlocked = false,
    restoredPosition = false;
  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function finite(value, fallback, min = 0, max = 1e9) {
    return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  }
  function save() {
    if (saveBlocked) return false;
    const data = {
      ...saveEnvelope,
      schemaVersion: 1,
      version: BUILD_VERSION,
      zoneId,
      player: {
        ...object(saveEnvelope.player),
        ...player,
        inv: {
          ...object(object(saveEnvelope.player).inv),
          ...player.inv
        },
        attackCd: 0,
        dodgeCd: 0,
        dodgeUntil: 0,
        blocking: false,
        combo: 0,
        comboTimer: 0
      },
      settings
    };
    return storage.setItem(SAVE, JSON.stringify(data));
  }
  function load() {
    const raw = storage.getItem(SAVE) || LEGACY_SAVES.map(key => storage.getItem(key)).find(Boolean);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Invalid save');
      saveEnvelope = parsed;
      if (Number(parsed.schemaVersion) > 1) saveBlocked = true;
      const saved = object(parsed.player);
      zoneId = Object.hasOwn(zones, parsed.zoneId) ? parsed.zoneId : zoneId;
      for (const [key, value] of Object.entries(defaults)) if (typeof value === 'number') player[key] = finite(saved[key], value);
      for (const key of ['maxHp', 'maxStamina', 'xpNeed', 'level', 'speed', 'damage']) player[key] = Math.max(1, player[key]);
      player.hp = clamp(player.hp, 1, player.maxHp);
      player.stamina = clamp(player.stamina, 0, player.maxStamina);
      player.x = finite(saved.x, zones[zoneId].camp.x, 70, WORLD.w - 70);
      player.y = finite(saved.y, zones[zoneId].camp.y, 70, WORLD.h - 70);
      player.dir = finite(saved.dir, 0, -Math.PI * 2, Math.PI * 2);
      for (const key of ['wood', 'ore', 'herb', 'guardianToken', 'emberShard']) player.inv[key] = Math.floor(finite(object(saved.inv)[key], 0));
      for (const key of ['weapon', 'armor']) {
        const value = object(saved.equipment)[key];
        if (typeof value === 'string') player.equipment[key] = value.slice(0, 160);
      }
      player.shopOwned = {};
      for (const id of ['dawnBlade', 'wardenArmor']) {
        if (object(saved.shopOwned)[id] === true) player.shopOwned[id] = true;
      }
      for (const [key, fields] of Object.entries(defaults.quests)) for (const field of Object.keys(fields)) player.quests[key][field] = Math.floor(finite(object(object(saved.quests)[key])[field], 0, 0, field === 'step' ? 3 : 1e9));
      const config = object(parsed.settings);
      if (Object.hasOwn(QUALITY, config.quality)) settings.quality = config.quality;
      if (FPS.includes(Number(config.fps))) settings.fps = Number(config.fps);
      player.attackCd = player.dodgeCd = player.dodgeUntil = player.combo = player.comboTimer = 0;
      player.blocking = false;
      restoredPosition = true;
    } catch {
      // Preserve the exact damaged bytes before allowing a fresh save to replace them.
      saveBlocked = !storage.setItem(SAVE + '_recovery_' + Date.now(), raw);
    }
  }
  load();
  function toast(t) {
    if (!ui.toast) return;
    setText(ui.toast, t);
    ui.toast.style.opacity = 1;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => ui.toast.style.opacity = 0, 1900);
  }
  function resetFrameLimiter(now = performance.now()) {
    lastFrame = now;
    accumulator = 0;
    nextRenderAt = now;
    perfLastGameFrame = 0;
    perfFrameCount = 0;
    perfRenderTotal = 0;
    perfFrameGapTotal = 0;
    perfWindowStart = now;
    perfActualFps = 0;
    perfAvgFrameMs = 0;
    perfAvgRenderMs = 0;
  }
  function applyGraphics() {
    profile = QUALITY[settings.quality] || QUALITY.medium;
    W = Math.round(window.visualViewport?.width || innerWidth);
    H = Math.round(window.visualViewport?.height || innerHeight);
    const dprCap = {
      low: 1,
      medium: 1.25,
      high: 1.5,
      'very-high': 1.75
    }[settings.quality];
    DPR = Math.min(device.dpr, dprCap, Math.sqrt(1500000 / (W * H)));
    document.documentElement.style.setProperty('--app-height', H + 'px');
    canvas.width = Math.max(1, Math.floor(W * DPR));
    canvas.height = Math.max(1, Math.floor(H * DPR));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
    patterns = {};
    for (const [k, img] of Object.entries(textureImages)) {
      if (img.complete) patterns[k] = ctx.createPattern(img, 'repeat');
    }
    if(art)Object.assign(patterns,art.patterns(ctx));
    makeAmbient();
    if (particles.length > profile.particles) particles.length = profile.particles;
    atmosphereGradient = null;
  }
  function loadTextures() {
    const names = ['grass', 'dirt', 'stone', 'water', 'wood', 'foliage', 'rune'];
    let done = 0;
    const mark = () => {
      done++;
      ui.loadFill.style.width = 15 + done / names.length * 35 + '%';
    };
    return Promise.allSettled(names.map(name => new Promise(resolve => {
      const im = new Image();
      let settled = false;
      const finish = ok => {
        if (settled) {
          if (ok) {
            textureImages[name] = im;
            patterns[name] = ctx.createPattern(im, 'repeat');
            im.onload = im.onerror = null;
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (ok) {
          textureImages[name] = im;
          im.onload = im.onerror = null;
        }
        mark();
        resolve({
          name,
          ok
        });
      };
      const timer = setTimeout(() => finish(false), 1200);
      im.onload = () => finish(true);
      im.onerror = () => finish(false);
      im.decoding = 'async';
      im.src = new URL(`assets/textures/${name}.png`, document.baseURI).href;
    })));
  }
  function quest() {
    return zones[zoneId].quest;
  }
  function questState() {
    return player.quests[quest().id];
  }
  function currentObjective() {
    const q = quest(),
      s = questState(),
      step = q.steps[Math.min(s.step, q.steps.length - 1)];
    if (q.id === 'mist' && s.step === 1) return `Соберите траву: ${s.herb}/3`;
    if (q.id === 'mist' && s.step === 2) return `Победите налётчиков: ${s.kills}/4`;
    if (q.id === 'stone' && s.step === 1) return `Соберите руду: ${s.ore}/2`;
    if (q.id === 'ash' && s.step === 1) return `Соберите древесину: ${s.wood}/4`;
    if (q.id === 'ash' && s.step === 2) return `Победите врагов: ${s.kills}/6`;
    return step;
  }
  function advanceQuest(reason, persist = true) {
    const q = quest(),
      s = questState();
    const previousStep = s.step;
    if (q.id === 'mist') {
      if (s.step === 0 && reason === 'scout') s.step = 1;else if (s.step === 1 && s.herb >= 3) s.step = 2;else if (s.step === 2 && s.kills >= 4) s.step = 3;else if (s.step === 3 && reason === 'portal') {
        for (const key of Object.keys(s)) s[key] = 0;
      }
    } else if (q.id === 'stone') {
      if (s.step === 0 && reason === 'scout') s.step = 1;else if (s.step === 1 && s.ore >= 2) s.step = 2;else if (s.step === 2 && s.guardian >= 1) s.step = 3;else if (s.step === 3 && reason === 'portal') {
        for (const key of Object.keys(s)) s[key] = 0;
      }
    } else if (q.id === 'ash') {
      if (s.step === 0 && reason === 'scout') s.step = 1;else if (s.step === 1 && s.wood >= 4) s.step = 2;else if (s.step === 2 && s.kills >= 6) s.step = 3;else if (s.step === 3 && reason === 'portal') {
        for (const key of Object.keys(s)) s[key] = 0;
      }
    }
    if (s.step !== previousStep) ensureQuestTargets();
    if (persist) save();
  }
  function ensureQuestTargets() {
    const q = quest(),
      state = questState(),
      z = zones[zoneId];
    if (state.step === 1) {
      const type = q.id === 'mist' ? 'herb' : q.id === 'stone' ? 'ore' : 'wood';
      const needed = (q.id === 'mist' ? 3 : q.id === 'stone' ? 2 : 4) - state[type];
      let available = entities.filter(e => e.kind === 'resource' && e.type === type && e.hp > 0).length;
      while (available < needed) {
        addResource(type, clamp(z.scout.x + 160 + available * 42, 80, WORLD.w - 80), clamp(z.scout.y + 100, 80, WORLD.h - 80));
        available++;
      }
    }
    if (state.step === 2) {
      const type = q.id === 'stone' ? 'guardian' : 'raider';
      const needed = q.id === 'stone' ? 1 - state.guardian : (q.id === 'mist' ? 4 : 6) - state.kills;
      let available = entities.filter(e => e.kind === 'enemy' && e.hp > 0 && (q.id === 'ash' || e.type === type)).length;
      for (let i = available; i < needed; i++) addEnemy(type, clamp(z.scout.x + 300 + i * 65, 80, WORLD.w - 80), clamp(z.scout.y + 250, 80, WORLD.h - 80));
    }
  }
  function addEnemy(type, x, y) {
    const cap = entities.reduce((n, e) => n + (e.kind === 'enemy' && e.type !== 'guardian' && e.hp > 0), 0);
    if (type !== 'guardian' && cap >= 17) return;
    const e = {
      kind: 'enemy',
      type,
      x,
      y,
      r: 18,
      hp: 100,
      maxHp: 100,
      speed: 76,
      damage: 10,
      cd: 0,
      hit: 0,
      seed: rng(x + y),
      stun: 0
    };
    if (type === 'raider') Object.assign(e, {
      r: 21,
      hp: 140,
      maxHp: 140,
      speed: 82,
      damage: 12
    });
    if (type === 'boar') Object.assign(e, {
      r: 19,
      hp: 95,
      maxHp: 95,
      speed: 108,
      damage: 9
    });
    if (type === 'guardian') Object.assign(e, {
      r: 40,
      hp: 620,
      maxHp: 620,
      speed: 48,
      damage: 22
    });
    entities.push(e);
  }
  function addResource(kind, x, y) {
    entities.push({
      kind: 'resource',
      type: kind,
      x,
      y,
      r: 20,
      hp: 1,
      maxHp: 1,
      pulse: rng(x * y) * Math.PI * 2
    });
  }
  function makeAmbient() {
    ambient = [];
    for (let i = 0; i < profile.ambient; i++) ambient.push({
      x: 60 + rng(i + 7) * (WORLD.w - 120),
      y: 60 + rng(i + 91) * (WORLD.h - 120),
      kind: rng(i + 201),
      scale: .65 + rng(i + 44) * 1.55,
      seed: i
    });
  }
  function resetZone() {
    entities = [];
    particles = [];
    projectiles = [];
    lootDrops = [];
    floatingTexts = [];
    const z = zones[zoneId];
    player.x = z.camp.x;
    player.y = z.camp.y;
    player.dir = 0;
    for (let i = 0; i < 58; i++) {
      const x = 150 + rng(i + 300 + zoneId.length) * (WORLD.w - 300),
        y = 150 + rng(i + 620 + zoneId.length * 7) * (WORLD.h - 300);
      let type = i % 4 ? 'raider' : 'boar';
      if (zoneId === 'ashfield' && i % 5 === 0) type = 'boar';
      addEnemy(type, x, y);
    }
    for (let i = 0; i < 32; i++) {
      const x = 150 + rng(i + 1200 + zoneId.length) * (WORLD.w - 300),
        y = 150 + rng(i + 1700 + zoneId.length * 3) * (WORLD.h - 300),
        kind = i % 3 === 0 ? z.resources[0] : z.resources[1];
      addResource(kind, x, y);
    }
    if (zoneId === 'stonevale') addEnemy('guardian', 1680, 720);
    makeAmbient();
  }
  function burst(x, y, color, count = 10, speed = 110) {
    const room = Math.max(0, profile.particles - particles.length);
    count = Math.min(count, room);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2,
        v = (.25 + Math.random()) * speed;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: .32 + Math.random() * .48,
        max: .8,
        size: 1.5 + Math.random() * 3.8,
        color
      });
    }
  }
  function addFloatingText(text, x, y, color = '#fff2bf') {
    if (floatingTexts.length >= 48) floatingTexts.shift();
    floatingTexts.push({
      text,
      x,
      y,
      color,
      life: .85,
      max: .85
    });
  }
  function gainXP(n) {
    player.xp += n;
    while (player.xp >= player.xpNeed) {
      player.xp -= player.xpNeed;
      player.level++;
      player.xpNeed = Math.round(player.xpNeed * 1.24);
      player.maxHp += 18;
      player.hp = player.maxHp;
      player.damage += 3;
      toast('Новый уровень — ' + player.level);
    }
  }
  function lootLabel(id, count) {
    const names = {
      coin: 'Золото',
      herb: 'Трава',
      wood: 'Древесина',
      ore: 'Серебряная руда',
      guardianToken: 'Знак стража',
      emberShard: 'Осколок пламени'
    };
    return `${names[id] || id} ×${count}`;
  }
  function spawnLootFromEnemy(e) {
    const table = e.type === 'guardian' ? LOOT_TABLE.guardian : LOOT_TABLE.common;
    const roll = Math.random();
    let acc = 0;
    for (const d of table) {
      acc += d.chance;
      if (roll <= acc) {
        lootDrops.push({
          id: d.id,
          label: d.label,
          count: d.count + (d.id === 'coin' && e.type === 'guardian' ? Math.floor(Math.random() * 20) : 0),
          x: e.x + (Math.random() * 24 - 12),
          y: e.y + (Math.random() * 24 - 12),
          life: 22
        });
        break;
      }
    }
  }
  function kill(e) {
    e.hp = 0;
    e._corpseUntil = time + 0.75;
    gainXP(e.type === 'guardian' ? 120 : 18);
    player.gold += e.type === 'guardian' ? 90 : 4 + Math.floor(Math.random() * 5);
    spawnLootFromEnemy(e);
    const s = questState();
    if (zoneId === 'mistwood' && quest().id === 'mist' && s.step === 2 && e.type === 'raider') {
      s.kills++;
      advanceQuest('kill');
    }
    if (zoneId === 'stonevale' && e.type === 'guardian' && s.step === 2) {
      s.guardian++;
      advanceQuest('kill');
      toast('Страж руин повержен!');
    }
    if (zoneId === 'ashfield' && s.step === 2) {
      s.kills++;
      advanceQuest('kill');
    }
    burst(e.x, e.y, e.type === 'guardian' ? '#ceb1ea' : '#e27677', 24, 155);
    save();
  }
  function hitTarget(e, dmg) {
    if (!e || e.hp <= 0 || !Number.isFinite(dmg) || dmg <= 0) return;
    if (!Number.isFinite(e.hp)) e.hp = 0;
    e.hp -= dmg;
    e.hit = .16;
    burst(e.x, e.y, '#efcfa8', 9, 118);
    if (e.hp <= 0) kill(e);
  }
  function attack() {
    if (player.attackCd > 0 || isPaused()) return;
    player.attackCd = .42;
    player.combo = player.comboTimer > 0 ? Math.min(3, player.combo + 1) : 1;
    player.comboTimer = .9;
    let target = null,
      bestDist = Infinity;
    for (const e of entities) {
      if (e.hp <= 0 || e.kind !== 'enemy') continue;
      const d = dist(player, e),
        hitRange = 104 + e.r;
      if (d < hitRange && d < bestDist) {
        bestDist = d;
        target = e;
      }
    }
    if (target) player.dir = Math.atan2(target.y - player.y, target.x - player.x);
    const a = player.dir;
    let hits = 0;
    for (const e of entities) {
      if (e.hp <= 0 || e.kind !== 'enemy') continue;
      const d = dist(player, e),
        hitRange = 104 + e.r;
      if (d >= hitRange) continue;
      const ea = Math.atan2(e.y - player.y, e.x - player.x);
      if (Math.abs(angleDiff(ea, a)) >= 1.05) continue;
      const crit = Math.random() < .12;
      const amount = Math.round(player.damage * (crit ? 1.5 : 1) * (1 + .10 * Math.max(0, player.combo - 1)));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      hitTarget(e, amount);
      addFloatingText(crit ? 'КРИТ!' : String(amount), e.x, e.y - e.r - 18, crit ? '#ffe08a' : '#f4d3a3');
      hits++;
    }
    burst(player.x + Math.cos(a) * 36, player.y + Math.sin(a) * 36, '#e4bf69', hits ? 12 + player.combo * 2 : 5, 95);
  }
  function dodge() {
    if (player.dodgeCd > time || player.stamina < 24 || isPaused()) return;
    player.stamina -= 24;
    player.dodgeCd = time + .78;
    player.dodgeUntil = time + .28;
    const moving = Math.hypot(joy.x, joy.y) > .08;
    const mx = moving ? joy.x : Math.cos(player.dir),
      my = moving ? joy.y : Math.sin(player.dir),
      mag = Math.hypot(mx, my) || 1;
    player.x = clamp(player.x + mx / mag * 125, 70, WORLD.w - 70);
    player.y = clamp(player.y + my / mag * 125, 70, WORLD.h - 70);
    burst(player.x, player.y, '#91c6cc', 16, 145);
    toast('Уклонение');
  }
  function skill(n) {
    if (isPaused()) return;
    if (player.stamina < 20) {
      toast('Недостаточно выносливости');
      return;
    }
    player.stamina -= 20;
    const a = player.dir;
    if (n === 1) {
      let hits = 0;
      for (const e of entities) {
        if (e.hp <= 0 || e.kind !== 'enemy') continue;
        const d = dist(player, e),
          ea = Math.atan2(e.y - player.y, e.x - player.x);
        if (d < 165 && Math.abs(angleDiff(ea, a)) < 1.3) {
          hitTarget(e, Math.round(player.damage * 1.85));
          hits++;
        }
      }
      burst(player.x, player.y, '#8fc4e3', 26, 160);
      toast(hits ? `Разрез ветра: ${hits} попад.` : 'Разрез ветра — мимо');
    } else if (n === 2) {
      for (let i = 0; i < 3; i++) {
        const aa = a + (i - 1) * .15;
        projectiles.push({
          x: player.x + Math.cos(a) * 24,
          y: player.y + Math.sin(a) * 24,
          vx: Math.cos(aa) * 480,
          vy: Math.sin(aa) * 480,
          damage: Math.round(player.damage * .9),
          life: .82,
          color: '#bfe9ee'
        });
      }
      toast('Тройной импульс');
    } else {
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + 70);
      burst(player.x, player.y, '#86c99b', 20, 100);
      toast(before === player.maxHp ? 'Второе дыхание готово' : 'Восстановлено здоровье');
    }
  }
  const interactionResult = {
    type: '',
    entity: null,
    d: Infinity
  };
  const interactionPriority = {
    loot: 0,
    scout: 1,
    resource: 2,
    portal: 3
  };
  function considerInteraction(type, entity, radius) {
    const d = Math.hypot(player.x - entity.x, player.y - entity.y);
    if (d >= radius) return;
    if (d < interactionResult.d - 6 || Math.abs(d - interactionResult.d) < 6 && interactionPriority[type] < interactionPriority[interactionResult.type]) {
      interactionResult.type = type;
      interactionResult.entity = entity;
      interactionResult.d = d;
    }
  }
  function nearbyInteraction() {
    interactionResult.type = '';
    interactionResult.entity = null;
    interactionResult.d = Infinity;
    const z = zones[zoneId];
    considerInteraction('scout', z.scout, 120);
    for (const loot of lootDrops) if (loot.life > 0) considerInteraction('loot', loot, 105);
    for (const e of entities) if (e.kind === 'resource' && e.hp > 0) considerInteraction('resource', e, 105);
    if (canUsePortal()) considerInteraction('portal', z.portal, 135);
    return interactionResult.type ? interactionResult : null;
  }
  function openNpcDialog() {
    const z = zones[zoneId];
    const name = zoneId === 'ashfield' ? 'Смотритель Вейл' : 'Разведчик Ари';
    const text = zoneId === 'ashfield' ? 'Пепел движется. Хранитель пробудился. Будьте готовы.' : 'Мы нашли след. Помоги очистить тропу и добраться до следующей долины.';
    openModal(name, `<div class="dialogue"><div class="dialogueName">${name}</div><p>${text}</p><p class="note">Новая цель: ${currentObjective()}</p><button class="btn" id="dialogContinue">Продолжить</button></div>`);
    bindTap($('dialogContinue'), closeModal);
  }
  function canUsePortal() {
    const s = questState();
    return s.step >= 3;
  }
  function interact() {
    if (interactionLock > time || isPaused()) return;
    interactionLock = time + .16;
    const hit = nearbyInteraction();
    if (!hit) return;
    if (hit.type === 'portal') {
      if (!canUsePortal()) {
        toast('Сначала завершите текущую задачу');
        return;
      }
      transitionZone();
      return;
    }
    if (hit.type === 'scout') {
      const s = questState();
      if (s.step === 0) advanceQuest('scout');
      openNpcDialog();
      return;
    }
    if (hit.type === 'loot') {
      const l = hit.entity;
      if (!l) return;
      if (l.id === 'coin') player.gold += l.count;else player.inv[l.id] = (player.inv[l.id] || 0) + l.count;
      if (l.id === 'guardianToken') {
        player.equipment.armor = 'Пластинчатая броня стража';
        player.maxHp += 25;
        player.hp = Math.min(player.maxHp, player.hp + 25);
      }
      const text = l.id === 'coin' ? `Золото +${l.count}` : `Получено: ${l.label} ×${l.count}`;
      toast(text);
      if (ui.lootTicker) {
        setText(ui.lootTicker, text);
        ui.lootTicker.classList.add('show');
        clearTimeout(ui.lootTicker._t);
        ui.lootTicker._t = setTimeout(() => ui.lootTicker.classList.remove('show'), 1500);
      }
      const idx = lootDrops.indexOf(l);
      if (idx >= 0) lootDrops.splice(idx, 1);
      updateUI();
      save();
      return;
    }
    if (hit.type !== 'resource') return;
    const r = hit.entity;
    if (!r || r.kind !== 'resource' || r.hp <= 0) return;
    const key = r.type;
    if (!['wood', 'ore', 'herb'].includes(key)) return;
    player.inv[key] = (player.inv[key] || 0) + 1;
    if (zoneId === 'mistwood' && key === 'herb' && questState().step === 1) {
      questState().herb++;
      advanceQuest('resource');
    }
    if (zoneId === 'stonevale' && key === 'ore' && questState().step === 1) {
      questState().ore++;
      advanceQuest('resource');
    }
    if (zoneId === 'ashfield' && key === 'wood' && questState().step === 1) {
      questState().wood++;
      advanceQuest('resource');
    }
    toast('Получено: ' + {
      wood: 'древесина',
      ore: 'руда',
      herb: 'трава'
    }[key]);
    burst(r.x, r.y, '#d6c274', 12, 105);
    const idx = entities.indexOf(r);
    if (idx >= 0) entities.splice(idx, 1);
    updateUI();
    save();
  }
  function transitionZone() {
    if (transitioning) return;
    transitioning = true;
    ui.loading.classList.remove('hidden');
    ui.loadFill.style.width = '0%';
    setText(ui.loadText, 'Переход: ' + zones[zones[zoneId].next].name);
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / 650);
      ui.loadFill.style.width = p * 100 + '%';
      if (p < 1) {
        requestAnimationFrame(tick);
        return;
      }
      advanceQuest('portal', false);
      zoneId = zones[zoneId].next;
      resetZone();
      save();
      setTimeout(() => {
        resetFrameLimiter();
        ui.loading.classList.add('hidden');
        transitioning = false;
        toast(zones[zoneId].name);
      }, 120);
    }
    requestAnimationFrame(tick);
  }
  function openModal(title, body) {
    shopOpen = false;
    resetInput();
    setText(ui.modalTitle, title);
    ui.modalBody.innerHTML = body;
    ui.modal.classList.remove('hidden');
  }
  function closeModal() {
    shopOpen = false;
    ui.modal.classList.add('hidden');
    resetFrameLimiter();
    updateUI();
  }
  function openInventory() {
    openModal('Сумка и экипировка', `<button class="btn shopEntry" id="shopEntry">Магазин · ${player.gold} золотых</button><div class="grid"><div class="card">${itemArt('sword')}<h3>Оружие</h3><p>${escapeHTML(player.equipment.weapon)}<br>Урон: <b>${player.damage}</b></p></div><div class="card">${itemArt('armor')}<h3>Броня</h3><p>${escapeHTML(player.equipment.armor)}<br>Макс. здоровье: <b>${player.maxHp}</b></p></div><div class="card"><h3>Ресурсы</h3><p>Древесина: ${player.inv.wood}<br>Руда: ${player.inv.ore}<br>Трава: ${player.inv.herb}</p></div><div class="card"><h3>Валюта</h3><p class="gold">${player.gold} золотых</p><p>Знаки: ${player.inv.guardianToken || 0}<br>Осколки: ${player.inv.emberShard || 0}</p></div></div><div class="sectionTitle">КРАФТ</div><button class="btn" id="craftBtn">Закалить меч · 3 древесины + 2 руды</button><button class="btn" id="potionBtn">Зелье жизни · 3 травы + 1 древесина</button>`);
    $('craftBtn').disabled = player.inv.wood < 3 || player.inv.ore < 2;
    $('potionBtn').disabled = player.inv.herb < 3 || player.inv.wood < 1;
    bindTap($('craftBtn'), () => craft('blade'));
    bindTap($('potionBtn'), () => craft('potion'));
    bindTap($('shopEntry'), openShop);
  }
  const SHOP_ITEMS = [{
    id: 'herb',
    name: 'Лекарственные травы',
    note: '3 травы для крафта. Покупка не заменяет сбор по квесту.',
    price: 45,
    resource: 'herb',
    count: 3
  }, {
    id: 'wood',
    name: 'Связка древесины',
    note: '3 древесины для крафта. Покупка не заменяет сбор по квесту.',
    price: 60,
    resource: 'wood',
    count: 3
  }, {
    id: 'ore',
    name: 'Серебряная руда',
    note: '2 руды для закалки оружия.',
    price: 90,
    resource: 'ore',
    count: 2
  }, {
    id: 'healing',
    name: 'Лечебный настой',
    note: 'Сразу восстанавливает до 100 здоровья.',
    price: 35,
    heal: 100
  }, {
    id: 'dawnBlade',
    name: 'Клинок рассвета',
    note: 'Экипируется сразу: +15 к текущему урону. Все прежние усиления сохраняются. Один раз.',
    price: 350,
    damage: 15
  }, {
    id: 'wardenArmor',
    name: 'Доспех хранителя',
    note: 'Экипируется сразу: +40 к максимальному и текущему здоровью. Один раз.',
    price: 450,
    health: 40
  }];
  let shopOpen = false,
    purchaseReadyAt = 0;
  function unavailableItem(item) {
    if (player.shopOwned[item.id]) return 'Уже куплено';
    if (item.heal && player.hp >= player.maxHp) return 'Здоровье полное';
    if (player.gold < item.price) return 'Не хватает ' + (item.price - player.gold) + ' золота';
    return '';
  }
  function openShop() {
    openModal('Магазин', `<div class="shopWallet">Золото: <b>${player.gold}</b></div>
      <p class="note">Предметы и снаряжение применяются сразу. Покупки сохраняются вместе с прогрессом.</p>
      <div class="shopList">${SHOP_ITEMS.map(item => `<article class="card">${itemArt(item.id)}<h3>${item.name}</h3><p>${item.note}</p><button class="btn" id="buy-${item.id}" ${unavailableItem(item) ? 'disabled' : ''}>${unavailableItem(item) || 'Купить · ' + item.price + ' золота'}</button></article>`).join('')}</div>
      <button class="btn" id="shopBack">Вернуться в сумку</button>`);
    shopOpen = true;
    for (const item of SHOP_ITEMS) bindTap($('buy-' + item.id), () => buyItem(item.id));
    bindTap($('shopBack'), openInventory);
  }
  function buyItem(id) {
    const item = SHOP_ITEMS.find(entry => entry.id === id);
    if (!shopOpen || !item || performance.now() < purchaseReadyAt) return false;
    const reason = unavailableItem(item);
    if (reason) {
      toast(reason);
      return false;
    }
    purchaseReadyAt = performance.now() + 350;
    const before = {
      gold: player.gold,
      damage: player.damage,
      hp: player.hp,
      maxHp: player.maxHp,
      inv: {
        ...player.inv
      },
      equipment: {
        ...player.equipment
      },
      shopOwned: {
        ...player.shopOwned
      }
    };
    player.gold -= item.price;
    if (item.resource) player.inv[item.resource] += item.count;
    if (item.heal) player.hp = Math.min(player.maxHp, player.hp + item.heal);
    if (item.damage) {
      player.damage += item.damage;
      player.equipment.weapon = item.name;
      player.shopOwned[id] = true;
    }
    if (item.health) {
      player.maxHp += item.health;
      player.hp += item.health;
      player.equipment.armor = item.name;
      player.shopOwned[id] = true;
    }
    if (!save()) {
      Object.assign(player, before);
      toast('Покупка отменена: не удалось сохранить прогресс');
      return false;
    }
    updateUI();
    openShop();
    toast('Куплено: ' + item.name);
    return true;
  }
  function devicePanel() {
    const names = {
      low: 'Низкое',
      medium: 'Среднее',
      high: 'Высокое',
      'very-high': 'Очень высокое'
    };
    return `<div class="sectionTitle">ИГРА НА УСТРОЙСТВЕ</div>
      <div class="card"><p>Текущее качество: <b>${names[settings.quality]}</b><br>
      Лимит отрисовки: <b>${settings.fps} FPS</b><br>Разрешение игры: ${canvas.width} × ${canvas.height}</p></div>
      <p class="note">Если телефон нагревается или игра дёргается, включите экономию. Баланс вернёт среднее качество и 60 FPS.</p>
      <div class="devicePresets"><button class="btn" id="economyBtn">Экономия · 30 FPS</button><button class="btn" id="balancedBtn">Баланс · 60 FPS</button></div>`;
  }
  function applyPreset(quality, fps) {
    settings.quality = quality;
    settings.fps = fps;
    storage.setItem('aef_quality', quality);
    storage.setItem('aef_fps', String(fps));
    applyGraphics();
    resetFrameLimiter();
    save();
    openMenu();
  }
  function craft(recipe = 'blade') {
    if (recipe === 'blade' && player.inv.wood >= 3 && player.inv.ore >= 2) {
      player.inv.wood -= 3;
      player.inv.ore -= 2;
      player.damage += 5;
      player.equipment.weapon = 'Закалённый меч следопыта';
      gainXP(35);
      save();
      closeModal();
      toast('Оружие улучшено: +5 урона');
    } else if (recipe === 'potion' && player.inv.herb >= 3 && player.inv.wood >= 1) {
      player.inv.herb -= 3;
      player.inv.wood -= 1;
      player.maxHp += 12;
      player.hp = player.maxHp;
      gainXP(20);
      save();
      closeModal();
      toast('Создано зелье жизни · +12 макс. HP');
    } else toast('Недостаточно ресурсов');
  }
  function openMenu() {
    openModal('Настройки · v' + BUILD_VERSION, `<div class="stats"><div class="stat"><b>${player.level}</b>Уровень</div><div class="stat"><b>${Math.round(player.hp)}</b>Здоровье</div><div class="stat"><b>${player.damage}</b>Урон</div></div><div class="sectionTitle">КАЧЕСТВО ГРАФИКИ</div><div class="settingRow"><div class="seg" id="qualitySeg">${['low', 'medium', 'high', 'very-high'].map(q => `<button data-q="${q}" class="${settings.quality === q ? 'active' : ''}">${q === 'very-high' ? 'Very High' : q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div><div class="note">Меняет внутреннее разрешение canvas, плотность окружения и лимит частиц, детализацию текстур, тени и туман. Применяется сразу.</div></div><div class="sectionTitle">ЧАСТОТА КАДРОВ</div><div class="settingRow"><div class="seg fps" id="fpsSeg">${FPS.map(f => `<button data-f="${f}" class="${settings.fps === f ? 'active' : ''}">${f}</button>`).join('')}</div><div class="note">Лимит управляет реальными отрисованными кадрами. Монитор считает только кадры после update + draw.</div></div><div class="sectionTitle">МОНИТОР ПРОИЗВОДИТЕЛЬНОСТИ</div><button class="btn" id="perfBtn">${perfMonitorEnabled ? 'Выключить frame-time monitor' : 'Включить frame-time monitor'}</button>${devicePanel()}<div class="sectionTitle">СОХРАНЕНИЕ</div><button class="btn" id="saveBtn">Сохранить прогресс</button>`);
    document.querySelectorAll('#qualitySeg button').forEach(b => bindTap(b, () => {
      settings.quality = b.dataset.q;
      storage.setItem('aef_quality', settings.quality);
      applyGraphics();
      save();
      openMenu();
    }));
    document.querySelectorAll('#fpsSeg button').forEach(b => bindTap(b, () => {
      settings.fps = Number(b.dataset.f);
      storage.setItem('aef_fps', String(settings.fps));
      resetFrameLimiter();
      save();
      openMenu();
    }));
    bindTap($('saveBtn'), () => {
      toast(save() ? 'Прогресс сохранён' : 'Не удалось сохранить: хранилище недоступно');
    });
    bindTap($('perfBtn'), () => {
      perfMonitorEnabled = !perfMonitorEnabled;
      storage.setItem('aef_perf_monitor', perfMonitorEnabled ? '1' : '0');
      refreshPerformanceMonitorVisibility();
      openMenu();
    });
    bindTap($('economyBtn'), () => applyPreset('low', 30));
    bindTap($('balancedBtn'), () => applyPreset('medium', 60));
  }
  function bindTap(el, fn) {
    if (!el) return;
    const action = el.classList.contains('action');
    // Gameplay fires on contact; modal buttons fire on click so scrolling is safe.
    el.addEventListener(action ? 'pointerdown' : 'click', event => {
      if (el.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      fn(event);
    }, {
      passive: false
    });
  }
  function setJoystickFromPoint(point) {
    const r = joy.bounds || joyEl.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2,
      max = Math.min(r.width, r.height) * .36;
    let dx = point.clientX - cx,
      dy = point.clientY - cy,
      l = Math.hypot(dx, dy);
    if (l > max) {
      dx = dx / l * max;
      dy = dy / l * max;
    }
    joy.x = dx / max;
    joy.y = dy / max;
    if (Math.hypot(joy.x, joy.y) < .08) {
      joy.x = 0;
      joy.y = 0;
    }
    if (stick) stick.style.transform = `translate(${dx}px,${dy}px)`;
  }
  function resetJoy() {
    joy.id = null;
    joy.bounds = null;
    joy.x = joy.y = 0;
    if (stick) stick.style.transform = 'translate(0,0)';
  }
  function moveJoy(e) {
    setJoystickFromPoint(e);
  }
  joyEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    if (joy.id !== null) return;
    if (isPaused()) return;
    joy.id = e.pointerId;
    joy.bounds = joyEl.getBoundingClientRect();
    capture(joyEl, e.pointerId);
    moveJoy(e);
  }, {
    passive: false
  });
  joyEl.addEventListener('pointermove', e => {
    if (e.pointerId !== joy.id) return;
    e.preventDefault();
    moveJoy(e);
  }, {
    passive: false
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => joyEl.addEventListener(ev, e => {
    if (e.pointerId === joy.id) resetJoy();
  }, {
    passive: false
  }));
  window.addEventListener('pointerup', e => {
    if (e.pointerId === joy.id) resetJoy();
  }, {
    passive: true
  });
  window.addEventListener('pointercancel', e => {
    if (e.pointerId === joy.id) resetJoy();
  }, {
    passive: true
  });
  canvas.addEventListener('pointerdown', e => {
    if (isPaused() || e.clientX < W * .43 || look.ids.size) return;
    look.ids.add(e.pointerId);
    look.lastX = e.clientX;
    capture(canvas, e.pointerId);
  }, {
    passive: false
  });
  canvas.addEventListener('pointermove', e => {
    if (!look.ids.has(e.pointerId)) return;
    e.preventDefault();
    const dx = e.clientX - look.lastX;
    look.lastX = e.clientX;
    player.dir += dx * .008;
  }, {
    passive: false
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => canvas.addEventListener(ev, e => look.ids.delete(e.pointerId), {
    passive: false
  }));
  document.querySelectorAll('.action').forEach(btn => {
    const a = btn.dataset.act;
    if (a === 'block') {
      let blockPointer = null;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        if (isPaused() || blockPointer !== null && player.blocking) return;
        blockPointer = e.pointerId;
        player.blocking = true;
        btn.classList.add('pressed');
        capture(btn, e.pointerId);
      }, {
        passive: false
      });
      const release = e => {
        if (blockPointer === null || e.pointerId === blockPointer) {
          blockPointer = null;
          player.blocking = false;
          btn.classList.remove('pressed');
        }
      };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, release, {
        passive: false
      }));
      window.addEventListener('pointerup', release, {
        passive: true
      });
      window.addEventListener('pointercancel', release, {
        passive: true
      });
      return;
    }
    bindTap(btn, () => {
      if (a === 'attack') attack();else if (a === 'dodge') dodge();else if (a === 'skill1') skill(1);else if (a === 'skill2') skill(2);else if (a === 'skill3') skill(3);else if (a === 'use') interact();
    });
  });
  bindTap($('inventoryBtn'), openInventory);
  bindTap($('menuBtn'), openMenu);
  bindTap($('modalClose'), closeModal);
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), {
    passive: false
  }));
  function updateEnemyPatrol(dt) {
    for (const e of entities) {
      if (e.kind !== 'enemy' || e.hp <= 0) continue;
      if (!Number.isFinite(e.patrolT)) e.patrolT = 0;
      if (!Number.isFinite(e.dir)) e.dir = e.seed * 6.283185;
      const d = dist(player, e);
      if (d >= 620) {
        e.patrolT += dt;
        if (e.patrolT >= 1.1) {
          e.patrolT = 0;
          e.dir += (rng(Math.floor(time * 3) + Math.floor(e.x) + Math.floor(e.y)) - .5) * 0.9;
        }
        const speed = e.type === 'guardian' ? 12 : 18;
        e.x = clamp(e.x + Math.cos(e.dir) * speed * dt, 45, WORLD.w - 45);
        e.y = clamp(e.y + Math.sin(e.dir) * speed * dt, 45, WORLD.h - 45);
      }
    }
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    let live = 0;
    for (const e of entities) if (e.kind !== 'enemy' || e.hp > 0 || e._corpseUntil > time) entities[live++] = e;
    entities.length = live;
    time += dt;
    player.attackCd = Math.max(0, player.attackCd - dt);
    player.comboTimer = Math.max(0, player.comboTimer - dt);
    if (player.comboTimer === 0) player.combo = 0;
    player.stamina = clamp(player.stamina + (player.blocking ? 12 : 24) * dt, 0, player.maxStamina);
    const moving = Math.hypot(joy.x, joy.y) > .06;
    const dodgeUntil = Number.isFinite(player.dodgeUntil) ? player.dodgeUntil : 0;
    player.dodgeUntil = dodgeUntil;
    const speed = player.speed * (player.blocking ? .58 : 1) * (player.dodgeUntil > time ? .9 : 1);
    if (moving && time >= dodgeUntil) {
      player.x = clamp(player.x + joy.x * speed * dt, 70, WORLD.w - 70);
      player.y = clamp(player.y + joy.y * speed * dt, 70, WORLD.h - 70);
      player.dir = Math.atan2(joy.y, joy.x);
    }
    updateEnemies(dt);
    updateProjectiles(dt);
    updateEffects(dt);
  }
  function updateEnemies(dt) {
    for (const e of entities) {
      if (e.hp <= 0 || e.kind !== 'enemy') continue;
      e.cd = Math.max(0, e.cd - dt);
      e.hit = Math.max(0, e.hit - dt);
      const d = dist(player, e);
      if (d < 620) {
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        if (d > e.r + player.r + 8) {
          e.x = clamp(e.x + Math.cos(a) * e.speed * dt, 40, WORLD.w - 40);
          e.y = clamp(e.y + Math.sin(a) * e.speed * dt, 40, WORLD.h - 40);
        } else if (e.cd <= 0) {
          e.cd = e.type === 'guardian' ? 1.05 : 1.35;
          if (time >= player.dodgeUntil) {
            const dmg = player.blocking ? Math.ceil(e.damage * .26) : e.damage;
            player.hp = Math.max(0, player.hp - dmg);
            addFloatingText('−' + dmg, player.x, player.y - 52, '#ff9690');
            burst(player.x, player.y, '#e06d68', 7, 80);
            if (player.hp <= 0) {
              player.hp = player.maxHp;
              player.x = zones[zoneId].camp.x;
              player.y = zones[zoneId].camp.y;
              toast('Вы возвращены к лагерю');
            }
          }
        }
      }
    }
    updateEnemyPatrol(dt);
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      let hit = false;
      for (const e of entities) {
        if (e.hp > 0 && e.kind === 'enemy' && dist(p, e) < e.r + 7) {
          hitTarget(e, p.damage);
          hit = true;
          break;
        }
      }
      if (hit || p.life <= 0) projectiles.splice(i, 1);
    }
  }
  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = Math.pow(.94, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = lootDrops.length - 1; i >= 0; i--) {
      lootDrops[i].life -= dt;
      if (lootDrops[i].life <= 0) lootDrops.splice(i, 1);
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      floatingTexts[i].y -= 28 * dt;
      floatingTexts[i].life -= dt;
      if (floatingTexts[i].life <= 0) floatingTexts.splice(i, 1);
    }
  }
  function updateUI() {
    setWidth(ui.hp, player.hp / player.maxHp * 100 + '%');
    setWidth(ui.stamina, player.stamina / player.maxStamina * 100 + '%');
    setWidth(ui.xp, player.xp / player.xpNeed * 100 + '%');
    setText(ui.level, 'Ур. ' + player.level);
    const z = zones[zoneId];
    setText(ui.zone, z.name);
    setText(ui.objective, currentObjective());
    setText(ui.questTitle, z.quest.title);
    setText(ui.questProgress, currentObjective());
    setText(ui.badge, z.badge);
    setText(ui.herb, player.inv.herb);
    setText(ui.wood, player.inv.wood);
    setText(ui.ore, player.inv.ore);
    setText(ui.gold, player.gold);
    const hit = nearbyInteraction();
    ui.actionUse.classList.toggle('available', !!hit);
    setText(ui.actionLabel, hit ? {
      portal: 'ПЕРЕЙТИ',
      scout: 'ГОВОРИТЬ',
      loot: 'ПОДОБРАТЬ',
      resource: 'СОБРАТЬ'
    }[hit.type] : 'ДЕЙСТВИЕ');
  }
  function isoY(v) {
    return v * .82;
  }
  function shadowColor(alpha) {
    return `rgba(0,0,0,${Math.max(.02, alpha * (.25 + profile.shadow * 1.45)).toFixed(3)})`;
  }
  function groundShadow(x,y,width) {
    ctx.save();ctx.fillStyle=shadowColor(.3);ctx.beginPath();
    ctx.ellipse(x,y,width,width*.28,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function screenPos(x, y) {
    return {
      x: x - player.x + W / 2,
      y: isoY(y - player.y) + H / 2
    };
  }
  function texturedRect(pattern, base, x, y, w, h, alpha = 1) {
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pattern;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  }
  const groundSpots = Array.from({
    length: 54
  }, (_, i) => ({
    x: rng(i + 30) * WORLD.w,
    y: rng(i + 90) * WORLD.h * .82,
    r: 24 + rng(i + 120) * 42
  }));
  let fogGradient = null,
    fogKey = '';
  function drawGround(z) {
    ctx.fillStyle = z.base;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 - player.x, H / 2 - player.y * .82);
    const basePattern = zoneId === 'mistwood' ? patterns.grass : zoneId === 'stonevale' ? patterns.stone : patterns.dirt;
    texturedRect(basePattern, z.ground, -160, -160, WORLD.w + 320, WORLD.h * .82 + 320, .42 + profile.textureScale * .3);
    ctx.globalAlpha = .2 + profile.detail * .06;
    for (let i = 0; !art?.terrainReady && i < 24 + profile.detail * 10; i++) {
      const {
        x,
        y,
        r
      } = groundSpots[i];
      if (!visible(x, y / .82, r)) continue;
      ctx.fillStyle = z.accent;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (profile.fog > 0) {
      const key = H + ':' + profile.fog;
      const g = fogGradient && fogKey === key ? fogGradient : ctx.createLinearGradient(0, 0, 0, H);
      if (fogKey !== key || !fogGradient) {
        g.addColorStop(0, `rgba(210,235,225,${profile.fog * .15})`);
        g.addColorStop(.55, 'rgba(255,255,255,0)');
        g.addColorStop(1, `rgba(0,0,0,${profile.fog * .45})`);
        fogGradient = g;
        fogKey = key;
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }
  function drawAmbientItem(a) {
    if(art?.has('pine')){
      const p=screenPos(a.x,a.y),tree=zoneId==='mistwood';
      const name=tree?(a.kind<.5?'pine':'oak'):zoneId==='stonevale'?'rock':a.kind<.3?'ruins':'rock';
      ctx.save();
      if(tree&&Math.abs(a.x-player.x)<85&&a.y>player.y&&a.y-player.y<190)ctx.globalAlpha=.3;
      groundShadow(p.x,p.y+12,(tree?30:24)*a.scale);
      art.draw(ctx,name,p.x,p.y+16,(tree?118:50)*a.scale);
      ctx.restore();return;
    }
    const s = screenPos(a.x, a.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, .82);
    const shade = Math.abs(a.x - player.x) < 45 && a.y > player.y && a.y - player.y < 75 ? .35 : profile.detail === 0 ? .65 : 1;
    if (zoneId === 'mistwood') {
      ctx.fillStyle = shadowColor(.22);
      ctx.beginPath();
      ctx.ellipse(0, 18, 28 * a.scale, 9 * a.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(44,78,46,${.78 * shade})`;
      ctx.beginPath();
      ctx.arc(0, -14, 18 * a.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(77,117,60,${.72 * shade})`;
      ctx.beginPath();
      ctx.arc(-15, -6, 12 * a.scale, 0, Math.PI * 2);
      ctx.arc(14, -7, 13 * a.scale, 0, Math.PI * 2);
      ctx.fill();
      if (patterns.foliage && profile.detail >= 2) {
        ctx.save();
        ctx.globalAlpha = .18;
        ctx.fillStyle = patterns.foliage;
        ctx.beginPath();
        ctx.arc(-15, -6, 12 * a.scale, 0, Math.PI * 2);
        ctx.arc(14, -7, 13 * a.scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#60452e';
      ctx.fillRect(-3, 4, 6, 20 * a.scale);
    } else if (zoneId === 'stonevale') {
      ctx.fillStyle = shadowColor(.25);
      ctx.beginPath();
      ctx.ellipse(0, 14, 25 * a.scale, 8 * a.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#77766d';
      ctx.beginPath();
      ctx.moveTo(-18, 11);
      ctx.lineTo(-8, -17);
      ctx.lineTo(14, -9);
      ctx.lineTo(19, 11);
      ctx.closePath();
      ctx.fill();
      if (profile.detail > 1) {
        ctx.strokeStyle = '#aaa79b';
        ctx.globalAlpha = .45;
        ctx.beginPath();
        ctx.moveTo(-5, -7);
        ctx.lineTo(6, -1);
        ctx.lineTo(1, 8);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = shadowColor(.25);
      ctx.beginPath();
      ctx.ellipse(0, 14, 24 * a.scale, 8 * a.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#553a31';
      ctx.beginPath();
      ctx.moveTo(-20, 10);
      ctx.lineTo(-3, -16);
      ctx.lineTo(18, 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#bd805a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, 4);
      ctx.lineTo(2, -9);
      ctx.lineTo(10, 6);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawCamp(z) {
    if(art?.has('house')){
      const p=screenPos(z.camp.x,z.camp.y);groundShadow(p.x,p.y+14,55);
      art.draw(ctx,'house',p.x,p.y+20,130);return;
    }
    const s = screenPos(z.camp.x, z.camp.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, .82);
    ctx.fillStyle = shadowColor(.30);
    ctx.beginPath();
    ctx.ellipse(0, 18, 62, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(242,178,82,.07)';
    ctx.beginPath();
    ctx.ellipse(17, 16, 78, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(242,178,82,.09)';
    ctx.beginPath();
    ctx.ellipse(17, 16, 43, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#543b2a';
    ctx.beginPath();
    ctx.moveTo(-50, 16);
    ctx.lineTo(0, -29);
    ctx.lineTo(50, 16);
    ctx.closePath();
    ctx.fill();
    if (patterns.wood) {
      ctx.globalAlpha = .25;
      ctx.fillStyle = patterns.wood;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = '#a07852';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-43, 13);
    ctx.lineTo(0, -22);
    ctx.lineTo(43, 13);
    ctx.stroke();
    ctx.fillStyle = '#ffcf77';
    ctx.shadowColor = '#e7a158';
    ctx.shadowBlur = profile.detail >= 2 ? 8 : 0;
    ctx.beginPath();
    ctx.arc(17, 8, 9 + Math.sin(time * 7) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawScout(z) {
    if(art?.has('scout')){
      const p=screenPos(z.scout.x,z.scout.y);groundShadow(p.x,p.y+14,22);
      art.draw(ctx,'scout',p.x,p.y+17,82);return;
    }
    const s = screenPos(z.scout.x, z.scout.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, .82);
    ctx.fillStyle = shadowColor(.25);
    ctx.beginPath();
    ctx.ellipse(0, 17, 25, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = zoneId === 'ashfield' ? '#70423a' : '#2d4650';
    ctx.beginPath();
    ctx.moveTo(-15, 15);
    ctx.lineTo(-12, -12);
    ctx.lineTo(0, -21);
    ctx.lineTo(14, -11);
    ctx.lineTo(17, 15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d6b891';
    ctx.beginPath();
    ctx.arc(0, -21, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8dde0';
    ctx.beginPath();
    ctx.moveTo(-12, -27);
    ctx.quadraticCurveTo(0, -44, 14, -28);
    ctx.lineTo(11, -21);
    ctx.lineTo(-12, -21);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawPortal(z) {
    const s = screenPos(z.portal.x, z.portal.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, .82);
    const pulse = 1 + Math.sin(time * 3) * .07,
      col = zoneId === 'mistwood' ? '#76c2ce' : zoneId === 'stonevale' ? '#d9ad6d' : '#cf745c';
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = col;
    ctx.lineWidth = 7;
    ctx.shadowColor = col;
    ctx.shadowBlur = profile.detail >= 2 ? 10 : 0;
    ctx.beginPath();
    ctx.ellipse(0, 0, 38, 53, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = col;
    ctx.globalAlpha = .16;
    ctx.beginPath();
    ctx.ellipse(0, 0, 29, 43, 0, 0, Math.PI * 2);
    ctx.fill();
    if (patterns.rune && profile.detail >= 2) {
      ctx.globalAlpha = .22;
      ctx.fillStyle = patterns.rune;
      ctx.beginPath();
      ctx.ellipse(0, 0, 27, 41, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawResource(e) {
    if(art?.has(e.type)){
      const p=screenPos(e.x,e.y);groundShadow(p.x,p.y+12,17);
      art.draw(ctx,e.type,p.x,p.y+16,e.type==='herb'?36:40);return;
    }
    const s = screenPos(e.x, e.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, .82);
    ctx.fillStyle = shadowColor(.22);
    ctx.beginPath();
    ctx.ellipse(0, 16, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (e.type === 'ore') {
      ctx.fillStyle = '#8e959d';
      ctx.beginPath();
      ctx.moveTo(-13, 9);
      ctx.lineTo(-4, -17);
      ctx.lineTo(15, -7);
      ctx.lineTo(8, 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#dbe2e5';
      ctx.beginPath();
      ctx.arc(4, -3, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'wood') {
      ctx.fillStyle = '#6f5135';
      ctx.fillRect(-5, -3, 10, 23);
      ctx.fillStyle = '#6da360';
      ctx.beginPath();
      ctx.arc(-9, -8, 12, 0, Math.PI * 2);
      ctx.arc(8, -6, 11, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#86b36a';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc((i - 2) * 6, -7 + i % 2 * 5, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawEntity(e) {
    if(art?.has(e.type)){
      const p=screenPos(e.x,e.y),height=e.type==='guardian'?122:e.type==='boar'?54:80;
      groundShadow(p.x,p.y+14,e.r*1.15);
      ctx.save();ctx.globalAlpha=e.hp<=0?clamp((e._corpseUntil-time)/.75,0,1)*.5:e.hit>0?.65:1;
      const bob=e.hp>0&&dist(player,e)>e.r+player.r+8?Math.sin(time*7+e.seed*6)*1.2:0;
      art.draw(ctx,e.type,p.x,p.y+17+bob,height,player.x<e.x);
      ctx.restore();
      if(e.hp>0){const width=e.r*2.1;ctx.fillStyle='#111b19';ctx.fillRect(p.x-width/2,p.y-height+10,width,5);ctx.fillStyle=e.type==='guardian'?'#d5b077':'#dc7772';ctx.fillRect(p.x-width/2,p.y-height+10,width*clamp(e.hp/e.maxHp,0,1),5);}
      return;
    }
    const s = screenPos(e.x, e.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, .82);
    ctx.fillStyle = shadowColor(.26);
    ctx.beginPath();
    ctx.ellipse(0, 16, e.r * 1.35, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = e.hp <= 0 ? clamp((e._corpseUntil - time) / .75, 0, 1) * .45 : e.hit > 0 ? .65 : 1;
    if (e.hp <= 0) {
      ctx.scale(1, .45);
      ctx.rotate(.25);
    }
    ctx.fillStyle = e.type === 'guardian' ? '#76588a' : e.type === 'raider' ? '#9c4d56' : '#6b4d38';
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d6b891';
    ctx.beginPath();
    ctx.arc(0, -e.r * .82, e.r * .45, 0, Math.PI * 2);
    ctx.fill();
    if (e.type === 'guardian') {
      ctx.strokeStyle = '#d7b56b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-e.r * .65, -e.r * .15);
      ctx.lineTo(e.r * .7, -e.r * .7);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#161d1b';
      ctx.fillRect(-e.r * .45, -e.r * .92, e.r * .9, 4);
    }
    const hpw = e.r * 2.1;
    ctx.fillStyle = 'rgba(0,0,0,.48)';
    ctx.fillRect(-hpw / 2, -e.r - 15, hpw, 4);
    ctx.fillStyle = e.type === 'guardian' ? '#d8a1e8' : '#df6f73';
    ctx.fillRect(-hpw / 2, -e.r - 15, hpw * Math.max(0, e.hp / e.maxHp), 4);
    ctx.restore();
  }
  function drawPlayer() {
    if(art?.has('hero')){
      const p=screenPos(player.x,player.y),moving=Math.hypot(joy.x,joy.y)>.08;
      groundShadow(p.x,p.y+15,24);
      ctx.save();if(time<player.dodgeUntil)ctx.globalAlpha=.68;
      art.draw(ctx,Math.sin(player.dir)<-.3?'heroBack':'hero',p.x,p.y+18+(moving?Math.sin(time*12)*1.6:0),88,Math.cos(player.dir)<0);
      ctx.restore();
      // Directional weapon remains a separate layer for aiming and attack feedback.
      ctx.save();ctx.translate(p.x,p.y-4);ctx.rotate(player.dir);
      ctx.strokeStyle='#e8d4a0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(36,0);ctx.stroke();
      if(player.blocking){ctx.strokeStyle='#acd5df';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,36,-.95,.95);ctx.stroke();}
      ctx.restore();return;
    }
    const s = screenPos(player.x, player.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, .82);
    ctx.fillStyle = shadowColor(.30);
    ctx.beginPath();
    ctx.ellipse(0, 18, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (time < player.dodgeUntil) ctx.globalAlpha = .72;
    ctx.fillStyle = '#2f505c';
    ctx.beginPath();
    ctx.moveTo(-18, 14);
    ctx.lineTo(-14, -13);
    ctx.lineTo(0, -24);
    ctx.lineTo(15, -13);
    ctx.lineTo(18, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e0c7a0';
    ctx.beginPath();
    ctx.arc(0, -21, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8dde0';
    ctx.beginPath();
    ctx.moveTo(-13, -28);
    ctx.quadraticCurveTo(0, -47, 15, -28);
    ctx.lineTo(11, -20);
    ctx.lineTo(-13, -20);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.rotate(player.dir);
    ctx.strokeStyle = '#dfbc67';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(5, -3);
    ctx.lineTo(38, -11);
    ctx.stroke();
    ctx.restore();
    if (player.blocking) {
      ctx.strokeStyle = '#b8d9dc';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 37, -.95, .95);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawProjectiles() {
    for (const p of projectiles) {
      const s = screenPos(p.x, p.y);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = profile.detail >= 2 ? 6 : 0;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  function drawParticles() {
    for (const p of particles) {
      const s = screenPos(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawLandmarks(z) {
    ctx.save();
    // Major road/path

    ctx.translate(W / 2 - player.x, H / 2 - player.y * .82);
    ctx.globalAlpha = .42;
    ctx.fillStyle = zoneId === 'mistwood' ? '#7d7657' : zoneId === 'stonevale' ? '#928875' : '#8d6656';
    ctx.beginPath();
    ctx.moveTo(-180, WORLD.h * .18);
    ctx.quadraticCurveTo(WORLD.w * .42, WORLD.h * .46, WORLD.w * .50, WORLD.h * .74);
    ctx.quadraticCurveTo(WORLD.w * .58, WORLD.h * .98, WORLD.w + 180, WORLD.h * .82);
    ctx.lineTo(WORLD.w + 180, WORLD.h * .95);
    ctx.quadraticCurveTo(WORLD.w * .57, WORLD.h * 1.08, WORLD.w * .45, WORLD.h * .80);
    ctx.quadraticCurveTo(WORLD.w * .34, WORLD.h * .54, -180, WORLD.h * .30);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = .95;
    // Zone landmark cluster
    const lx = zoneId === 'mistwood' ? 1180 : zoneId === 'stonevale' ? 1220 : 1520;
    const ly = zoneId === 'mistwood' ? 420 : zoneId === 'stonevale' ? 520 : 900;
    ctx.save();
    ctx.translate(lx, ly * .82);
    ctx.scale(1, .82);
    ctx.fillStyle = shadowColor(.18);
    ctx.beginPath();
    ctx.ellipse(0, 30, 150, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    if (art?.draw(ctx,zoneId==='mistwood'?'house':zoneId==='stonevale'?'ruins':'shrine',0,30,180)) {
      // The existing landmark position is retained.
    } else if (zoneId === 'mistwood') {
      ctx.fillStyle = '#5d4a39';
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(i * 58 - 11, -62, 22, 110);
      }
      ctx.fillStyle = '#7b6651';
      ctx.beginPath();
      ctx.moveTo(-115, -54);
      ctx.lineTo(0, -112);
      ctx.lineTo(115, -54);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#8aac72';
      ctx.beginPath();
      ctx.arc(-75, -90, 35, 0, Math.PI * 2);
      ctx.arc(10, -108, 40, 0, Math.PI * 2);
      ctx.arc(78, -90, 32, 0, Math.PI * 2);
      ctx.fill();
    } else if (zoneId === 'stonevale') {
      ctx.fillStyle = '#6f6a60';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(-100 + i * 55, -80, 34, 110);
      }
      ctx.fillStyle = '#827b6c';
      ctx.beginPath();
      ctx.moveTo(-118, -80);
      ctx.lineTo(-102, -125);
      ctx.lineTo(-66, -100);
      ctx.lineTo(-42, -142);
      ctx.lineTo(-2, -105);
      ctx.lineTo(26, -132);
      ctx.lineTo(56, -96);
      ctx.lineTo(105, -118);
      ctx.lineTo(118, -80);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#543830';
      ctx.fillRect(-90, -74, 180, 110);
      ctx.fillStyle = '#7b4b3e';
      ctx.fillRect(-66, -96, 132, 22);
      ctx.fillStyle = '#c47f59';
      ctx.fillRect(-22, -52, 44, 52);
      ctx.strokeStyle = '#e4a06f';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-62, -65);
      ctx.lineTo(-32, -28);
      ctx.lineTo(0, -65);
      ctx.lineTo(34, -26);
      ctx.lineTo(64, -64);
      ctx.stroke();
    }
    ctx.restore();
    if (zoneId === 'mistwood' && patterns.water && visible(1940,620,200)) {
      const wx = {
          x: 1780,
          y: 620 * .82
        },
        ww = {
          x: 2100,
          y: 620 * .82
        };
      ctx.save();
      ctx.globalAlpha = art?.terrainReady ? .8 : .28;
      ctx.fillStyle = patterns.water;
      ctx.beginPath();ctx.ellipse((wx.x+ww.x)/2,wx.y,160,44,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(157,205,185,.3)';ctx.lineWidth=3;ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawLoot() {
    for (const l of lootDrops) {
      if (!visible(l.x, l.y, 35)) continue;
      const asset={guardianToken:'armor',emberShard:'ore'}[l.id]||l.id;
      if(art?.has(asset)){const p=screenPos(l.x,l.y);art.draw(ctx,asset,p.x,p.y+3+Math.sin(time*4+l.x)*2,25);continue;}
      const s = screenPos(l.x, l.y);
      ctx.save();
      ctx.translate(s.x, s.y + Math.sin(time * 4 + l.x) * 3);
      ctx.shadowColor = l.id === 'coin' ? 'rgba(230,194,92,.85)' : 'rgba(190,220,216,.65)';
      ctx.shadowBlur = profile.detail >= 2 ? 10 : 0;
      ctx.fillStyle = l.id === 'coin' ? '#e6c25e' : l.id === 'guardianToken' ? '#b79be8' : '#bdd2cc';
      ctx.beginPath();
      ctx.arc(0, -12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.arc(-2, -14, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  function drawWorldLandmarkOverlay() {
    const z = zones[zoneId];
    const list = zoneId === 'mistwood' ? [[940, 440, 'FOREST'], [1540, 1030, 'RUIN'], [2150, 540, 'SHRINE']] : zoneId === 'stonevale' ? [[820, 480, 'VILLAGE'], [1500, 840, 'MINE'], [2180, 520, 'RUIN']] : [[940, 500, 'OUTPOST'], [1760, 1240, 'BOSS'], [1260, 930, 'SHRINE']];
    for (const [x, y, k] of list) {
      const s = screenPos(x, y);
      if (s.x < -140 || s.x > W + 140 || s.y < -140 || s.y > H + 140) continue;
      if(art?.has('house')){groundShadow(s.x,s.y+15,45);art.draw(ctx,k==='SHRINE'||k==='BOSS'?'shrine':k==='RUIN'||k==='MINE'?'ruins':'house',s.x,s.y+20,140);continue;}
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath();
      ctx.ellipse(0, 22, 62, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      if (k === 'FOREST' || k === 'VILLAGE') {
        ctx.fillStyle = '#755640';
        ctx.fillRect(-42, -52, 84, 60);
        ctx.fillStyle = '#a27a51';
        ctx.beginPath();
        ctx.moveTo(-52, -52);
        ctx.lineTo(0, -84);
        ctx.lineTo(52, -52);
        ctx.closePath();
        ctx.fill();
      } else if (k === 'MINE') {
        ctx.strokeStyle = '#7d654f';
        ctx.lineWidth = 10;
        ctx.strokeRect(-48, -50, 96, 55);
        ctx.strokeStyle = '#b48a60';
        ctx.lineWidth = 3;
        ctx.strokeRect(-35, -38, 70, 42);
      } else if (k === 'SHRINE') {
        ctx.fillStyle = '#77766d';
        ctx.fillRect(-8, -62, 16, 62);
        ctx.fillStyle = z.accent;
        ctx.beginPath();
        ctx.arc(0, -62, 17, 0, Math.PI * 2);
        ctx.fill();
      } else if (k === 'OUTPOST') {
        ctx.fillStyle = '#684737';
        ctx.fillRect(-48, -58, 96, 64);
        ctx.fillStyle = '#996549';
        ctx.fillRect(-60, -72, 14, 25);
        ctx.fillRect(46, -72, 14, 25);
      } else if (k === 'BOSS') {
        ctx.strokeStyle = 'rgba(210,84,67,.6)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, -6, 52, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#6b6963';
        for (let i = -2; i < 3; i++) ctx.fillRect(i * 22 - 8, -56 + i % 2 * 8, 16, 70 - i % 2 * 8);
      }
      ctx.restore();
    }
  }
  function drawFloatingTexts() {
    for (const f of floatingTexts) {
      const s = screenPos(f.x, f.y);
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.font = '700 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }
  }
  function drawNpcLabels() {
    const z = zones[zoneId],
      s = screenPos(z.scout.x, z.scout.y);
    if (s.x > -120 && s.x < W + 120 && s.y > -120 && s.y < H + 120) {
      ctx.save();
      ctx.font = '700 11px system-ui';
      ctx.textAlign = 'center';
      const active = dist(player, z.scout) < 130;
      ctx.fillStyle = 'rgba(8,14,12,.76)';
      const label = active ? '✦  ' + (zoneId === 'ashfield' ? 'Смотритель' : 'Разведчик') : zoneId === 'ashfield' ? 'Смотритель' : 'Разведчик';
      const w = ctx.measureText(label).width + 18;
      const labelY = s.y - (art?.has('scout') ? 106 : 58);
      ctx.fillRect(s.x - w / 2, labelY, w, 20);
      ctx.fillStyle = active ? '#f0d58e' : '#d3ddd8';
      ctx.fillText(label, s.x, labelY + 15);
      ctx.restore();
    }
  }
  function drawAtmosphere() {
    const z = zones[zoneId];
    ctx.save();
    const grad = atmosphereGradient || ctx.createLinearGradient(0, 0, 0, H);
    if (!atmosphereGradient) {
      grad.addColorStop(0, 'rgba(223,224,205,.06)');
      grad.addColorStop(.38, 'rgba(20,28,23,0)');
      grad.addColorStop(1, 'rgba(7,11,9,.16)');
      atmosphereGradient = grad;
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = .12;
    ctx.strokeStyle = z.accent;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-60, H * .80);
    ctx.quadraticCurveTo(W * .36, H * .58, W + 60, H * .46);
    ctx.stroke();
    ctx.globalAlpha = .08;
    ctx.lineWidth = 42;
    ctx.strokeStyle = '#0b100d';
    ctx.beginPath();
    ctx.moveTo(-100, H * .88);
    ctx.quadraticCurveTo(W * .40, H * .68, W + 100, H * .55);
    ctx.stroke();
    ctx.globalAlpha = .18;
    for (let i = 0; i < 18; i++) {
      const x = (i * 173 + Math.floor(player.x * .15)) % (W + 120) - 60;
      const y = (i * 97 + Math.floor(player.y * .06)) % (H + 90) - 40;
      ctx.fillStyle = i % 3 === 0 ? '#d7c991' : '#93a383';
      ctx.beginPath();
      ctx.ellipse(x, y, 1.5, 8 + i % 4 * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawCombatTelegraphs() {
    for (const e of entities) {
      if (e.kind !== 'enemy' || e.hp <= 0 || e.cd > 0.35 || dist(player, e) > e.r + player.r + 28) continue;
      const s = screenPos(e.x, e.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(232,111,96,.62)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawWorld() {
    const z = zones[zoneId];
    drawGround(z);
    drawAtmosphere();
    drawLandmarks(z);
    drawWorldLandmarkOverlay();
    drawQueue.length = 0;
    for (const item of staticDrawables) {
      item.y = item.kind === 'player' ? player.y : z[item.kind].y;
      drawQueue.push(item);
    }
    for (const e of entities) if ((e.hp > 0 || e._corpseUntil > time) && visible(e.x, e.y, 100)) drawQueue.push(e);
    for (const a of ambient) if (visible(a.x, a.y, 250)) drawQueue.push(a);
    drawQueue.sort(sortDepth);
    for (const e of drawQueue) {
      if (e.kind === 'enemy') drawEntity(e);else if (e.kind === 'resource') drawResource(e);else if (e.kind === 'player') drawPlayer();else if (typeof e.scale === 'number') drawAmbientItem(e);else if (e.kind === 'camp') drawCamp(z);else if (e.kind === 'scout') drawScout(z);else drawPortal(z);
    }
    drawCombatTelegraphs();
    drawCombatFeedback();
    drawLoot();
    drawProjectiles();
    drawParticles();
    drawFloatingTexts();
    drawNpcLabels();
  }
  function drawMap() {
    const z = zones[zoneId];
    mctx.clearRect(0, 0, 240, 240);
    mctx.fillStyle = z.ground;
    mctx.fillRect(0, 0, 240, 240);
    mctx.strokeStyle = 'rgba(255,255,255,.06)';
    for (let i = 0; i < 8; i++) {
      mctx.beginPath();
      mctx.moveTo(i * 30, 0);
      mctx.lineTo(i * 30, 240);
      mctx.stroke();
      mctx.beginPath();
      mctx.moveTo(0, i * 30);
      mctx.lineTo(240, i * 30);
      mctx.stroke();
    }
    for (const e of entities) {
      if (e.hp <= 0 || e.kind === 'resource') continue;
      mctx.fillStyle = e.type === 'guardian' ? '#d29ae7' : '#ca6a6e';
      mctx.fillRect(e.x / WORLD.w * 240, e.y / WORLD.h * 240, 2.5, 2.5);
    }
    mctx.fillStyle = '#e6c874';
    mctx.beginPath();
    mctx.arc(z.scout.x / WORLD.w * 240, z.scout.y / WORLD.h * 240, 3, 0, Math.PI * 2);
    mctx.fill();
    mctx.fillStyle = '#79c0d0';
    mctx.beginPath();
    mctx.arc(z.portal.x / WORLD.w * 240, z.portal.y / WORLD.h * 240, 3.5, 0, Math.PI * 2);
    mctx.fill();
    mctx.fillStyle = '#eef5ef';
    mctx.beginPath();
    mctx.arc(player.x / WORLD.w * 240, player.y / WORLD.h * 240, 4, 0, Math.PI * 2);
    mctx.fill();
    mctx.fillStyle = 'rgba(255,225,150,.55)';
    for (const lm of z.landmarks || []) {
      mctx.beginPath();
      mctx.arc(lm.x / WORLD.w * 240, lm.y / WORLD.h * 240, 2, 0, Math.PI * 2);
      mctx.fill();
    }
  }
  function updatePerformanceMonitor(nowTime, renderMs, frameTimeMs) {
    perfFrameCount++;
    perfRenderTotal += renderMs;
    perfFrameGapTotal += frameTimeMs;
    if (!perfWindowStart) perfWindowStart = nowTime;
    const elapsed = nowTime - perfWindowStart;
    if (elapsed < 500) return;
    if (elapsed >= 500) {
      perfActualFps = perfFrameCount * 1000 / elapsed;
      perfAvgFrameMs = perfFrameCount ? perfFrameGapTotal / perfFrameCount : 0;
      perfAvgRenderMs = perfFrameCount ? perfRenderTotal / perfFrameCount : 0;
      perfFrameCount = 0;
      perfRenderTotal = 0;
      perfFrameGapTotal = 0;
      perfWindowStart = nowTime;
    }
    if (ui.perf && perfMonitorEnabled) {
      ui.perf.classList.remove('hidden');
      setText(ui.perfFps, perfActualFps > 0 ? `${Math.round(perfActualFps)} FPS` : 'Measuring…');
      setText(ui.perfTarget, ` target ${settings.fps}`);
      setText(ui.perfFrame, perfAvgFrameMs > 0 ? `${perfAvgFrameMs.toFixed(1)} ms frame` : 'Measuring…');
      setText(ui.perfRender, perfAvgRenderMs > 0 ? ` · ${perfAvgRenderMs.toFixed(1)} ms render` : ' · Measuring…');
      setText(ui.perfScale, `DPR ${DPR.toFixed(2)} · ${settings.quality}`);
      setText(ui.perfDevice, ` · ${device.ios ? 'iOS' : device.android ? 'Android' : 'Mobile'} · v${BUILD_VERSION}`);
    } else if (ui.perf) {
      ui.perf.classList.add('hidden');
    }
    if (ui.perfPill) {
      ui.perfPill.classList.toggle('hidden', !perfMonitorEnabled);
      if (perfMonitorEnabled) {
        setText(ui.perfPillFps, perfActualFps > 0 ? String(Math.round(perfActualFps)) : '…');
        setText(ui.perfPillMs, perfAvgFrameMs > 0 ? perfAvgFrameMs.toFixed(1) : '…');
      }
    }
  }
  function refreshPerformanceMonitorVisibility() {
    if (!ui.perf) return;
    ui.perf.classList.toggle('hidden', !perfMonitorEnabled);
    if (!perfMonitorEnabled) return;
    ui.perfFps.textContent = `${perfActualFps.toFixed(0)} FPS`;
    ui.perfTarget.textContent = ` target ${settings.fps}`;
    ui.perfFrame.textContent = `${perfAvgFrameMs.toFixed(1)} ms frame`;
    ui.perfRender.textContent = ` · ${perfAvgRenderMs.toFixed(1)} ms render`;
    ui.perfScale.textContent = `DPR ${DPR.toFixed(2)} · ${settings.quality}`;
    ui.perfDevice.textContent = ` · ${device.ios ? 'iOS' : device.android ? 'Android' : 'Mobile'} · v${BUILD_VERSION}`;
    if (ui.perfPill) {
      ui.perfPill.classList.toggle('hidden', !perfMonitorEnabled);
      setText(ui.perfPillFps, perfActualFps.toFixed(0));
      setText(ui.perfPillMs, perfAvgFrameMs.toFixed(1));
    }
  }
  function renderFrame(nowTime) {
    rafId = 0;
    if (suspended) return;
    if (!globalThis.__AETHER_TEST__) rafId = requestAnimationFrame(renderFrame);
    const elapsed = Math.max(0, nowTime - lastFrame);
    lastFrame = nowTime;
    if (!isPaused()) {
      accumulator += Math.min(elapsed / 1000, .25);
      while (accumulator + 1e-9 >= FIXED_STEP) {
        update(FIXED_STEP);
        accumulator -= FIXED_STEP;
      }
    } else accumulator = 0;
    const interval = 1000 / (isPaused() ? 10 : settings.fps);
    if (nowTime + .2 < nextRenderAt) return;
    nextRenderAt += Math.max(1, Math.floor((nowTime + .2 - nextRenderAt) / interval) + 1) * interval;
    const gap = perfLastGameFrame ? nowTime - perfLastGameFrame : interval;
    perfLastGameFrame = nowTime;
    const start = performance.now();
    drawWorld();
    if (nowTime >= nextMapAt) {
      drawMap();
      nextMapAt = nowTime + 100;
    }
    if (nowTime >= nextUIAt) {
      updateUI();
      nextUIAt = nowTime + 50;
    }
    updatePerformanceMonitor(nowTime, performance.now() - start, gap);
    if (nowTime >= nextSaveAt && !isPaused()) {
      save();
      nextSaveAt = nowTime + 15000;
    }
  }
  function hideLoading() {
    if (ui.loading && !ui.loading.classList.contains('hidden')) ui.loading.classList.add('hidden');
  }
  let started = false;
  function firstPaint() {
    if (started) return;
    started = true;
    updateNetworkStatus();
    applyGraphics();
    const x = player.x,
      y = player.y;
    resetZone();
    if (restoredPosition) {
      player.x = x;
      player.y = y;
    }
    updateUI();
    drawWorld();
    drawMap();
    resetFrameLimiter();
    if (!rafId) if (!globalThis.__AETHER_TEST__) rafId = requestAnimationFrame(renderFrame);
  }
  async function boot() {
    ui.loadFill.style.width = '5%';
    // Never block the playable build on texture/network decoding. This is especially
    // important for iOS standalone web apps where an image request may remain pending.
    const hardFailSafe = setTimeout(hideLoading, 1600);
    try {
      firstPaint();
      ui.loadFill.style.width = '15%';
      setTimeout(hideLoading, 220);
      await Promise.all([loadTextures(),art?.load(()=>applyGraphics())]);
      applyGraphics();
      drawWorld();
      drawMap();
      ui.loadFill.style.width = '100%';
    } catch (err) {
      console.error('Aethernfall boot recovery', err);
      try {
        firstPaint();
      } catch (_) {}
    } finally {
      clearTimeout(hardFailSafe);
      hideLoading();
    }
  }
  refreshPerformanceMonitorVisibility();
  if (globalThis.__AETHER_TEST__) {
    globalThis.__AETHER_TEST_API__ = {
      state: () => ({
        zoneId,
        player,
        settings,
        quest: questState(),
        objective: currentObjective(),
        entities,
        lootDrops,
        particles,
        projectiles,
        time,
        DPR,
        perf: {
          fps: perfActualFps,
          frameMs: perfAvgFrameMs,
          renderMs: perfAvgRenderMs
        }
      }),
      recoveryCopies: () => [...testStorage.entries()].filter(([key]) => key.startsWith(SAVE + '_recovery_')),
      storage,
      firstPaint,
      resetInput,
      hitTarget,
      addEnemy,
      resetZone,
      interact,
      skill,
      attack,
      dodge,
      craft,
      save,
      load,
      joy,
      closeModal,
      openInventory,
      openMenu,
      openShop,
      buyItem,
      applyPreset,
      suspend,
      resume,
      resetFrameLimiter,
      drawWorld,
      drawMap,
      updateUI,
      transitionZone,
      advanceQuest,
      renderFrame,
      applyGraphics,
      update,
      nearbyInteraction,
      zones,
      player,
      setFps: f => {
        settings.fps = FPS.includes(Number(f)) ? Number(f) : 60;
        resetFrameLimiter();
      },
      setQuality: q => {
        settings.quality = q;
        applyGraphics();
      },
      getPerf: () => ({
        fps: perfActualFps,
        frameMs: perfAvgFrameMs,
        renderMs: perfAvgRenderMs
      })
    };
  } else boot();
  if (!globalThis.__AETHER_TEST__) registerPWA();
})();
