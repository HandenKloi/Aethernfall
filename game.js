"use strict";

(() => {
  'use strict';

  const BUILD_VERSION = '4.0.10';
  const SAVE_SCHEMA = 4;
  const BASE_STATS = Object.freeze({ startLevel: 6, damage: 32, maxHp: 240, maxStamina: 100, speed: 205, damagePerLevel: 3, hpPerLevel: 18 });
  const MAX_UPGRADE_RANK = 5;
  const SUPPLY_COOLDOWN = 1.2;
  const COMBAT_RULES = Object.freeze({
    attackCooldown: .42,
    attackBufferWindow: .13,
    comboWindow: .9,
    maxCombo: 3,
    critChance: .12,
    critMultiplier: 1.5,
    comboDamageStep: .10,
    dodgeStaminaCost: 24,
    dodgeCooldown: .78,
    dodgeWindow: .28,
    dashDuration: .28,
    dashDistance: 125,
    blockStaminaDrain: 12,
    staminaRegen: 24,
    bucklerIncomingMultiplier: .18,
    blockIncomingMultiplier: .26,
    skillStaminaCost: 20,
    windSlashRange: 165,
    windSlashHalfArc: 1.3,
    windSlashDamageMultiplier: 1.85,
    triplePulseCount: 3,
    triplePulseSpread: .15,
    triplePulseSpeed: 480,
    triplePulseLifetime: .82,
    triplePulseDamageMultiplier: .9,
    secondWindHeal: 70,
    secondWindCooldown: 8
  });
  const combatEngine = window.AetherCombat.createEngine(COMBAT_RULES);
  const art = window.AetherArt;
  const audio = window.AetherAudio || { unlock: async () => false, configure() {}, setZone() {}, sfx() {}, suspend() {}, resume() {}, snapshot: () => ({ available: false }) };
  const GEAR = {
    emptyHand: {
      slot: 'offhand',
      name: 'Без щита',
      icon: 'sword'
    },
    buckler: {
      slot: 'offhand',
      name: 'Щит дозорного',
      icon: 'shield',
      build: { blockIncomingMultiplier: .18 }
    },
    starterBlade: {
      slot: 'weapon',
      name: 'Меч следопыта',
      damage: 0,
      icon: 'sword'
    },
    dawnBlade: {
      slot: 'weapon',
      name: 'Клинок рассвета',
      damage: 15,
      icon: 'sword'
    },
    starterArmor: {
      slot: 'armor',
      name: 'Панцирь следопыта',
      health: 0,
      icon: 'armor'
    },
    wardenArmor: {
      slot: 'armor',
      name: 'Доспех хранителя',
      health: 40,
      icon: 'armor'
    },
    guardianArmor: {
      slot: 'armor',
      name: 'Пластинчатая броня стража',
      health: 25,
      build: { blockDrainMultiplier: .70 },
      icon: 'armor'
    }
  };
  const SUPPLIES = {
    potion: {
      name: 'Зелье лечения',
      hp: 100,
      stamina: 0,
      note: 'До 100 здоровья. Не повышает максимум.'
    },
    tonic: {
      name: 'Тоник выносливости',
      hp: 0,
      stamina: 60,
      note: 'До 60 выносливости. Не повышает максимум.'
    },
    fieldKit: {
      name: 'Походный эликсир',
      hp: 70,
      stamina: 35,
      note: 'Восстанавливает до 70 здоровья и 35 выносливости.'
    }
  };
  const motions = new WeakMap();
  function animate(actor, action, duration = .45) {
    motions.set(actor, {
      action,
      start: time,
      duration,
      x: actor.x,
      y: actor.y,
      dir: actor.dir
    });
  }
  const itemArt = id => art ? art.icon({
    healing: 'potion',
    buckler: 'shield',
    tonic: 'potion',
    fieldKit: 'potion',
    dawnBlade: 'sword',
    wardenArmor: 'armor',
    guardianToken: 'armor',
    emberShard: 'ore'
  }[id] || id) : '';
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
  // Auxiliary low-resolution lighting target. It stays local/offline and is
  // deliberately cheaper than rendering a second full-resolution scene.
  const lightCanvas = document.createElement('canvas'),
    lightCtx = lightCanvas.getContext('2d', {
      alpha: true
    });

  // Small pre-rendered radial masks remove repeated createRadialGradient() work
  // from the Ultra render loop. They are resolution-independent because drawImage
  // scales them to the requested world-space radius.
  function makeRadialMask(stops, size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const cctx = c.getContext('2d', { alpha: true });
    if (!cctx) return null;
    const r = size / 2,
      g = cctx.createRadialGradient(r, r, 0, r, r, r);
    for (const [offset, color] of stops) g.addColorStop(offset, color);
    cctx.fillStyle = g;
    cctx.fillRect(0, 0, size, size);
    return c;
  }
  const FX_CACHE = {
    light: makeRadialMask([
      [0, 'rgba(0,0,0,1)'],
      [.48, 'rgba(0,0,0,.62)'],
      [1, 'rgba(0,0,0,0)']
    ]),
    glowPortal: makeRadialMask([
      [0, 'rgba(126,241,225,1)'],
      [.35, 'rgba(126,241,225,.45)'],
      [1, 'rgba(126,241,225,0)']
    ]),
    glowPortalAsh: makeRadialMask([
      [0, 'rgba(255,142,92,1)'],
      [.35, 'rgba(255,142,92,.45)'],
      [1, 'rgba(255,142,92,0)']
    ]),
    glowCamp: makeRadialMask([
      [0, 'rgba(255,178,82,1)'],
      [.35, 'rgba(255,178,82,.45)'],
      [1, 'rgba(255,178,82,0)']
    ]),
    glowProjectile: makeRadialMask([
      [0, 'rgba(156,220,255,1)'],
      [.35, 'rgba(156,220,255,.45)'],
      [1, 'rgba(156,220,255,0)']
    ])
  };
  const ui = {
    hp: $('hpFill'),
    bossHud: $('bossHud'),
    bossName: $('bossName'),
    bossPhase: $('bossPhase'),
    bossHpText: $('bossHpText'),
    bossHpFill: $('bossHpFill'),
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
    supplyLabel: $('supplyLabel'),
    supplyBtn: $('supplyBtn'),
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
    netPill: $('netPill'),
    savePill: $('savePill'),
    skill1Btn: $('skill1Btn'),
    skill2Btn: $('skill2Btn'),
    skill3Btn: $('skill3Btn'),
    skill1Meta: $('skill1Meta'),
    skill2Meta: $('skill2Meta'),
    skill3Meta: $('skill3Meta'),
    blockBtn: $('blockBtn'),
    dodgeBtn: $('dodgeBtn'),
    dodgeMeta: $('dodgeMeta'),
    attackBtn: $('attackBtn')
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
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const IMPACT_FEEDBACK = Object.freeze({
    evade: Object.freeze({ priority: 1, camera: 0, duration: 0, flash: 0, haptic: 4, sfx: 'dodge' }),
    block: Object.freeze({ priority: 2, camera: 1.5, duration: .07, flash: 0, haptic: 7, sfx: 'block' }),
    enemyHit: Object.freeze({ priority: 3, camera: 2, duration: .08, flash: 0, haptic: 5, sfx: 'hit' }),
    playerHit: Object.freeze({ priority: 4, camera: 3.5, duration: .11, flash: .38, haptic: 12, sfx: 'hit' }),
    enemyKill: Object.freeze({ priority: 5, camera: 3, duration: .10, flash: 0, haptic: 10, sfx: 'kill' }),
    guardianKill: Object.freeze({ priority: 6, camera: 5, duration: .14, flash: 0, haptic: 24, sfx: 'kill' })
  });
  const DAMAGE_FLASH_DECAY = .38 / .16;
  const QUALITY = {
    low: {
      particles: 12,
      textureScale: .44,
      shadow: .06,
      fog: .07,
      detail: 0,
      dprCap: 2,
      pixelBudget: 1500000,
      lighting: 0,
      bloom: 0,
      softShadows: false
    },
    medium: {
      particles: 20,
      textureScale: .60,
      shadow: .16,
      fog: .12,
      detail: 1,
      dprCap: 2,
      pixelBudget: 1500000,
      lighting: 0,
      bloom: 0,
      softShadows: false
    },
    high: {
      particles: 30,
      textureScale: .76,
      shadow: .26,
      fog: .17,
      detail: 2,
      dprCap: 2,
      pixelBudget: 1500000,
      lighting: 0,
      bloom: 0,
      softShadows: false
    },
    'very-high': {
      particles: 42,
      textureScale: .88,
      shadow: .36,
      fog: .21,
      detail: 3,
      dprCap: 2,
      pixelBudget: 1500000,
      lighting: 0,
      bloom: 0,
      softShadows: false
    },
    ultra: {
      particles: 52,
      textureScale: 1,
      shadow: .46,
      fog: .23,
      detail: 4,
      dprCap: 2.5,
      pixelBudget: 2400000,
      lighting: .12,
      lightmapScale: .5,
      bloom: .28,
      softShadows: true
    }
  };
  const FPS = [30, 40, 45, 60];
  const detected = device.ios ? 'medium' : device.ram >= 8 && device.cores >= 8 ? 'high' : device.ram >= 6 && device.cores >= 6 ? 'high' : device.ram >= 4 && device.cores >= 4 ? 'medium' : 'low';
  const testStorage = new Map(Object.entries(globalThis.__AETHER_TEST_INITIAL_STORAGE__ || {}).map(([key, value]) => [key, String(value)]));
  const storage = {
    getItem(key) {
      try {
        if (globalThis.__AETHER_TEST_STORAGE_HOOKS__?.failGet) throw Error('test storage read failure');
        return globalThis.__AETHER_TEST__ ? testStorage.get(key) ?? null : localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        const fail = globalThis.__AETHER_TEST_STORAGE_HOOKS__?.failSet;
        if (fail === true || typeof fail === 'function' && fail(key, value)) throw Error('test storage write failure');
        if (globalThis.__AETHER_TEST__) testStorage.set(key, String(value));else localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    removeItem(key) {
      try {
        if (globalThis.__AETHER_TEST_STORAGE_HOOKS__?.failRemove) throw Error('test storage remove failure');
        if (globalThis.__AETHER_TEST__) testStorage.delete(key);else localStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
    keys() {
      try {
        if (globalThis.__AETHER_TEST__) return [...testStorage.keys()];
        return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(Boolean);
      } catch {
        return [];
      }
    }
  };
  function finiteSetting(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  }
  let settings = {
    quality: storage.getItem('aef_quality') || detected,
    fps: Number(storage.getItem('aef_fps') || 60),
    controls: storage.getItem('aef_controls') === 'left' ? 'left' : 'right',
    controlSize: ['compact', 'normal', 'large'].includes(storage.getItem('aef_control_size')) ? storage.getItem('aef_control_size') : 'normal',
    questCollapsed: storage.getItem('aef_quest_collapsed') !== '0',
    brightness: [85, 100, 115].includes(Number(storage.getItem('aef_brightness'))) ? Number(storage.getItem('aef_brightness')) : 100,
    uiScale: ['normal', 'large'].includes(storage.getItem('aef_ui_scale')) ? storage.getItem('aef_ui_scale') : 'normal',
    minimapSize: storage.getItem('aef_minimap_size') === 'large' ? 'large' : 'normal',
    combatNumbers: storage.getItem('aef_combat_numbers') !== '0',
    haptics: storage.getItem('aef_haptics') !== '0',
    masterVolume: finiteSetting(storage.getItem('aef_master_volume'), .8),
    musicVolume: finiteSetting(storage.getItem('aef_music_volume'), .55),
    ambientVolume: finiteSetting(storage.getItem('aef_ambient_volume'), .65),
    sfxVolume: finiteSetting(storage.getItem('aef_sfx_volume'), .8),
    musicEnabled: storage.getItem('aef_music_enabled') !== '0'
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
  const physics = window.AetherPhysics?.create(WORLD.w, WORLD.h);
  let structures = [];
  const LANDMARKS = {
    mistwood: [[940,440,'FOREST','Шепчущая чаща'],[1540,1030,'RUIN','Затонувшие руины'],[2150,540,'SHRINE','Святилище росы'],[2440,1320,'SHRINE','Камень туманного дозора']],
    stonevale:[[820,480,'VILLAGE','Старый дозор'],[1500,840,'MINE','Серебряный рудник'],[2180,520,'RUIN','Расколотая арка'],[2360,1320,'RUIN','Раскол дозорных']],
    ashfield:[[940,500,'OUTPOST','Пепельный пост'],[1760,1240,'BOSS','Обугленная арена'],[1260,930,'SHRINE','Святилище искры'],[700,1360,'OUTPOST','Пепельный маяк']]
  };
  const SAVE = 'aethernfall_save_v30';
  const SAVE_BACKUP = SAVE + '_backup';
  const RECOVERY_PREFIX = SAVE + '_recovery_';
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
      questId: 'mist',
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
      questId: 'stone',
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
      questId: 'ash',
      next: 'mistwood',
      resources: ['wood', 'ore']
    }
  };
  const MAIN_QUESTS = Object.freeze({
    mist: {
      title:'Следы в тумане',
      objectives:[
        {id:'mist-scout',type:'talk',target:'scout',text:'Поговорите с разведчиком'},
        {id:'mist-herb',type:'gather',target:'herb',match:'target',counter:'herb',required:3,text:'Соберите 3 травы',progressText:'Соберите траву'},
        {id:'mist-watchstone',type:'discover',target:'mistwood:3',match:'target',text:'Найдите Камень туманного дозора'},
        {id:'mist-raiders',type:'kill',target:'raider',match:'target',counter:'kills',required:4,text:'Победите 4 налётчиков',progressText:'Победите налётчиков'},
        {id:'mist-portal',type:'portal',text:'Перейдите в Каменную долину'},
      ],
    },
    stone: {
      title:'Пепел старого мира',
      objectives:[
        {id:'stone-scout',type:'talk',target:'scout',text:'Поговорите с разведчиком'},
        {id:'stone-ore',type:'gather',target:'ore',match:'target',counter:'ore',required:2,text:'Соберите 2 руды',progressText:'Соберите руду'},
        {id:'stone-watchrift',type:'discover',target:'stonevale:3',match:'target',text:'Исследуйте Раскол дозорных'},
        {id:'stone-guardian',type:'kill',target:'guardian',match:'target',counter:'guardian',required:1,text:'Победите стража руин'},
        {id:'stone-portal',type:'portal',text:'Перейдите в Пепельные поля'},
      ],
    },
    ash: {
      title:'Осколок пламени',
      objectives:[
        {id:'ash-scout',type:'talk',target:'scout',text:'Поговорите с хранителем'},
        {id:'ash-wood',type:'gather',target:'wood',match:'target',counter:'wood',required:4,text:'Соберите 4 древесины',progressText:'Соберите древесину'},
        {id:'ash-beacon',type:'discover',target:'ashfield:3',match:'target',text:'Доберитесь до Пепельного маяка'},
        {id:'ash-enemies',type:'kill',target:'enemy',match:'category',counter:'kills',required:6,spawnTarget:'raider',text:'Победите 6 врагов',progressText:'Победите врагов'},
        {id:'ash-portal',type:'portal',text:'Вернитесь в Туманный лес',effect:'questCycleCompleted'},
      ],
    },
  });
  const CONTRACTS = Object.freeze({
    mistwood: { title:'Травы для дозора', kind:'gather', target:'herb', match:'target', required:4, gold:45, supply:'potion', note:'Соберите 4 травы для походной аптечки дозора.' },
    stonevale: { title:'Серебро для укреплений', kind:'gather', target:'ore', match:'target', required:3, gold:70, supply:'tonic', note:'Добудьте 3 единицы руды у старых выработок.' },
    ashfield: { title:'Зачистка пепельной тропы', kind:'kill', target:'enemy', match:'category', required:5, gold:100, supply:'fieldKit', note:'Победите 5 противников в Пепельных полях.' },
  });
  function validateZoneQuestBindings(definitions, zoneDefinitions) {
    for (const [id, zone] of Object.entries(zoneDefinitions)) {
      if (!definitions[zone.questId]) throw new Error(`Zone quest missing: ${id}:${zone.questId}`);
    }
  }
  validateZoneQuestBindings(MAIN_QUESTS, zones);
  const COSMETICS = Object.freeze({
    accents: { teal: '#7ef1e1', gold: '#f0d58e', ember: '#ff8e5c' },
    trails: { steel: '#91c6cc', aether: '#b7a8ff', ember: '#ff9b63' }
  });
  const RUNES = Object.freeze({
    weapon: {
      none: { name: 'Без руны' },
      edge: { name: 'Руна кромки', damage: 5, note: '+5 к итоговому урону.' },
      aether: { name: 'Руна эфира', build: { skillDamageMultiplier: 1.10 }, note: '+10% урона навыков.' }
    },
    armor: {
      none: { name: 'Без руны' },
      vigor: { name: 'Руна стойкости', health: 18, note: '+18 к максимальному здоровью.' },
      guard: { name: 'Руна стража', build: { blockDrainMultiplier: .90 }, note: 'Расход выносливости блока −10%.' }
    }
  });
  const buildEngine = window.AetherBuilds.createEngine({
    baseStats: BASE_STATS,
    combatRules: COMBAT_RULES,
    gear: GEAR,
    runes: RUNES
  });
  let buildProfile = null;
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
    attackQueuedUntil: 0,
    secondWindCd: 0,
    supplyCd: 0,
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
    loadout: {
      weapon: 'starterBlade',
      armor: 'starterArmor',
      offhand: 'emptyHand',
      quick: 'potion'
    },
    supplies: {
      potion: 0,
      tonic: 0,
      fieldKit: 0
    },
    runes: { weapon: 'none', armor: 'none' },
    cosmetics: { accent: 'teal', trail: 'steel' },
    contracts: {
      mistwood: { state: 0, progress: 0, cycle: 0 },
      stonevale: { state: 0, progress: 0, cycle: 0 },
      ashfield: { state: 0, progress: 0, cycle: 0 }
    },
    discoveries: [],
    progression: {
      forgeRank: 0,
      vitalityRank: 0,
      legacyDamageBonus: 0,
      legacyHpBonus: 0,
      completedCycles: 0
    },
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
  function validateLiveQuestStateBindings(definitions, questStates, zoneDefinitions = zones, landmarkDefinitions = LANDMARKS) {
    const definitionIds = Object.keys(definitions).sort();
    const stateIds = Object.keys(questStates).sort();
    if (JSON.stringify(definitionIds) !== JSON.stringify(stateIds)) throw new Error('Quest definition/state registry mismatch');

    const zoneByQuest = {};
    for (const [zoneKey, zone] of Object.entries(zoneDefinitions)) {
      if (!definitions[zone.questId]) throw new Error(`Zone quest missing: ${zoneKey}:${zone.questId}`);
      if (zoneByQuest[zone.questId]) throw new Error(`Quest bound to multiple zones: ${zone.questId}`);
      zoneByQuest[zone.questId] = zoneKey;
    }

    for (const [questId, definition] of Object.entries(definitions)) {
      const state = questStates[questId];
      const zoneKey = zoneByQuest[questId];
      if (!zoneKey) throw new Error(`Quest zone missing: ${questId}`);
      for (const objective of definition.objectives) {
        if (objective.counter && !Object.hasOwn(state, objective.counter)) throw new Error(`Quest counter missing: ${questId}.${objective.counter}`);
        if (objective.type === 'discover' && objective.match === 'target') {
          const prefix = `${zoneKey}:`;
          const suffix = objective.target.startsWith(prefix) ? objective.target.slice(prefix.length) : '';
          const index = /^\d+$/.test(suffix) ? Number(suffix) : -1;
          if (!Array.isArray(landmarkDefinitions[zoneKey]?.[index])) throw new Error(`Quest discover target is not same-zone landmark: ${questId}.${objective.target}`);
        }
      }
    }
  }
  validateLiveQuestStateBindings(MAIN_QUESTS, player.quests);
  const questEngine = window.AetherQuests?.createEngine({ main: MAIN_QUESTS, contracts: CONTRACTS });
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
    nextDiscoveryAt = 0,
    atmosphereGradient = null;
  let blockPointer = null;
  let impactPendingKind = '', impactPendingPriority = 0, impactPendingDirX = 0, impactPendingDirY = 0;
  let cameraImpactX = 0, cameraImpactY = 0, cameraImpactBaseX = 0, cameraImpactBaseY = 0, cameraImpactLife = 0, cameraImpactDuration = 0, damageFlash = 0;
  let impactLastKind = '', impactLastSfx = '', impactLastHaptic = 0;
  const actionPointerResets = new Set();
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
  function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }
  function getActionPresentation(action, state, now, pressed = false, tuning = buildProfile?.combat) {
    const stamina = Number.isFinite(state?.stamina) ? state.stamina : 0,
      hp = Number.isFinite(state?.hp) ? state.hp : 0,
      maxHp = Number.isFinite(state?.maxHp) ? state.maxHp : 0,
      attackCd = Math.max(0, Number.isFinite(state?.attackCd) ? state.attackCd : 0),
      attackQueuedUntil = Number.isFinite(state?.attackQueuedUntil) ? state.attackQueuedUntil : 0,
      dodgeLeft = Math.max(0, (Number.isFinite(state?.dodgeCd) ? state.dodgeCd : 0) - now),
      secondWindLeft = Math.max(0, (Number.isFinite(state?.secondWindCd) ? state.secondWindCd : 0) - now),
      dodgeStaminaCost = tuning?.dodgeStaminaCost ?? COMBAT_RULES.dodgeStaminaCost,
      dodgeCooldown = tuning?.dodgeCooldown ?? COMBAT_RULES.dodgeCooldown,
      skillStaminaCost = tuning?.skillStaminaCost ?? COMBAT_RULES.skillStaminaCost,
      secondWindCooldown = tuning?.secondWindCooldown ?? COMBAT_RULES.secondWindCooldown;
    let availability = 'ready', progress = 0, disabled = false, title = '', ariaLabel = '';
    if (action === 'attack') {
      if (attackCd > 0) {
        availability = 'cooldown';
        progress = clamp01(attackCd / COMBAT_RULES.attackCooldown);
      }
      const buffered = attackQueuedUntil > 0 && attackQueuedUntil >= now;
      const interaction = pressed ? 'pressed' : buffered ? 'buffered' : 'idle';
      title = buffered ? 'Атака · следующий удар принят' : attackCd > 0 ? 'Атака · восстановление' : 'Атака · готово';
      ariaLabel = title;
      return { availability, interaction, progress, disabled: false, title, ariaLabel };
    }
    if (action === 'dodge') {
      if (dodgeLeft > 0) {
        availability = 'cooldown';
        progress = clamp01(dodgeLeft / dodgeCooldown);
        disabled = true;
        title = `Уклонение · восстановление ${dodgeLeft.toFixed(1)} с`;
      } else if (stamina < dodgeStaminaCost) {
        availability = 'resource';
        disabled = true;
        title = `Уклонение · недостаточно выносливости · нужно ${dodgeStaminaCost}`;
      } else title = `Уклонение · готово · ${dodgeStaminaCost} выносливости`;
      ariaLabel = title;
      return { availability, interaction: pressed ? 'pressed' : 'idle', progress, disabled, title, ariaLabel };
    }
    if (action === 'skill1' || action === 'skill2') {
      const name = action === 'skill1' ? 'Разрез ветра' : 'Тройной импульс';
      if (stamina < skillStaminaCost) {
        availability = 'resource';
        disabled = true;
        title = `${name} · недостаточно выносливости · нужно ${skillStaminaCost}`;
      } else title = `${name} · готово · ${skillStaminaCost} выносливости`;
      ariaLabel = title;
      return { availability, interaction: pressed ? 'pressed' : 'idle', progress: 0, disabled, title, ariaLabel };
    }
    if (action === 'skill3') {
      if (hp >= maxHp) {
        availability = 'context';
        disabled = true;
        title = 'Второе дыхание · здоровье полное';
      } else if (secondWindLeft > 0) {
        availability = 'cooldown';
        progress = clamp01(secondWindLeft / secondWindCooldown);
        disabled = true;
        title = `Второе дыхание · восстановление ${Math.ceil(secondWindLeft)} с`;
      } else if (stamina < skillStaminaCost) {
        availability = 'resource';
        disabled = true;
        title = `Второе дыхание · недостаточно выносливости · нужно ${skillStaminaCost}`;
      } else title = `Второе дыхание · готово · ${skillStaminaCost} выносливости`;
      ariaLabel = title;
      return { availability, interaction: pressed ? 'pressed' : 'idle', progress, disabled, title, ariaLabel };
    }
    return { availability: 'ready', interaction: pressed ? 'pressed' : 'idle', progress: 0, disabled: false, title: '', ariaLabel: '' };
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
    player.dashRemaining = 0;
    player.dodgeUntil = 0;
    player.attackQueuedUntil = 0;
    look.ids.clear();
    blockPointer = null;
    player.blocking = false;
    actionPointerResets.forEach(reset => reset());
    document.querySelectorAll('.pressed').forEach(el => el.classList.remove('pressed'));
  }
  let viewportResizeRaf = 0;
  function suspend() {
    resetInput();
    resetImpactFeedback();
    if (suspended) return;
    audio.suspend();
    suspended = true;
    cancelAnimationFrame(rafId);
    rafId = 0;
    if (viewportResizeRaf) {
      cancelAnimationFrame(viewportResizeRaf);
      viewportResizeRaf = 0;
    }
    save();
  }
  function resume() {
    if (document.hidden) return;
    suspended = false;
    audio.resume();
    applyGraphics();
    resetFrameLimiter();
    if (started && !rafId) if (!globalThis.__AETHER_TEST__) rafId = requestAnimationFrame(renderFrame);
  }
  function syncBrowserZoomState() {
    const zoomed = (window.visualViewport?.scale || 1) > 1.01;
    document.body.classList.toggle('browser-zoomed', zoomed);
    return zoomed;
  }
  function resizeViewport() {
    if (syncBrowserZoomState()) return;
    resetInput();
    const apply = () => {
      viewportResizeRaf = 0;
      applyGraphics();
      resetFrameLimiter();
    };
    // Window and VisualViewport often emit resize together. Coalesce them into
    // one graphics resize per animation frame without the visible lag of a long debounce.
    if (globalThis.__AETHER_TEST__) return apply();
    if (!viewportResizeRaf) viewportResizeRaf = requestAnimationFrame(apply);
  }
  addEventListener('resize', resizeViewport, {
    passive: true
  });
  window.visualViewport?.addEventListener('resize', resizeViewport, {
    passive: true
  });
  window.visualViewport?.addEventListener('scroll', syncBrowserZoomState, {
    passive: true
  });
  // Suppress browser smart/double-tap zoom while keeping pinch zoom available where CSS allows it.
  document.addEventListener('dblclick', event => event.preventDefault(), {
    passive: false
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
        // A newer-schema save is evidence that a newer client already wrote progress.
        // Do not let the old client overwrite it, but also do not deadlock the update
        // by requiring a save operation that is intentionally blocked.
        if (saveBlockedReason !== 'newer' && !save()) {
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
  const defaults = JSON.parse(JSON.stringify(player));
  const persistenceCodec = window.AetherPersistence?.createCodec({
    saveSchema: SAVE_SCHEMA,
    defaultZoneId: 'mistwood',
    zoneIds: Object.keys(zones),
    zones,
    world: WORLD,
    baseStats: BASE_STATS,
    maxUpgradeRank: MAX_UPGRADE_RANK,
    inventoryKeys: ['wood', 'ore', 'herb', 'guardianToken', 'emberShard'],
    shopOwnedIds: ['dawnBlade', 'wardenArmor', 'buckler'],
    gear: GEAR,
    supplies: SUPPLIES,
    runes: RUNES,
    cosmetics: COSMETICS,
    contracts: CONTRACTS,
    contractIds: Object.keys(CONTRACTS),
    questStepMax: Object.fromEntries(
      Object.entries(MAIN_QUESTS).map(([id, definition]) => [id, definition.objectives.length - 1])
    ),
    questStepMigration: {
      beforeVersion: '4.0.9',
      mappings: {
        mist: [0,1,3,4],
        stone:[0,1,3,4],
        ash:  [0,1,3,4],
      },
    },
    qualityIds: Object.keys(QUALITY),
    fpsValues: FPS,
    settingsOptions: {
      controlSizes: ['compact', 'normal', 'large'],
      brightness: [85, 100, 115],
      uiScales: ['normal', 'large'],
      minimapSizes: ['normal', 'large']
    },
    defaults: {
      player: defaults,
      settings: {
        quality: detected,
        fps: 60,
        controls: 'right',
        controlSize: 'normal',
        questCollapsed: true,
        brightness: 100,
        uiScale: 'normal',
        minimapSize: 'normal',
        combatNumbers: true,
        haptics: true,
        masterVolume: .8,
        musicVolume: .55,
        ambientVolume: .65,
        sfxVolume: .8,
        musicEnabled: true
      }
    }
  });
  const SESSION_ID = globalThis.crypto?.randomUUID?.() || `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let saveRevision = 0,
    saveDirty = false,
    saveBlockedReason = '',
    restoredPosition = false,
    pendingLoadNotice = '';
  function saveStatusText() {
    if (saveBlockedReason === 'newer') return 'Сохранение создано более новой версией игры';
    if (saveBlockedReason === 'conflict') return 'Открыта более новая игровая сессия · перезагрузите игру';
    if (saveDirty) return 'Прогресс пока не сохраняется · повторная попытка автоматически';
    return '';
  }
  function refreshSaveHealth() {
    if (!ui.savePill) return;
    const text = saveStatusText();
    ui.savePill.classList.toggle('hidden', !text);
    setText(ui.savePill, text);
    ui.savePill.title = saveBlockedReason === 'conflict' ? 'Нажмите, чтобы перезагрузить актуальное сохранение' : text;
  }
  function markSaveFailure(reason = '') {
    saveDirty = true;
    if (reason) saveBlockedReason = reason;
    refreshSaveHealth();
  }
  function clearSaveFailure() {
    saveDirty = false;
    if (saveBlockedReason !== 'newer' && saveBlockedReason !== 'conflict') saveBlockedReason = '';
    refreshSaveHealth();
  }
  let recoveryNonce = 0;
  function preserveRecovery(raw) {
    if (!raw) return true;
    const copies = storage.keys().filter(k => k.startsWith(RECOVERY_PREFIX)).sort();
    if (copies.some(key => storage.getItem(key) === raw)) return true;
    const key = RECOVERY_PREFIX + Date.now() + '_' + recoveryNonce++;
    if (!storage.setItem(key, raw)) return false;
    copies.push(key);
    copies.sort();
    while (copies.length > 3) storage.removeItem(copies.shift());
    return true;
  }
  function ownsGear(id) {
    return id === 'emptyHand' || id === 'starterBlade' || id === 'starterArmor' || player.shopOwned[id] === true || id === 'guardianArmor' && player.inv.guardianToken > 0;
  }
  function levelSteps() {
    return Math.max(0, Math.floor(player.level) - BASE_STATS.startLevel);
  }
  function recomputeDerivedStats() {
    const weapon = GEAR[player.loadout.weapon] || GEAR.starterBlade,
      armor = GEAR[player.loadout.armor] || GEAR.starterArmor,
      progression = player.progression;
    buildProfile = buildEngine.derive({
      level: player.level,
      progression,
      loadout: player.loadout,
      runes: player.runes
    });
    player.damage = buildProfile.damage;
    player.maxHp = buildProfile.maxHp;
    player.maxStamina = buildProfile.maxStamina;
    player.speed = buildProfile.speed;
    player.hp = Math.min(player.hp, player.maxHp);
    player.equipment.weapon = player.loadout.weapon === 'starterBlade' && progression.forgeRank > 0 ? 'Закалённый меч следопыта' : weapon.name;
    player.equipment.armor = armor.name;
  }
  const COMBAT_STATE_KEYS = ['attackCd', 'attackQueuedUntil', 'combo', 'comboTimer', 'stamina', 'dodgeCd', 'dodgeUntil', 'dashRemaining', 'secondWindCd', 'hp'];
  function combatStateSnapshot() {
    return Object.fromEntries(COMBAT_STATE_KEYS.map(key => [key, player[key]]));
  }
  function applyCombatState(state) {
    if (!state || typeof state !== 'object') return;
    for (const key of COMBAT_STATE_KEYS) if (Object.hasOwn(state, key) && Number.isFinite(state[key])) player[key] = state[key];
  }
  function applyCanonicalSave(snapshot) {
    zoneId = snapshot.zoneId;
    const saved = snapshot.player;
    player.level = saved.level;
    player.xp = saved.xp;
    player.xpNeed = saved.xpNeed;
    player.gold = saved.gold;
    player.x = saved.x;
    player.y = saved.y;
    player.dir = saved.dir;
    player.inv = { ...saved.inv };
    player.shopOwned = {};
    for (const [id, owned] of Object.entries(saved.shopOwned)) if (owned === true) player.shopOwned[id] = true;
    player.loadout = { ...saved.loadout };
    player.supplies = { ...saved.supplies };
    player.runes = { ...saved.runes };
    player.cosmetics = { ...saved.cosmetics };
    player.contracts = Object.fromEntries(Object.entries(saved.contracts).map(([id, contract]) => [id, { ...contract }]));
    player.discoveries = saved.discoveries.slice();
    player.progression = { ...saved.progression };
    player.quests = Object.fromEntries(Object.entries(saved.quests).map(([id, quest]) => [id, { ...quest }]));
    player.hp = saved.hp;
    player.stamina = saved.stamina;
    recomputeDerivedStats();
    player.hp = clamp(player.hp, 1, player.maxHp);
    player.stamina = clamp(player.stamina, 0, player.maxStamina);
    Object.assign(settings, snapshot.settings);
    player.attackCd = player.attackQueuedUntil = player.secondWindCd = player.supplyCd = player.dodgeCd = player.dodgeUntil = player.combo = player.comboTimer = 0;
    player.dashRemaining = 0;
    player.blocking = false;
    saveRevision = snapshot.meta.revision;
    restoredPosition = true;
  }
  function applyParsedSave(data, schema) {
    const snapshot = persistenceCodec.normalize(data, schema, { settings: { quality: settings.quality, fps: settings.fps } });
    applyCanonicalSave(snapshot);
  }
  function save() {
    if (saveBlockedReason === 'newer' || saveBlockedReason === 'conflict') {
      markSaveFailure(saveBlockedReason);
      return false;
    }
    const currentRaw = storage.getItem(SAVE);
    const current = persistenceCodec.parse(currentRaw);
    if (current.reason === 'newer') {
      markSaveFailure('newer');
      return false;
    }
    if (currentRaw && !current.ok && !preserveRecovery(currentRaw)) {
      markSaveFailure();
      return false;
    }
    const currentMeta = current.ok ? persistenceCodec.readMeta(current.data) : { revision: 0, sessionId: '' };
    const currentRevision = currentMeta.revision;
    const currentSession = currentMeta.sessionId;
    if (current.ok && currentRevision > saveRevision && currentSession && currentSession !== SESSION_ID) {
      markSaveFailure('conflict');
      return false;
    }
    const nextRevision = Math.max(saveRevision, currentRevision) + 1;
    const nextRaw = JSON.stringify(persistenceCodec.serialize({ zoneId, player, settings }, { revision: nextRevision, updatedAt: Date.now(), sessionId: SESSION_ID, buildVersion: BUILD_VERSION }));
    if (current.ok && currentRaw && currentRaw !== nextRaw && !storage.setItem(SAVE_BACKUP, currentRaw)) {
      markSaveFailure();
      return false;
    }
    if (!storage.setItem(SAVE, nextRaw)) {
      markSaveFailure();
      return false;
    }
    saveRevision = nextRevision;
    clearSaveFailure();
    return true;
  }
  function load() {
    resetImpactFeedback();
    saveBlockedReason = '';
    saveDirty = false;
    pendingLoadNotice = '';
    const primaryRaw = storage.getItem(SAVE);
    if (primaryRaw) {
      const primary = persistenceCodec.parse(primaryRaw);
      if (primary.reason === 'newer') {
        saveBlockedReason = 'newer';
        saveDirty = true;
        refreshSaveHealth();
        return false;
      }
      if (primary.ok) {
        applyParsedSave(primary.data, primary.schema);
        refreshSaveHealth();
        return true;
      }
      if (!preserveRecovery(primaryRaw)) markSaveFailure();
    }
    const backupRaw = storage.getItem(SAVE_BACKUP);
    const backup = persistenceCodec.parse(backupRaw);
    if (backup.reason === 'newer') {
      saveBlockedReason = 'newer';
      saveDirty = true;
      refreshSaveHealth();
      return false;
    }
    if (backup.ok) {
      applyParsedSave(backup.data, backup.schema);
      saveDirty = true;
      pendingLoadNotice = 'Восстановлена резервная копия прогресса';
      refreshSaveHealth();
      return true;
    }
    for (const key of LEGACY_SAVES) {
      const raw = storage.getItem(key);
      const legacy = persistenceCodec.parse(raw);
      if (!legacy.ok) continue;
      applyParsedSave(legacy.data, legacy.schema);
      saveDirty = true;
      pendingLoadNotice = 'Старое сохранение подготовлено к обновлению';
      refreshSaveHealth();
      return true;
    }
    refreshSaveHealth();
    return false;
  }
  recomputeDerivedStats();
  load();
  addEventListener('storage', event => {
    if (event.key !== SAVE || !event.newValue) return;
    const incoming = persistenceCodec.parse(event.newValue);
    if (!incoming.ok) return;
    const meta = persistenceCodec.readMeta(incoming.data);
    if (meta.revision > saveRevision && meta.sessionId && meta.sessionId !== SESSION_ID) markSaveFailure('conflict');
  });
  function switchGear(id) {
    const next = GEAR[id];
    if (!next) return false;
    player.loadout[next.slot] = id;
    recomputeDerivedStats();
    return true;
  }
  function equipmentTransaction(change) {
    const before = JSON.parse(JSON.stringify(player));
    change();
    if (!save()) {
      Object.assign(player, before);
      recomputeDerivedStats();
      toast('Изменение отменено: сохранение недоступно');
      return false;
    }
    updateUI();
    return true;
  }
  function equipItem(id) {
    if (ui.modal.classList.contains('hidden') || !Object.hasOwn(GEAR, id) || !ownsGear(id)) return false;
    if (isInCombat()) { toast('Недоступно во время боя'); return false; }
    if (!equipmentTransaction(() => switchGear(id))) return false;
    openEquipment();
    toast('Надето: ' + GEAR[id].name);
    return true;
  }
  function selectSupply(id) {
    if (ui.modal.classList.contains('hidden') || id !== '' && !Object.hasOwn(SUPPLIES, id)) return false;
    if (isInCombat()) { toast('Недоступно во время боя'); return false; }
    if (!equipmentTransaction(() => player.loadout.quick = id)) return false;
    openEquipment();
    return true;
  }
  function scaledSelfHeal(baseAmount, profile = buildProfile) {
    const amount = Number(baseAmount);
    const multiplier = Number(profile?.healingMultiplier);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) return 0;
    return Math.round(amount * multiplier);
  }
  function supplyUseReason(id) {
    const supply = SUPPLIES[id];
    if (!supply) return 'Расходник не выбран';
    if (!(player.supplies[id] > 0)) return 'Нет в сумке';
    if (player.supplyCd > time) return `Перезарядка: ${(player.supplyCd - time).toFixed(1)} с`;
    const hpNeeded = supply.hp > 0 && player.hp < player.maxHp;
    const staminaNeeded = supply.stamina > 0 && player.stamina < player.maxStamina;
    if (!hpNeeded && !staminaNeeded) return 'Восстановление не требуется';
    return '';
  }
  function useSupply(id = player.loadout.quick, menuContext = '') {
    const fromMenu = menuContext === 'inventory' || menuContext === 'equipment';
    if (isPaused() && !fromMenu) return false;
    if (fromMenu && isInCombat()) { toast('Недоступно во время боя'); return false; }
    const supply = SUPPLIES[id], reason = supplyUseReason(id);
    if (!supply || reason) {
      toast(reason || 'Расходник недоступен');
      return false;
    }
    if (!equipmentTransaction(() => {
      player.supplies[id]--;
      player.hp = Math.min(player.maxHp, player.hp + scaledSelfHeal(supply.hp));
      player.stamina = Math.min(player.maxStamina, player.stamina + supply.stamina);
    })) return false;
    cancelBlock();
    player.supplyCd = time + SUPPLY_COOLDOWN;
    animate(player, 'drink', .65);
    burst(player.x, player.y, player.cosmetics?.trail ? COSMETICS.trails[player.cosmetics.trail] : '#92dcc3', 12, 65);
    feedback('drink');
    toast(supply.name);
    if (menuContext === 'inventory') openInventory();
    else if (menuContext === 'equipment') openEquipment();
    return true;
  }
  function statSources() {
    const steps = levelSteps(),
      weapon = GEAR[player.loadout.weapon] || GEAR.starterBlade,
      armor = GEAR[player.loadout.armor] || GEAR.starterArmor;
    return {
      damage: { base: BASE_STATS.damage, level: steps * BASE_STATS.damagePerLevel, permanent: player.progression.forgeRank * 5 + player.progression.legacyDamageBonus, gear: weapon.damage || 0, rune: RUNES.weapon[player.runes.weapon]?.damage || 0, total: player.damage },
      hp: { base: BASE_STATS.maxHp, level: steps * BASE_STATS.hpPerLevel, permanent: player.progression.vitalityRank * 12 + player.progression.legacyHpBonus, gear: armor.health || 0, rune: RUNES.armor[player.runes.armor]?.health || 0, total: player.maxHp }
    };
  }
  function signed(n) {
    return n > 0 ? `+${n}` : String(n);
  }
  function openEquipment() {
    const inCombat = isInCombat();
    const currentWeapon = GEAR[player.loadout.weapon] || GEAR.starterBlade,
      currentArmor = GEAR[player.loadout.armor] || GEAR.starterArmor;
    const gearCards = Object.entries(GEAR).map(([id, item]) => {
      const owned = ownsGear(id), worn = player.loadout[item.slot] === id;
      let stats = '';
      if (item.slot === 'offhand') {
        stats = id === 'buckler' ? 'Блок: входящий урон ×0,18 вместо ×0,26 с оружием.' : 'Блок оружием: входящий урон ×0,26.';
      } else if (item.slot === 'weapon') {
        const delta = (item.damage || 0) - (currentWeapon.damage || 0);
        stats = `Урон: ${player.damage + delta} <b>(${signed(delta)})</b><br>Комбо: до +20% · крит: 12%, ×1,5`;
      } else {
        const delta = (item.health || 0) - (currentArmor.health || 0);
        stats = `Макс. здоровье: ${player.maxHp + delta} <b>(${signed(delta)})</b>`;
        if (id === 'guardianArmor') stats += '<br>Особенность: расход выносливости блока −30%.';
        else if (id === 'wardenArmor') stats += '<br>Особенность: максимальный запас здоровья.';
      }
      const disabled = !owned || worn || inCombat;
      const label = worn ? 'Надето' : !owned ? 'Не получено' : inCombat ? 'Недоступно во время боя' : 'Надеть';
      return `<article class="card">${itemArt(item.icon)}<h3>${item.name}</h3><p>${stats}</p><button class="btn" id="equip-${id}" ${disabled ? 'disabled' : ''}>${label}</button></article>`;
    }).join('');
    const supplyCards = Object.entries(SUPPLIES).map(([id, item]) => {
      const useReason = inCombat ? 'Недоступно во время боя' : supplyUseReason(id);
      return `<article class="card">${itemArt('potion')}<h3>${item.name} · ${player.supplies[id]} шт.</h3><p>${item.note}<br>Расход: 1 шт. за применение.</p><div class="cardActions"><button class="btn" id="supply-${id}" ${player.loadout.quick === id || inCombat ? 'disabled' : ''}>${player.loadout.quick === id ? 'В быстром слоте' : inCombat ? 'Недоступно во время боя' : 'В быстрый слот'}</button><button class="btn secondary" id="use-supply-${id}" ${useReason ? 'disabled' : ''}>${useReason || 'Использовать сейчас'}</button></div></article>`;
    }).join('');
    openModal('Экипировка персонажа', `<p class="note">Смена снаряжения не изменяет постоянные усиления. Расходники можно применить прямо отсюда или назначить в быстрый слот.</p><div class="shopList">${gearCards}</div><div class="sectionTitle">БЫСТРЫЙ РАСХОДНИК</div><div class="shopList">${supplyCards}</div><button class="btn" id="supply-clear" ${inCombat ? 'disabled' : ''}>${inCombat ? 'Недоступно во время боя' : 'Освободить быстрый слот'}</button><button class="btn" id="customizationEntry" ${inCombat ? 'disabled' : ''}>Руны и внешний вид</button><button class="btn" id="equipmentBack">Вернуться в сумку</button>`);
    for (const id of Object.keys(GEAR)) bindTap($('equip-' + id), () => equipItem(id));
    for (const id of Object.keys(SUPPLIES)) {
      bindTap($('supply-' + id), () => selectSupply(id));
      bindTap($('use-supply-' + id), () => useSupply(id, 'equipment'));
    }
    bindTap($('supply-clear'), () => selectSupply(''));
    bindTap($('customizationEntry'), openCustomization);
    bindTap($('equipmentBack'), openInventory);
  }
  const hapticsAvailable = typeof navigator.vibrate === 'function';
  function feedback(name, vibration = 0) {
    audio.sfx(name);
    if (!settings.haptics || !vibration || !hapticsAvailable) return false;
    try { return navigator.vibrate(vibration) !== false; } catch { return false; }
  }
  function queueImpactFeedback(kind, sourceX, sourceY, targetX, targetY) {
    const spec = IMPACT_FEEDBACK[kind];
    if (!spec) return false;
    if (spec.priority < impactPendingPriority) return false;
    let dirX = 0, dirY = 0;
    if ([sourceX, sourceY, targetX, targetY].every(Number.isFinite)) {
      const dx = targetX - sourceX, dy = targetY - sourceY, len = Math.hypot(dx, dy);
      if (len > 0 && Number.isFinite(len)) {
        dirX = dx / len;
        dirY = dy / len;
      }
    }
    impactPendingKind = kind;
    impactPendingPriority = spec.priority;
    impactPendingDirX = dirX;
    impactPendingDirY = dirY;
    return true;
  }
  function flushImpactFeedback() {
    if (!impactPendingKind) return false;
    const kind = impactPendingKind, spec = IMPACT_FEEDBACK[kind];
    impactPendingKind = '';
    impactPendingPriority = 0;
    const magnitude = reduceMotion ? 0 : Math.min(6, Math.max(0, Number(spec.camera) || 0));
    cameraImpactBaseX = impactPendingDirX * magnitude;
    cameraImpactBaseY = impactPendingDirY * magnitude;
    cameraImpactX = cameraImpactBaseX;
    cameraImpactY = cameraImpactBaseY;
    cameraImpactDuration = magnitude > 0 ? Math.max(0, Number(spec.duration) || 0) : 0;
    cameraImpactLife = cameraImpactDuration;
    damageFlash = Math.max(damageFlash, Math.min(.38, Math.max(0, Number(spec.flash) || 0)));
    impactLastKind = kind;
    impactLastSfx = spec.sfx || '';
    impactLastHaptic = Math.max(0, Number(spec.haptic) || 0);
    feedback(impactLastSfx, impactLastHaptic);
    impactPendingDirX = 0;
    impactPendingDirY = 0;
    return true;
  }
  function updateImpactFeedback(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (cameraImpactLife > 0 && cameraImpactDuration > 0) {
      cameraImpactLife = Math.max(0, cameraImpactLife - dt);
      const ratio = cameraImpactLife / cameraImpactDuration;
      cameraImpactX = cameraImpactBaseX * ratio;
      cameraImpactY = cameraImpactBaseY * ratio;
    } else {
      cameraImpactLife = 0;
      cameraImpactX = 0;
      cameraImpactY = 0;
    }
    damageFlash = Math.max(0, damageFlash - DAMAGE_FLASH_DECAY * dt);
  }
  function resetImpactFeedback() {
    impactPendingKind = '';
    impactPendingPriority = 0;
    impactPendingDirX = 0;
    impactPendingDirY = 0;
    cameraImpactX = 0;
    cameraImpactY = 0;
    cameraImpactBaseX = 0;
    cameraImpactBaseY = 0;
    cameraImpactLife = 0;
    cameraImpactDuration = 0;
    damageFlash = 0;
    impactLastKind = '';
    impactLastSfx = '';
    impactLastHaptic = 0;
  }
  function impactFeedbackState() {
    return {
      pendingKind: impactPendingKind, pendingPriority: impactPendingPriority, pendingDirX: impactPendingDirX, pendingDirY: impactPendingDirY,
      cameraX: cameraImpactX, cameraY: cameraImpactY, cameraLife: cameraImpactLife, cameraDuration: cameraImpactDuration, damageFlash,
      lastKind: impactLastKind, lastSfx: impactLastSfx, lastHaptic: impactLastHaptic
    };
  }
  function audioStatusText() {
    const snap = audio.snapshot();
    if (!snap.available) return 'Аудио: Web Audio недоступно в этом браузере';
    if (snap.unlocked && snap.contextState === 'running') return 'Аудио: активно';
    if (snap.contextState === 'interrupted') return 'Аудио: прервано системой · нажмите «Проверить звук»';
    return 'Аудио: ожидает пользовательского касания';
  }
  function syncAudioSettings() {
    audio.configure({ master: settings.masterVolume, music: settings.musicVolume, ambient: settings.ambientVolume, sfx: settings.sfxVolume, musicEnabled: settings.musicEnabled });
    audio.setZone(zoneId);
  }
  function applyInterfaceSettings() {
    document.body.classList.toggle('ui-large', settings.uiScale === 'large');
    document.body.classList.toggle('minimap-large', settings.minimapSize === 'large');
    document.body.dataset.controlSize = settings.controlSize;
    document.documentElement.style.setProperty('--world-brightness', String(settings.brightness / 100));
    syncAudioSettings();
  }
  function setCosmetic(kind, id) {
    const table = kind === 'accent' ? COSMETICS.accents : kind === 'trail' ? COSMETICS.trails : null;
    if (!table || !Object.hasOwn(table, id) || isInCombat()) return false;
    if (!equipmentTransaction(() => { player.cosmetics[kind] = id; })) return false;
    openCustomization();
    return true;
  }
  function installRune(slot, id) {
    const table = RUNES[slot];
    if (!table || !Object.hasOwn(table, id) || isInCombat()) return false;
    if (player.runes[slot] === id) return false;
    const cost = id === 'none' ? 0 : 1;
    if ((player.inv.emberShard || 0) < cost) { toast('Нужен Осколок пламени'); return false; }
    if (!equipmentTransaction(() => {
      player.inv.emberShard -= cost;
      player.runes[slot] = id;
      recomputeDerivedStats();
    })) return false;
    openCustomization();
    toast(table[id].name + (cost ? ' установлена' : ' снята'));
    return true;
  }
  function openCustomization() {
    const inCombat = isInCombat(), shards = player.inv.emberShard || 0;
    const runeCards = ['weapon', 'armor'].map(slot => `<div class="card"><h3>${slot === 'weapon' ? 'Руна оружия' : 'Руна брони'}</h3>${Object.entries(RUNES[slot]).map(([id, rune]) => `<button class="btn runeChoice ${player.runes[slot] === id ? 'active' : ''}" id="rune-${slot}-${id}" ${inCombat || player.runes[slot] === id || (id !== 'none' && shards < 1) ? 'disabled' : ''}>${rune.name}${rune.note ? ' · ' + rune.note : ''}${id !== 'none' ? ' · 1 осколок' : ''}</button>`).join('')}</div>`).join('');
    const accentNames = { teal: 'Бирюза', gold: 'Золото', ember: 'Уголь' }, trailNames = { steel: 'Сталь', aether: 'Эфир', ember: 'Пепел' };
    openModal('Руны и внешний вид', `<p class="note">Руны дают небольшие специализации и стоят по 1 Осколку пламени. Внешний вид характеристик не меняет.</p><div class="stats"><div class="stat"><b>${shards}</b>Осколков</div><div class="stat"><b>${player.damage}</b>Урон</div><div class="stat"><b>${player.maxHp}</b>HP</div></div>${runeCards}<div class="sectionTitle">ЦВЕТ ГЕРОЯ</div><div class="seg cosmeticSeg">${Object.keys(COSMETICS.accents).map(id => `<button id="accent-${id}" class="${player.cosmetics.accent === id ? 'active' : ''}">${accentNames[id]}</button>`).join('')}</div><div class="sectionTitle">СЛЕД ЭФФЕКТОВ</div><div class="seg cosmeticSeg">${Object.keys(COSMETICS.trails).map(id => `<button id="trail-${id}" class="${player.cosmetics.trail === id ? 'active' : ''}">${trailNames[id]}</button>`).join('')}</div><button class="btn" id="customBack">Назад к экипировке</button>`);
    for (const slot of ['weapon', 'armor']) for (const id of Object.keys(RUNES[slot])) bindTap($(`rune-${slot}-${id}`), () => installRune(slot, id));
    for (const id of Object.keys(COSMETICS.accents)) bindTap($('accent-' + id), () => setCosmetic('accent', id));
    for (const id of Object.keys(COSMETICS.trails)) bindTap($('trail-' + id), () => setCosmetic('trail', id));
    bindTap($('customBack'), openEquipment);
  }
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
    const viewportScale = window.visualViewport?.scale || 1;
    document.body.classList.toggle('browser-zoomed', viewportScale > 1.01);
    W = Math.round((window.visualViewport?.width || innerWidth) * viewportScale);
    H = Math.round((window.visualViewport?.height || innerHeight) * viewportScale);
    const dprCap = profile.dprCap || 2,
      pixelBudget = profile.pixelBudget || 1500000;
    DPR = Math.min(device.dpr, dprCap, Math.sqrt(pixelBudget / Math.max(1, W * H)));
    document.documentElement.style.setProperty('--app-height', H + 'px');
    const renderWidth = Math.max(1, Math.floor(W * DPR)),
      renderHeight = Math.max(1, Math.floor(H * DPR));
    if (canvas.width !== renderWidth) canvas.width = renderWidth;
    if (canvas.height !== renderHeight) canvas.height = renderHeight;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (profile.lighting > 0 && lightCtx) {
      const lightScale = clamp(profile.lightmapScale || .5, .25, 1),
        lightWidth = Math.max(1, Math.floor(W * lightScale)),
        lightHeight = Math.max(1, Math.floor(H * lightScale));
      if (lightCanvas.width !== lightWidth) lightCanvas.width = lightWidth;
      if (lightCanvas.height !== lightHeight) lightCanvas.height = lightHeight;
      lightCtx.setTransform(lightScale, 0, 0, lightScale, 0, 0);
      lightCtx.imageSmoothingEnabled = true;
    } else if (lightCanvas.width !== 1 || lightCanvas.height !== 1) {
      lightCanvas.width = lightCanvas.height = 1;
    }
    patterns = {};
    for (const [k, img] of Object.entries(textureImages)) {
      if (img.complete) patterns[k] = ctx.createPattern(img, 'repeat');
    }
    if (art) Object.assign(patterns, art.patterns(ctx, profile.detail));
    if (!ambient.length) makeAmbient();
    if (particles.length > profile.particles) particles.length = profile.particles;
    atmosphereGradient = null;
  }
  function loadTextures() {
    const names = ['grass', 'dirt', 'stone', 'water', 'wood', 'foliage'];
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
  function currentQuestId() {
    return zones[zoneId].questId;
  }
  function quest() {
    return MAIN_QUESTS[currentQuestId()];
  }
  function questState() {
    return player.quests[currentQuestId()];
  }
  function inspectCurrentQuest() {
    return questEngine?.inspectMain(currentQuestId(), questState()) || null;
  }
  let reconcilingDiscovery = false;
  function exactDiscoveryEvent(target) {
    if (typeof target !== 'string') return null;
    const prefix = `${zoneId}:`;
    if (!target.startsWith(prefix)) return null;
    const indexText = target.slice(prefix.length);
    if (!/^\d+$/.test(indexText)) return null;
    const landmark = LANDMARKS[zoneId]?.[Number(indexText)];
    if (!landmark) return null;
    return { type:'discover', target, category:landmark[2], amount:1 };
  }
  function reconcileActiveDiscoveryObjective() {
    if (reconcilingDiscovery) return false;
    const active = inspectCurrentQuest()?.active;
    if (active?.type !== 'discover' || active.match !== 'target' || active.counter !== undefined) return false;
    if (!player.discoveries.includes(active.target)) return false;
    const event = exactDiscoveryEvent(active.target);
    if (!event) return false;
    reconcilingDiscovery = true;
    try { return applyMainQuestEvent(event); }
    finally { reconcilingDiscovery = false; }
  }
  function currentObjective() {
    return inspectCurrentQuest()?.active?.displayText || '';
  }
  function openQuests() {
    const view = inspectCurrentQuest();
    if (!view) return;
    const steps = view.steps.map(step => {
      const current = step.status === 'current', complete = step.status === 'complete';
      return `<li class="${current ? 'current' : complete ? 'complete' : ''}" ${current ? 'aria-current="step"' : ''}>${complete ? '✓ ' : ''}${escapeHTML(step.displayText)}${current ? ' · Сейчас' : ''}</li>`;
    }).join('');
    const def = CONTRACTS[zoneId], c = refreshLiveContract(zoneId), contractText = c.state === 0 ? 'Доступно в лагере' : c.state === 1 ? `Выполняется · ${c.progress}/${def.required}` : c.state === 2 ? 'Выполнено · заберите награду в лагере' : 'Завершено в этом цикле';
    openModal('Задания', `<article class="card"><p class="note">${escapeHTML(zones[zoneId].name)} · этап ${view.stepIndex + 1} из ${view.stepCount}</p><h3>${escapeHTML(view.title)}</h3><ol class="questSteps">${steps}</ol></article><article class="card"><p class="note">ПОРУЧЕНИЕ ЛАГЕРЯ</p><h3>${escapeHTML(def.title)}</h3><p>${escapeHTML(def.note)}</p><p><b>${contractText}</b></p></article><p class="note">Основное задание продвигается во время игры. Материалы из магазина не засчитываются как сбор. Поручения принимаются у доски в лагере.</p><button class="btn" id="questsClose">Вернуться в игру</button>`);
    bindTap($('questsClose'), closeModal);
  }
  function applyMainQuestResult(questId, result) {
    if (!result?.changed) return false;
    player.quests[questId] = { ...result.state };
    if (result.effects.some(effect => effect.type === 'questCycleCompleted')) {
      player.progression.completedCycles++;
      player.inv.emberShard = (player.inv.emberShard || 0) + 1;
    }
    if (result.effects.some(effect => effect.type === 'questStepChanged')) {
      ensureQuestTargets();
      feedback('quest', 10);
      if (!reconcilingDiscovery) reconcileActiveDiscoveryObjective();
    }
    return true;
  }
  function applyMainQuestEvent(event) {
    if (!questEngine) return false;
    const questId = currentQuestId();
    return applyMainQuestResult(questId, questEngine.applyMainEvent(questId, questState(), event));
  }
  function advanceQuest(reason, persist = true) {
    if (questEngine) {
      const questId = currentQuestId();
      applyMainQuestResult(questId, questEngine.evaluateLegacyReason(questId, questState(), reason));
    }
    if (persist) save();
  }
  function enemyQuestCategory(e) {
    return e?.kind === 'enemy' ? 'enemy' : null;
  }
  function ensureQuestTargets() {
    const z = zones[zoneId];
    const objective = inspectCurrentQuest()?.active;
    if (!objective) return;
    const remaining = objective.required === undefined ? 0 : Math.max(0, objective.required - (objective.current || 0));
    if (objective.type === 'gather') {
      let available = entities.filter(e => e.kind === 'resource' && e.hp > 0 && e.type === objective.target).length;
      while (available < remaining) {
        addResource(
          objective.target,
          clamp(z.scout.x + 160 + available * 42, 80, WORLD.w - 80),
          clamp(z.scout.y + 100, 80, WORLD.h - 80)
        );
        available++;
      }
      return;
    }
    if (objective.type !== 'kill') return;
    const matchesEnemy = objective.match === 'target'
      ? e => e.kind === 'enemy' && e.hp > 0 && e.type === objective.target
      : e => e.kind === 'enemy' && e.hp > 0 && enemyQuestCategory(e) === objective.target;
    let available = entities.filter(matchesEnemy).length;
    const fallbackType = objective.match === 'target' ? objective.target : objective.spawnTarget;
    for (let i = available; i < remaining; i++) {
      addEnemy(
        fallbackType,
        clamp(z.scout.x + 300 + i * 65, 80, WORLD.w - 80),
        clamp(z.scout.y + 250, 80, WORLD.h - 80)
      );
    }
  }
  function scaledEnemyDamage(baseDamage, level) {
    const safeLevel = clamp(Math.floor(Number(level) || 1), 1, 100);
    const extra = Math.max(0, safeLevel - 6);
    return Math.round(baseDamage * (1 + extra * .055));
  }
  // Level 6 is the original starting balance. Never change a wounded enemy mid-fight.
  function scaleEnemy(e) {
    if (!e.baseStats) return;
    const level = clamp(Math.floor(Number(player.level) || 1), 1, 100);
    e.level = level;
    const extra = Math.max(0, level - 6);
    e.hp = e.maxHp = Math.round(e.baseStats.hp * (1 + extra * .09));
    e.damage = scaledEnemyDamage(e.baseStats.damage, level);
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
    if (type === 'marksman') Object.assign(e, {
      r: 20,
      hp: 110,
      maxHp: 110,
      speed: 86,
      retreatSpeed: 88,
      damage: 14
    });
    if (type === 'guardian') Object.assign(e, {
      r: 40,
      hp: 620,
      maxHp: 620,
      speed: 48,
      damage: 22,
      bossPhase: 1,
      bossAttack: '',
      bossSequenceStep: 0,
      bossPhasePending: false,
      bossPhaseTransitioned: false,
      bossPhaseTransitionSerial: 0,
      bossPhaseFlashUntil: 0,
      attackRecovery: 0,
      attackBossPhase: 1
    });
    e.baseStats = {
      hp: e.maxHp,
      damage: e.damage
    };
    scaleEnemy(e);
    entities.push(e);
    physics?.relocate(e);
    e.homeX = e.x;
    e.homeY = e.y;
    e.home = {
      x: e.x,
      y: e.y
    };
    e.aiState = 'idle';
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
    for (let i = 0; i < 40; i++) ambient.push({
      x: 60 + rng(i + 7) * (WORLD.w - 120),
      y: 60 + rng(i + 91) * (WORLD.h - 120),
      kind: rng(i + 201),
      scale: .65 + rng(i + 44) * 1.55,
      seed: i
    });
  }
  function buildObstacles() {
    if (!physics) return;
    const z = zones[zoneId],
      items = [{
        x: z.camp.x,
        y: z.camp.y - 100,
        r: 48
      }, {
        x: zoneId === 'mistwood' ? 1180 : zoneId === 'stonevale' ? 1220 : 1520,
        y: zoneId === 'mistwood' ? 430 : zoneId === 'stonevale' ? 530 : 910,
        r: 65
      }, ...LANDMARKS[zoneId].map(([x, y]) => ({
        x,
        y: y + 8,
        r: 43
      }))];
    ambient = ambient.filter(a => [z.camp, z.scout, z.portal].every(p => dist(a, p) > 120) && items.every(o => dist(a, o) > o.r + 55 * a.scale));
    for (const a of ambient) items.push({
      x: a.x,
      y: a.y + 8,
      r: (zoneId === 'mistwood' ? 18 : 23) * a.scale
    });
    physics.set(items);
    // Gatherables are interaction targets, not walls. Relocate them away from true
    // static footprints, but keep them out of movement, LOS and projectile collision.
    for (const e of entities) if (e.kind === 'resource') physics.relocate(e);
    physics.relocate(player);
    for (const e of entities) if (e.kind === 'enemy') {
      physics.relocate(e);
      e.homeX = e.x;
      e.homeY = e.y;
      e.home = {
        x: e.x,
        y: e.y
      };
      e.aiState = 'idle';
    }
  }
  function moveActor(actor, dx, dy) {
    const edge = actor === player ? 70 : 40;
    if (physics) {
      physics.move(actor, dx, dy, edge);
      return;
    }
    actor.x += dx;
    actor.y += dy;
    actor.x = clamp(actor.x, edge, WORLD.w - edge);
    actor.y = clamp(actor.y, edge, WORLD.h - edge);
  }
  const ENEMY_SPAWN_TYPES = Object.freeze({
    mistwood: Object.freeze(['boar','raider','raider','raider','boar','raider','raider','raider','boar','raider','raider','raider','boar','raider','raider','raider','boar']),
    stonevale: Object.freeze(['boar','raider','raider','marksman','boar','raider','raider','marksman','boar','raider','raider','marksman','boar','raider','raider','raider','boar']),
    ashfield: Object.freeze(['boar','raider','marksman','raider','boar','marksman','raider','marksman','boar','raider','marksman','raider','boar','raider','raider','marksman','boar'])
  });
  function resetZone() {
    resetImpactFeedback();
    physics?.set([]);
    structures = LANDMARKS[zoneId].map(([x, y, k]) => ({
      kind: 'structure',
      x,
      y,
      asset: k === 'SHRINE' || k === 'BOSS' ? 'shrine' : k === 'RUIN' || k === 'MINE' ? 'ruins' : 'house',
      height: 140
    }));
    structures.push({
      kind: 'structure',
      x: zoneId === 'mistwood' ? 1180 : zoneId === 'stonevale' ? 1220 : 1520,
      y: zoneId === 'mistwood' ? 420 : zoneId === 'stonevale' ? 520 : 900,
      asset: zoneId === 'mistwood' ? 'house' : zoneId === 'stonevale' ? 'ruins' : 'shrine',
      height: 148
    });
    entities = [];
    particles = [];
    projectiles = [];
    lootDrops = [];
    floatingTexts = [];
    player.attackQueuedUntil = 0;
    player.dashRemaining = 0;
    player.dodgeUntil = 0;
    cancelBlock();
    const z = zones[zoneId];
    player.x = z.camp.x;
    player.y = z.camp.y;
    player.dir = 0;
    const enemySpawnTypes = ENEMY_SPAWN_TYPES[zoneId] || ENEMY_SPAWN_TYPES.mistwood;
    for (let i = 0; i < enemySpawnTypes.length; i++) {
      const x = 150 + rng(i + 300 + zoneId.length) * (WORLD.w - 300),
        y = 150 + rng(i + 620 + zoneId.length * 7) * (WORLD.h - 300);
      addEnemy(enemySpawnTypes[i], x, y);
    }
    for (let i = 0; i < 32; i++) {
      const x = 150 + rng(i + 1200 + zoneId.length) * (WORLD.w - 300),
        y = 150 + rng(i + 1700 + zoneId.length * 3) * (WORLD.h - 300),
        kind = i % 3 === 0 ? z.resources[0] : z.resources[1];
      addResource(kind, x, y);
    }
    if (zoneId === 'stonevale') addEnemy('guardian', 1680, 720);
    makeAmbient();
    buildObstacles();
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
    if (!settings.combatNumbers) return;
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
      recomputeDerivedStats();
      player.hp = player.maxHp;
      toast('Новый уровень — ' + player.level);
    }
  }
  function spawnLootFromEnemy(e, excludeGuardianToken = false) {
    const table = e.type === 'guardian' ? LOOT_TABLE.guardian : LOOT_TABLE.common;
    const allowed = excludeGuardianToken ? table.filter(item => item.id !== 'guardianToken') : table;
    const total = allowed.reduce((sum, item) => sum + item.chance, 0);
    const roll = Math.random() * total;
    let acc = 0;
    for (const d of allowed) {
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
  function isInCombat() {
    return entities.some(e => e.kind === 'enemy' && e.hp > 0 && e.aiState === 'chase');
  }
  function cancelBlock() {
    if (!player.blocking) return;
    player.blocking = false;
    ui.blockBtn?.classList.remove('pressed');
  }
  function kill(e) {
    e.hp = 0;
    e._corpseUntil = time + 0.75;
    gainXP(e.type === 'guardian' ? 120 : 18);
    player.gold += e.type === 'guardian' ? 90 : 4 + Math.floor(Math.random() * 5);
    const objective = inspectCurrentQuest()?.active;
    const guardianQuestActive = zoneId === 'stonevale' && e.type === 'guardian'
      && objective?.type === 'kill' && objective.match === 'target' && objective.target === 'guardian';
    const firstGuardianUnlock = guardianQuestActive && !(player.inv.guardianToken > 0);
    spawnLootFromEnemy(e, firstGuardianUnlock);
    if (guardianQuestActive) {
      if (firstGuardianUnlock) {
        player.inv.guardianToken = 1;
        toast('Получен Знак стража · броня открыта');
      } else toast('Страж руин повержен!');
    }
    applyQuestProgressEvent({ type: 'kill', target: e.type, category: enemyQuestCategory(e), amount: 1 });
    burst(e.x, e.y, e.type === 'guardian' ? '#ceb1ea' : '#e27677', 24, 155);
    save();
  }
  function hitTarget(e, dmg) {
    if (!e || e.hp <= 0 || !Number.isFinite(dmg) || dmg <= 0) return;
    if (!Number.isFinite(e.hp)) e.hp = 0;
    const homeDistance = Math.hypot(e.x - (e.homeX ?? e.x), e.y - (e.homeY ?? e.y));
    const playerFromHome = Math.hypot(player.x - (e.homeX ?? e.x), player.y - (e.homeY ?? e.y));
    if (dist(player, e) < 440 && homeDistance <= 420 && playerFromHome <= 480) e.aiState = 'chase';
    const lethal = e.hp - dmg <= 0;
    e.hp -= dmg;
    e.hit = .16;
    animate(e, 'hit', .2);
    if (lethal) {
      queueImpactFeedback(e.type === 'guardian' ? 'guardianKill' : 'enemyKill', player.x, player.y, e.x, e.y);
      kill(e);
    } else {
      burst(e.x, e.y, '#efcfa8', 9, 118);
      queueImpactFeedback('enemyHit', player.x, player.y, e.x, e.y);
    }
  }
  function beginPlayerAttack() {
    const begun = combatEngine.beginAttack(combatStateSnapshot());
    applyCombatState(begun.state);
    feedback('attack', 6);
    animate(player, 'attack', COMBAT_RULES.attackCooldown);
    let target = null,
      bestDist = Infinity;
    for (const e of entities) {
      if (e.hp <= 0 || e.kind !== 'enemy') continue;
      const d = dist(player, e),
        hitRange = 104 + e.r;
      if (d < hitRange && d < bestDist && (!physics || physics.clearLine(player.x, player.y, e.x, e.y, 2))) {
        bestDist = d;
        target = e;
      }
    }
    if (target) player.dir = Math.atan2(target.y - player.y, target.x - player.x);
    const a = player.dir;
    motions.get(player).dir = a;
    let hits = 0;
    for (const e of entities) {
      if (e.hp <= 0 || e.kind !== 'enemy') continue;
      const d = dist(player, e),
        hitRange = 104 + e.r;
      if (d >= hitRange || physics && !physics.clearLine(player.x, player.y, e.x, e.y, 2)) continue;
      const ea = Math.atan2(e.y - player.y, e.x - player.x);
      if (Math.abs(angleDiff(ea, a)) >= 1.05) continue;
      const resolved = combatEngine.resolveBasicDamage({ damage: player.damage, combo: player.combo, critRoll: Math.random() });
      if (!resolved.valid) continue;
      hitTarget(e, resolved.amount);
      addFloatingText(resolved.critical ? 'КРИТ!' : String(resolved.amount), e.x, e.y - e.r - 18, resolved.critical ? '#ffe08a' : '#f4d3a3');
      hits++;
    }
    burst(player.x + Math.cos(a) * 36, player.y + Math.sin(a) * 36, COSMETICS.trails[player.cosmetics.trail] || '#e4bf69', hits ? 12 + player.combo * 2 : 5, 95);
    return true;
  }
  function attack() {
    if (isPaused()) return false;
    const requested = combatEngine.requestAttack(combatStateSnapshot(), time);
    if (requested.decision === 'reject') return false;
    cancelBlock();
    applyCombatState(requested.state);
    if (requested.decision === 'buffer') return false;
    return beginPlayerAttack();
  }
  function dodge() {
    if (isPaused()) return false;
    const requested = combatEngine.requestDodge({ now: time, stamina: player.stamina, dodgeCd: player.dodgeCd, tuning: buildProfile.combat });
    if (!requested.accepted) return false;
    cancelBlock();
    applyCombatState(requested.state);
    animate(player, 'dodge', requested.action.duration);
    const moving = Math.hypot(joy.x, joy.y) > .08;
    const mx = moving ? joy.x : Math.cos(player.dir),
      my = moving ? joy.y : Math.sin(player.dir),
      mag = Math.hypot(mx, my) || 1;
    player.dashX = mx / mag;
    player.dashY = my / mag;
    burst(player.x, player.y, COSMETICS.trails[player.cosmetics.trail] || '#91c6cc', 16, 145);
    feedback('dodge', 10);
    toast('Уклонение');
    return true;
  }
  function skill(n) {
    if (isPaused()) return false;
    const requested = combatEngine.requestSkill({
      id: n,
      now: time,
      stamina: player.stamina,
      hp: player.hp,
      maxHp: player.maxHp,
      secondWindCd: player.secondWindCd,
      tuning: buildProfile.combat
    });
    if (!requested.accepted) {
      if (requested.reason === 'fullHealth') toast('Здоровье полное');
      else if (requested.reason === 'cooldown') toast(`Второе дыхание: ${Math.ceil(player.secondWindCd - time)} с`);
      else if (requested.reason === 'stamina') toast('Недостаточно выносливости');
      return false;
    }
    cancelBlock();
    applyCombatState(requested.state);
    const action = requested.action;
    animate(player, action.type === 'secondWind' ? 'drink' : 'cast', .55);
    const a = player.dir;
    if (action.type === 'windSlash') {
      let hits = 0;
      for (const e of entities) {
        if (e.hp <= 0 || e.kind !== 'enemy') continue;
        const d = dist(player, e),
          ea = Math.atan2(e.y - player.y, e.x - player.x);
        if (d < action.range && Math.abs(angleDiff(ea, a)) < action.halfArc && (!physics || physics.clearLine(player.x, player.y, e.x, e.y, 2))) {
          hitTarget(e, Math.round(player.damage * action.damageMultiplier));
          hits++;
        }
      }
      burst(player.x, player.y, COSMETICS.trails[player.cosmetics.trail] || '#8fc4e3', 26, 160);
      feedback('attack', 8);
      toast(hits ? `Разрез ветра: ${hits} попад.` : 'Разрез ветра — мимо');
    } else if (action.type === 'triplePulse') {
      for (let i = 0; i < action.count; i++) {
        const aa = a + (i - 1) * action.spread;
        projectiles.push({
          owner: 'player',
          x: player.x + Math.cos(a) * 24,
          y: player.y + Math.sin(a) * 24,
          vx: Math.cos(aa) * action.speed,
          vy: Math.sin(aa) * action.speed,
          damage: Math.round(player.damage * action.damageMultiplier),
          life: action.lifetime,
          color: COSMETICS.trails[player.cosmetics.trail] || '#bfe9ee'
        });
      }
      feedback('attack', 8);
      toast('Тройной импульс');
    } else {
      burst(player.x, player.y, '#86c99b', 20, 100);
      feedback('drink', 10);
      toast('Восстановлено здоровье');
    }
    return true;
  }
  const interactionResult = {
    type: '',
    entity: null,
    d: Infinity
  };
  const interactionPriority = {
    loot: 0,
    scout: 1,
    camp: 1.5,
    resource: 2,
    portal: 3,
    portalLocked: 4
  };
  const CAMP_INTERACTION_OFFSET = { x: -10, y: -36 };
  const CAMP_GLOW_OFFSET = { x: -6, y: -38 };
  function campInteractionPoint(camp) {
    return { x: camp.x + CAMP_INTERACTION_OFFSET.x, y: camp.y + CAMP_INTERACTION_OFFSET.y };
  }
  function campGlowPoint(camp) {
    return { x: camp.x + CAMP_GLOW_OFFSET.x, y: camp.y + CAMP_GLOW_OFFSET.y };
  }
  function considerInteraction(type, entity, radius) {
    const d = Math.hypot(player.x - entity.x, player.y - entity.y);
    if (d >= radius || physics && !physics.clearLine(player.x, player.y, entity.x, entity.y, 1, entity)) return;
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
    considerInteraction('camp', campInteractionPoint(z.camp), 118);
    for (const loot of lootDrops) if (loot.life > 0) considerInteraction('loot', loot, 105);
    for (const e of entities) if (e.kind === 'resource' && e.hp > 0) considerInteraction('resource', e, 105);
    considerInteraction(canUsePortal() ? 'portal' : 'portalLocked', z.portal, 135);
    return interactionResult.type ? interactionResult : null;
  }
  function refreshLiveContract(id = zoneId) {
    const c = player.contracts[id];
    if (!c || !questEngine) return c || null;
    const result = questEngine.refreshContract(id, c, player.progression.completedCycles);
    if (result.changed) Object.assign(c, result.state);
    return c;
  }
  function applyContractEvent(event) {
    const c = refreshLiveContract(zoneId);
    if (!c || !questEngine) return false;
    const result = questEngine.applyContractEvent(zoneId, c, event, player.progression.completedCycles);
    if (!result.changed) return false;
    Object.assign(c, result.state);
    if (result.effects.some(effect => effect.type === 'contractCompleted')) {
      toast('Поручение выполнено · вернитесь в лагерь');
      feedback('quest', 18);
    }
    return true;
  }
  function applyQuestProgressEvent(event) {
    const mainChanged = applyMainQuestEvent(event);
    const contractChanged = applyContractEvent(event);
    return mainChanged || contractChanged;
  }
  function progressContract(kind, target) {
    return applyContractEvent({ type: kind, target, category: kind === 'kill' ? target : undefined, amount: 1 });
  }
  function acceptContract() {
    if (isInCombat()) return false;
    const c = refreshLiveContract(zoneId), def = CONTRACTS[zoneId];
    if (!c || !def || !questEngine) return false;
    const result = questEngine.acceptContract(zoneId, c, player.progression.completedCycles);
    if (!result.changed) return false;
    Object.assign(c, result.state);
    if (!save()) { c.state = 0; return false; }
    openCamp(); toast('Поручение принято: ' + def.title); feedback('quest', 12); return true;
  }
  function claimContract() {
    if (isInCombat()) return false;
    const c = refreshLiveContract(zoneId), def = CONTRACTS[zoneId];
    if (!c || !def || !questEngine) return false;
    const result = questEngine.claimContract(zoneId, c, player.progression.completedCycles);
    if (!result.changed) return false;
    const before = JSON.parse(JSON.stringify(player));
    Object.assign(c, result.state);
    const reward = result.effects.find(effect => effect.type === 'grantContractReward');
    if (reward) {
      player.gold += reward.gold;
      player.supplies[reward.supply] = Math.min(9999, (player.supplies[reward.supply] || 0) + reward.amount);
    }
    if (!save()) { Object.assign(player, before); return false; }
    openCamp(); toast(`Награда: ${def.gold} золота · ${SUPPLIES[def.supply].name}`); feedback('quest', 20); return true;
  }
  function restAtCamp() {
    if (isInCombat()) { toast('Сначала выйдите из боя'); return false; }
    if (player.hp >= player.maxHp && player.stamina >= player.maxStamina) { toast('Вы уже готовы к пути'); return false; }
    player.hp = player.maxHp; player.stamina = player.maxStamina; player.supplyCd = 0; player.secondWindCd = 0;
    save(); updateUI(); openCamp(); toast('Отдых восстановил силы'); return true;
  }
  function openCamp() {
    if (isInCombat()) { toast('Лагерь недоступен во время боя'); return false; }
    const def = CONTRACTS[zoneId], c = refreshLiveContract(zoneId);
    const stateText = c.state === 0 ? 'Доступно новое поручение' : c.state === 1 ? `Прогресс: ${c.progress}/${def.required}` : c.state === 2 ? 'Задание выполнено · заберите награду' : 'Поручение этого цикла завершено';
    const action = c.state === 0 ? `<button class="btn" id="contractAction">Принять поручение</button>` : c.state === 2 ? `<button class="btn" id="contractAction">Забрать награду · ${def.gold} золота</button>` : '';
    openModal('Лагерь · ' + zones[zoneId].name, `<article class="card"><h3>Доска поручений</h3><p><b>${def.title}</b><br>${def.note}</p><p class="note">${stateText}</p>${action}</article><button class="btn" id="campRest">Отдохнуть · восстановить HP и выносливость</button><button class="btn" id="campCustomize">Руны и внешний вид</button><button class="btn" id="campClose">Вернуться в игру</button>`);
    if (c.state === 0) bindTap($('contractAction'), acceptContract); else if (c.state === 2) bindTap($('contractAction'), claimContract);
    bindTap($('campRest'), restAtCamp); bindTap($('campCustomize'), openCustomization); bindTap($('campClose'), closeModal);
    return true;
  }
  function checkDiscoveries() {
    if (time < nextDiscoveryAt) return;
    nextDiscoveryAt = time + .35;
    const list = LANDMARKS[zoneId] || [];
    for (let i = 0; i < list.length; i++) {
      const [x, y, kind, name] = list[i], id = `${zoneId}:${i}`;
      if (player.discoveries.includes(id) || Math.hypot(player.x - x, player.y - y) > 135) continue;
      player.discoveries.push(id);
      player.gold += 10;
      gainXP(10);
      applyQuestProgressEvent({ type: 'discover', target: id, category: kind, amount: 1 });
      save();
      toast(`Открыто место: ${name} · +10 золота`); feedback('discovery', 15); break;
    }
  }
  function openNpcDialog() {
    const z = zones[zoneId];
    const name = zoneId === 'ashfield' ? 'Смотритель Вейл' : 'Разведчик Ари';
    const text = zoneId === 'ashfield' ? 'Пепел движется. Хранитель пробудился. Будьте готовы.' : 'Мы нашли след. Помоги очистить тропу и добраться до следующей долины.';
    openModal(name, `<div class="dialogue"><div class="dialogueName">${name}</div><p>${text}</p><p class="note">Новая цель: ${currentObjective()}</p><button class="btn" id="dialogContinue">Продолжить</button></div>`);
    bindTap($('dialogContinue'), closeModal);
  }
  function canUsePortal() {
    return inspectCurrentQuest()?.active?.type === 'portal';
  }
  function interact() {
    if (interactionLock > time || isPaused()) return;
    interactionLock = time + .16;
    const hit = nearbyInteraction();
    if (!hit) return;
    animate(player, 'gather', .5);
    if (hit.type === 'camp') { openCamp(); return; }
    if (hit.type === 'portal' || hit.type === 'portalLocked') {
      if (!canUsePortal()) {
        toast('Сначала завершите текущую задачу');
        return;
      }
      feedback('portal', 14);
      transitionZone();
      return;
    }
    if (hit.type === 'scout') {
      const s = questState();
      if (s.step === 0) {
        applyMainQuestEvent({ type: 'talk', target: 'scout' });
        save();
      }
      openNpcDialog();
      return;
    }
    if (hit.type === 'loot') {
      const l = hit.entity;
      if (!l) return;
      if (l.id === 'coin') player.gold += l.count;else player.inv[l.id] = (player.inv[l.id] || 0) + l.count;
      const text = l.id === 'coin' ? `Золото +${l.count}` : `Получено: ${l.label} ×${l.count}`;
      toast(text);
      feedback('pickup', 6);
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
    applyQuestProgressEvent({ type: 'gather', target: key, amount: 1 });
    toast('Получено: ' + {
      wood: 'древесина',
      ore: 'руда',
      herb: 'трава'
    }[key]);
    burst(r.x, r.y, '#d6c274', 12, 105);
    feedback('pickup', 5);
    r.hp = 0;
    const idx = entities.indexOf(r);
    if (idx >= 0) entities.splice(idx, 1);
    updateUI();
    save();
  }
  function transitionZone() {
    if (transitioning) return;
    resetInput();
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
      const cyclesBefore = player.progression.completedCycles;
      applyMainQuestEvent({ type: 'portal' });
      const cycleCompleted = player.progression.completedCycles > cyclesBefore;
      zoneId = zones[zoneId].next;
      audio.setZone(zoneId);
      resetZone();
      save();
      setTimeout(() => {
        resetFrameLimiter();
        ui.loading.classList.add('hidden');
        transitioning = false;
        toast(cycleCompleted ? zones[zoneId].name + ' · получен Осколок пламени' : zones[zoneId].name);
      }, 120);
    }
    requestAnimationFrame(tick);
  }
  let previousModalFocus = null;
  function modalFocusable() {
    return [...ui.modal.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')];
  }
  function openModal(title, body) {
    shopOpen = false;
    resetInput();
    previousModalFocus = document.activeElement && !ui.modal.contains(document.activeElement) ? document.activeElement : previousModalFocus;
    setText(ui.modalTitle, title);
    ui.modalBody.innerHTML = body;
    ui.modal.classList.remove('hidden');
    $('modalClose')?.focus();
  }
  function closeModal() {
    shopOpen = false;
    ui.modal.classList.add('hidden');
    resetFrameLimiter();
    updateUI();
    if (previousModalFocus?.focus) previousModalFocus.focus();
    previousModalFocus = null;
  }
  document.addEventListener('keydown', event => {
    if (ui.modal.classList.contains('hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = modalFocusable();
    if (!focusable.length) {
      event.preventDefault();
      $('modalClose')?.focus();
      return;
    }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  function openInventory() {
    const stats = statSources(), inCombat = isInCombat();
    const bladeReason = inCombat ? 'Недоступно во время боя' : player.progression.forgeRank >= MAX_UPGRADE_RANK ? 'Максимальный ранг' : player.inv.wood < 3 || player.inv.ore < 2 ? `Нужно: ${Math.max(0, 3 - player.inv.wood)} древесины, ${Math.max(0, 2 - player.inv.ore)} руды` : '';
    const vitalityReason = inCombat ? 'Недоступно во время боя' : player.progression.vitalityRank >= MAX_UPGRADE_RANK ? 'Максимальный ранг' : player.inv.herb < 3 || player.inv.wood < 1 ? `Нужно: ${Math.max(0, 3 - player.inv.herb)} травы, ${Math.max(0, 1 - player.inv.wood)} древесины` : '';
    const recipeReason = id => {
      if (inCombat) return 'Недоступно во время боя';
      if (player.supplies[id] >= 9999) return 'Сумка полна';
      const r = SUPPLY_RECIPES[id];
      const missing = Object.entries(r).filter(([k]) => k !== 'label').filter(([k, n]) => (player.inv[k] || 0) < n).map(([k, n]) => `${{herb:'трава',wood:'древесина',ore:'руда'}[k]} ${n - (player.inv[k] || 0)}`);
      return missing.length ? 'Нужно: ' + missing.join(', ') : '';
    };
    const discovered = player.discoveries.filter(id => id.startsWith(zoneId + ':')).length;
    openModal('Сумка и экипировка', `<button class="btn" id="equipmentEntry">Экипировка, расходники и руны</button><div class="grid"><div class="card">${itemArt('sword')}<h3>Оружие</h3><p>${escapeHTML(player.equipment.weapon)}<br>Урон: <b>${player.damage}</b></p></div><div class="card">${itemArt('armor')}<h3>Броня</h3><p>${escapeHTML(player.equipment.armor)}<br>Макс. здоровье: <b>${player.maxHp}</b></p></div><div class="card"><h3>Ресурсы</h3><p>Древесина: ${player.inv.wood}<br>Руда: ${player.inv.ore}<br>Трава: ${player.inv.herb}</p></div><div class="card"><h3>Прогресс</h3><p>Золото: <b>${player.gold}</b><br>Знаки: ${player.inv.guardianToken || 0}<br>Осколки: ${player.inv.emberShard || 0}<br>Циклы: ${player.progression.completedCycles}<br>Открыто мест: ${discovered}/${LANDMARKS[zoneId].length}</p></div></div><div class="card"><h3>Источники характеристик</h3><p>Урон: ${stats.damage.base} база + ${stats.damage.level} уровни + ${stats.damage.permanent} постоянные + ${stats.damage.gear} оружие + ${stats.damage.rune} руна = <b>${stats.damage.total}</b><br>HP: ${stats.hp.base} база + ${stats.hp.level} уровни + ${stats.hp.permanent} постоянные + ${stats.hp.gear} броня + ${stats.hp.rune} руна = <b>${stats.hp.total}</b></p></div><div class="sectionTitle">РАСХОДНИКИ</div><div class="shopList">${Object.entries(SUPPLIES).map(([id,item]) => `<article class="card">${itemArt('potion')}<h3>${item.name} · ${player.supplies[id]} шт.</h3><p>${item.note}</p><button class="btn" id="inv-use-${id}" ${supplyUseReason(id) || inCombat ? 'disabled' : ''}>${inCombat ? 'Недоступно во время боя' : supplyUseReason(id) || 'Использовать сейчас'}</button></article>`).join('')}</div><div class="sectionTitle">КРАФТ РАСХОДНИКОВ</div><button class="btn" id="brew-potion" ${recipeReason('potion') ? 'disabled' : ''}>${recipeReason('potion') || 'Зелье лечения · 3 травы + 1 древесина'}</button><button class="btn" id="brew-tonic" ${recipeReason('tonic') ? 'disabled' : ''}>${recipeReason('tonic') || 'Тоник выносливости · 1 трава + 1 руда'}</button><button class="btn" id="brew-fieldKit" ${recipeReason('fieldKit') ? 'disabled' : ''}>${recipeReason('fieldKit') || 'Походный эликсир · 2 травы + 1 древесина + 1 руда'}</button><div class="sectionTitle">ПОСТОЯННЫЕ УСИЛЕНИЯ</div><button class="btn" id="craftBtn" ${bladeReason ? 'disabled' : ''}>${bladeReason || `Закалить меч · ранг ${player.progression.forgeRank + 1}/${MAX_UPGRADE_RANK} · 3 древесины + 2 руды`}</button><button class="btn" id="potionBtn" ${vitalityReason ? 'disabled' : ''}>${vitalityReason || `Эликсир жизни · ранг ${player.progression.vitalityRank + 1}/${MAX_UPGRADE_RANK} · +12 HP · 3 травы + 1 древесина`}</button>`);
    bindTap($('craftBtn'), () => craft('blade'));
    bindTap($('potionBtn'), () => craft('potion'));
    bindTap($('equipmentEntry'), openEquipment);
    for (const id of Object.keys(SUPPLIES)) {
      bindTap($('brew-' + id), () => brewSupply(id));
      bindTap($('inv-use-' + id), () => useSupply(id, 'inventory'));
    }
  }
  const SHOP_ITEMS = [{
    id: 'buckler',
    name: 'Щит дозорного',
    note: 'Левая рука. При блоке снижает входящий урон на 82% (с округлением).',
    price: 220,
    gear: true
  }, {
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
    id: 'potion',
    name: 'Зелье лечения',
    note: 'В сумку: до 100 здоровья при применении. Расход 1 шт.',
    price: 35,
    supply: 'potion'
  }, {
    id: 'tonic',
    name: 'Тоник выносливости',
    note: 'В сумку: до 60 выносливости при применении. Расход 1 шт.',
    price: 30,
    supply: 'tonic'
  }, {
    id: 'fieldKit',
    name: 'Походный эликсир',
    note: 'В сумку: до 70 здоровья и 35 выносливости. Расход 1 шт.',
    price: 55,
    supply: 'fieldKit'
  }, {
    id: 'healing',
    name: 'Лечение у торговца',
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
    note: 'Бонус при ношении: +40 макс. здоровья относительно базовой брони. Экипируется сразу. Один раз.',
    price: 450,
    health: 40
  }];
  let shopOpen = false,
    purchaseReadyAt = 0;
  function unavailableItem(item) {
    if (isInCombat()) return 'Недоступно во время боя';
    if (player.shopOwned[item.id]) return 'Уже куплено';
    if (item.supply && player.supplies[item.supply] >= 9999) return 'Сумка полна';
    if (item.heal && player.hp >= player.maxHp) return 'Здоровье полное';
    if (player.gold < item.price) return 'Не хватает ' + (item.price - player.gold) + ' золота';
    return '';
  }
  function openShop() {
    openModal('Магазин', `<div class="shopWallet">Золото: <b>${player.gold}</b></div>
      <p class="note">Снаряжение надевается сразу; его можно сменить в экипировке. Зелья и тоники поступают в сумку. Лечение у торговца применяется сразу.</p>
      <div class="shopList">${SHOP_ITEMS.map(item => `<article class="card">${itemArt(item.id)}<h3>${item.name}</h3><p>${item.note}</p><button class="btn" id="buy-${item.id}" ${unavailableItem(item) ? 'disabled' : ''}>${unavailableItem(item) || 'Купить · ' + item.price + ' золота'}</button></article>`).join('')}</div>
      <button class="btn" id="shopBack">Вернуться в игру</button>`);
    shopOpen = true;
    for (const item of SHOP_ITEMS) bindTap($('buy-' + item.id), () => buyItem(item.id));
    bindTap($('shopBack'), closeModal);
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
      },
      loadout: {
        ...player.loadout
      },
      supplies: {
        ...player.supplies
      }
    };
    player.gold -= item.price;
    if (item.resource) player.inv[item.resource] += item.count;
    if (item.supply) player.supplies[item.supply]++;
    if (item.heal) player.hp = Math.min(player.maxHp, player.hp + item.heal);
    if (item.gear) {
      player.shopOwned[id] = true;
      switchGear(id);
    }
    if (item.damage) {
      player.shopOwned[id] = true;
      switchGear(id);
    }
    if (item.health) {
      const oldMax = player.maxHp;
      player.shopOwned[id] = true;
      switchGear(id);
      player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - oldMax));
    }
    if (!save()) {
      Object.assign(player, before);
      recomputeDerivedStats();
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
      'very-high': 'Очень высокое',
      ultra: 'Ультра'
    };
    return `<div class="sectionTitle">ИГРА НА УСТРОЙСТВЕ</div>
      <div class="card"><p>Текущее качество: <b>${names[settings.quality]}</b><br>
      Лимит отрисовки: <b>${settings.fps} FPS</b><br>DPR: <b>${DPR.toFixed(2)}</b><br>Разрешение игры: ${canvas.width} × ${canvas.height}</p></div>
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
    if (isInCombat()) {
      toast('Недоступно во время боя');
      return false;
    }
    const before = JSON.parse(JSON.stringify(player));
    if (recipe === 'blade') {
      if (player.progression.forgeRank >= MAX_UPGRADE_RANK) {
        toast('Закалка: максимальный ранг');
        return false;
      }
      if (player.inv.wood < 3 || player.inv.ore < 2) {
        toast('Недостаточно ресурсов');
        return false;
      }
      player.inv.wood -= 3;
      player.inv.ore -= 2;
      player.progression.forgeRank++;
      recomputeDerivedStats();
      if (!save()) {
        Object.assign(player, before);
        recomputeDerivedStats();
        toast('Крафт отменён: сохранение недоступно');
        return false;
      }
      closeModal();
      toast(`Закалка меча: ранг ${player.progression.forgeRank}/${MAX_UPGRADE_RANK} · +5 урона`);
      return true;
    }
    if (recipe === 'potion') {
      if (player.progression.vitalityRank >= MAX_UPGRADE_RANK) {
        toast('Эликсир жизни: максимальный ранг');
        return false;
      }
      if (player.inv.herb < 3 || player.inv.wood < 1) {
        toast('Недостаточно ресурсов');
        return false;
      }
      player.inv.herb -= 3;
      player.inv.wood--;
      player.progression.vitalityRank++;
      recomputeDerivedStats();
      player.hp = player.maxHp;
      if (!save()) {
        Object.assign(player, before);
        recomputeDerivedStats();
        toast('Крафт отменён: сохранение недоступно');
        return false;
      }
      closeModal();
      toast(`Эликсир жизни: ранг ${player.progression.vitalityRank}/${MAX_UPGRADE_RANK} · +12 макс. HP`);
      return true;
    }
    return false;
  }
  const SUPPLY_RECIPES = Object.freeze({
    potion: { herb: 3, wood: 1, label: 'Зелье лечения' },
    tonic: { herb: 1, ore: 1, label: 'Тоник выносливости' },
    fieldKit: { herb: 2, wood: 1, ore: 1, label: 'Походный эликсир' }
  });
  function recipeMissing(recipe) {
    return Object.entries(recipe).filter(([key]) => key !== 'label').map(([key, need]) => Math.max(0, need - (player.inv[key] || 0))).some(Boolean);
  }
  function brewSupply(id = 'potion') {
    const recipe = SUPPLY_RECIPES[id];
    if (ui.modal.classList.contains('hidden') || !recipe || player.supplies[id] >= 9999) return false;
    if (isInCombat()) { toast('Недоступно во время боя'); return false; }
    if (recipeMissing(recipe)) { toast('Недостаточно ресурсов'); return false; }
    if (!equipmentTransaction(() => {
      for (const [key, need] of Object.entries(recipe)) if (key !== 'label') player.inv[key] -= need;
      player.supplies[id]++;
    })) return false;
    openInventory();
    toast(recipe.label + ' добавлен в сумку');
    return true;
  }
  function applyControlLayout() {
    document.body.classList.toggle('left-handed', settings.controls === 'left');
    document.body.dataset.controlSize = settings.controlSize;
  }
  function persistSetting(key, value) {
    storage.setItem('aef_' + key, String(value));
  }
  function setControls(side) {
    settings.controls = side === 'left' ? 'left' : 'right';
    persistSetting('controls', settings.controls);
    applyControlLayout(); save(); openMenu();
  }
  function setUiSetting(key, value) {
    settings[key] = value;
    const storageKeys = { controlSize:'control_size', brightness:'brightness', uiScale:'ui_scale', minimapSize:'minimap_size', combatNumbers:'combat_numbers', haptics:'haptics', musicEnabled:'music_enabled' };
    persistSetting(storageKeys[key] || key, typeof value === 'boolean' ? (value ? '1' : '0') : value);
    applyInterfaceSettings(); save(); openMenu();
  }
  function setVolume(key, value) {
    const n = Math.max(0, Math.min(1, Number(value) / 100));
    settings[key] = n;
    const storageKeys = { masterVolume:'master_volume', musicVolume:'music_volume', ambientVolume:'ambient_volume', sfxVolume:'sfx_volume' };
    persistSetting(storageKeys[key], n);
    syncAudioSettings();
  }
  function volumeRow(id, label, value) {
    return `<label class="rangeRow" for="${id}"><span>${label}</span><input id="${id}" type="range" min="0" max="100" step="5" value="${Math.round(value * 100)}"><b id="${id}Value">${Math.round(value * 100)}%</b></label>`;
  }
  function openMenu() {
    openModal('Настройки · v' + BUILD_VERSION, `<div class="stats"><div class="stat"><b>${player.level}</b>Уровень</div><div class="stat"><b>${Math.round(player.hp)}</b>Здоровье</div><div class="stat"><b>${player.damage}</b>Урон</div></div>
      <div class="sectionTitle">ЗВУК</div>
      <button class="btn" id="musicToggle">${settings.musicEnabled ? 'Музыка: включена' : 'Музыка: выключена'}</button>
      <button class="btn secondary" id="audioTestBtn">Проверить звук</button><p class="note" id="audioStatus">${audioStatusText()}</p>
      ${volumeRow('masterVolume','Общая громкость',settings.masterVolume)}${volumeRow('musicVolume','Музыка',settings.musicVolume)}${volumeRow('ambientVolume','Окружение',settings.ambientVolume)}${volumeRow('sfxVolume','Эффекты',settings.sfxVolume)}
      <div class="sectionTitle">УПРАВЛЕНИЕ</div><div class="seg" id="controlsSeg"><button id="control-right" class="${settings.controls === 'right' ? 'active' : ''}">Правша</button><button id="control-left" class="${settings.controls === 'left' ? 'active' : ''}">Левша</button></div>
      <p class="note">Расположение зон управления можно зеркалить. Размер меняется без изменения игровой физики.</p><div class="seg"><button id="controlSize-compact" class="${settings.controlSize === 'compact' ? 'active' : ''}">Компактно</button><button id="controlSize-normal" class="${settings.controlSize === 'normal' ? 'active' : ''}">Обычно</button><button id="controlSize-large" class="${settings.controlSize === 'large' ? 'active' : ''}">Крупно</button></div>
      <div class="sectionTitle">ИНТЕРФЕЙС</div><div class="seg"><button id="bright-85" class="${settings.brightness === 85 ? 'active' : ''}">Темнее</button><button id="bright-100" class="${settings.brightness === 100 ? 'active' : ''}">Обычно</button><button id="bright-115" class="${settings.brightness === 115 ? 'active' : ''}">Ярче</button></div><div class="seg"><button id="ui-normal" class="${settings.uiScale === 'normal' ? 'active' : ''}">Текст 100%</button><button id="ui-large" class="${settings.uiScale === 'large' ? 'active' : ''}">Текст 115%</button></div><div class="seg"><button id="map-normal" class="${settings.minimapSize === 'normal' ? 'active' : ''}">Карта обычная</button><button id="map-large" class="${settings.minimapSize === 'large' ? 'active' : ''}">Карта крупная</button></div><button class="btn" id="numbersToggle">Цифры урона: ${settings.combatNumbers ? 'включены' : 'выключены'}</button><button class="btn" id="hapticsToggle" ${hapticsAvailable ? '' : 'disabled'}>${hapticsAvailable ? `Виброотклик: ${settings.haptics ? 'включён' : 'выключен'}` : 'Виброотклик: недоступен в браузере'}</button>${hapticsAvailable ? '' : '<p class="note">Safari/iOS не предоставляет веб-страницам Vibration API. На поддерживаемых Android-браузерах виброотклик работает.</p>'}
      <div class="sectionTitle">КАЧЕСТВО ГРАФИКИ</div><div class="settingRow"><div class="seg" id="qualitySeg">${['low', 'medium', 'high', 'very-high', 'ultra'].map(q => `<button data-q="${q}" class="${settings.quality === q ? 'active' : ''}">${q === 'very-high' ? 'Very High' : q === 'ultra' ? 'Ultra' : q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div><div class="note">Ultra повышает детализацию, освещение и эффекты; яркость мира настраивается отдельно выше.</div></div>
      <div class="sectionTitle">ЧАСТОТА КАДРОВ</div><div class="settingRow"><div class="seg fps" id="fpsSeg">${FPS.map(f => `<button data-f="${f}" class="${settings.fps === f ? 'active' : ''}">${f}</button>`).join('')}</div></div>
      <div class="sectionTitle">МОНИТОР ПРОИЗВОДИТЕЛЬНОСТИ</div><button class="btn" id="perfBtn">${perfMonitorEnabled ? 'Выключить frame-time monitor' : 'Включить frame-time monitor'}</button>${devicePanel()}<div class="sectionTitle">СОХРАНЕНИЕ</div>${saveStatusText() ? `<p class="saveWarningText">${escapeHTML(saveStatusText())}</p>` : ''}<button class="btn" id="saveBtn">Сохранить прогресс</button>`);
    document.querySelectorAll('#qualitySeg button').forEach(b => bindTap(b, () => { settings.quality = b.dataset.q; persistSetting('quality', settings.quality); applyGraphics(); save(); openMenu(); }));
    document.querySelectorAll('#fpsSeg button').forEach(b => bindTap(b, () => { settings.fps = Number(b.dataset.f); persistSetting('fps', settings.fps); resetFrameLimiter(); save(); openMenu(); }));
    bindTap($('control-right'), () => setControls('right')); bindTap($('control-left'), () => setControls('left'));
    for (const size of ['compact','normal','large']) bindTap($('controlSize-' + size), () => setUiSetting('controlSize', size));
    for (const b of [85,100,115]) bindTap($('bright-' + b), () => setUiSetting('brightness', b));
    bindTap($('ui-normal'), () => setUiSetting('uiScale', 'normal')); bindTap($('ui-large'), () => setUiSetting('uiScale', 'large'));
    bindTap($('map-normal'), () => setUiSetting('minimapSize', 'normal')); bindTap($('map-large'), () => setUiSetting('minimapSize', 'large'));
    bindTap($('numbersToggle'), () => setUiSetting('combatNumbers', !settings.combatNumbers));
    if (hapticsAvailable) bindTap($('hapticsToggle'), () => setUiSetting('haptics', !settings.haptics));
    bindTap($('musicToggle'), () => { audio.unlock(); setUiSetting('musicEnabled', !settings.musicEnabled); });
    bindTap($('audioTestBtn'), async () => {
      const ok = await audio.unlock();
      syncAudioSettings();
      if (ok) { audio.sfx('test'); setText($('audioStatus'), 'Аудио: активно'); toast('Тестовый звук воспроизведён'); }
      else { setText($('audioStatus'), audioStatusText()); toast('Браузер не разблокировал аудио. Коснитесь кнопки ещё раз.'); }
    });
    for (const [id,key] of [['masterVolume','masterVolume'],['musicVolume','musicVolume'],['ambientVolume','ambientVolume'],['sfxVolume','sfxVolume']]) {
      const input = $(id); if (!input) continue;
      input.addEventListener('input', () => { const value = Math.round(Number(input.value) || 0); setText($(id + 'Value'), value + '%'); setVolume(key, value); }, { passive: true });
      input.addEventListener('change', () => save(), { passive: true });
    }
    bindTap($('saveBtn'), () => toast(save() ? 'Прогресс сохранён' : saveStatusText() || 'Не удалось сохранить: хранилище недоступно'));
    bindTap($('perfBtn'), () => { perfMonitorEnabled = !perfMonitorEnabled; storage.setItem('aef_perf_monitor', perfMonitorEnabled ? '1' : '0'); refreshPerformanceMonitorVisibility(); openMenu(); });
    bindTap($('economyBtn'), () => applyPreset('low', 30)); bindTap($('balancedBtn'), () => applyPreset('medium', 60));
  }
  let audioGestureUnlocked = false;
  const AUDIO_UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  const unlockAudio = () => {
    if (audioGestureUnlocked) return;
    Promise.resolve(audio.unlock()).then(ok => {
      if (!ok) return;
      audioGestureUnlocked = true;
      syncAudioSettings();
      for (const type of AUDIO_UNLOCK_EVENTS) document.removeEventListener(type, unlockAudio, true);
    });
  };
  // Capture phase is intentional: gameplay buttons stop propagation in bindTap().
  // Without capture, the global audio unlock never saw the user's tap.
  for (const type of AUDIO_UNLOCK_EVENTS) document.addEventListener(type, unlockAudio, { passive: true, capture: true });
  function bindTap(el, fn) {
    if (!el) return;
    const action = el.classList.contains('action');
    if (!action) {
      el.addEventListener('click', event => {
        if (el.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        fn(event);
      }, { passive: false });
      return;
    }
    let tapPointer = null;
    const clearTapPointer = (event = null, force = false) => {
      if (!force && event && event.pointerId !== tapPointer) return;
      tapPointer = null;
      el.classList.remove('pressed');
    };
    const resetTapPointer = () => clearTapPointer(null, true);
    actionPointerResets.add(resetTapPointer);
    el.addEventListener('pointerdown', event => {
      if (el.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      if (tapPointer !== null) return;
      tapPointer = event.pointerId;
      el.classList.add('pressed');
      capture(el, event.pointerId);
      fn(event);
    }, { passive: false });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, clearTapPointer, { passive: false });
    window.addEventListener('pointerup', clearTapPointer, { passive: true });
    window.addEventListener('pointercancel', clearTapPointer, { passive: true });
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
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        if (isPaused() || player.stamina <= 0 || blockPointer !== null) return;
        blockPointer = e.pointerId;
        player.blocking = true;
        btn.classList.add('pressed');
        capture(btn, e.pointerId);
      }, {
        passive: false
      });
      const release = e => {
        if (e.pointerId !== blockPointer) return;
        blockPointer = null;
        player.blocking = false;
        btn.classList.remove('pressed');
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
      if (a === 'supply') useSupply();else if (a === 'attack') attack();else if (a === 'dodge') dodge();else if (a === 'skill1') skill(1);else if (a === 'skill2') skill(2);else if (a === 'skill3') skill(3);else if (a === 'use') interact();
    });
  });
  bindTap($('inventoryBtn'), openInventory);
  function toggleQuest() {
    const panel = $('questTracker'),
      collapsed = panel.classList.toggle('collapsed');
    settings.questCollapsed = collapsed;
    storage.setItem('aef_quest_collapsed', collapsed ? '1' : '0');
    $('questToggle').setAttribute('aria-expanded', String(!collapsed));
    setText($('questChevron'), collapsed ? '›' : '‹');
    save();
  }
  bindTap($('questToggle'), toggleQuest);
  bindTap($('menuBtn'), openMenu);
  bindTap($('questsBtn'), openQuests);
  bindTap($('shopBtn'), openShop);
  bindTap($('modalClose'), closeModal);
  bindTap($('savePill'), () => {
    if (saveBlockedReason === 'conflict') location.reload();
    else toast(save() ? 'Прогресс снова сохраняется' : saveStatusText());
  });
  // Pinch zoom remains available for accessibility in UI surfaces; double-tap zoom is suppressed to avoid sticky mobile browser zoom.
  function updateEnemyPatrol(dt) {
    for (const e of entities) {
      if (e.kind !== 'enemy' || e.hp <= 0) continue;
      if (!Number.isFinite(e.patrolT)) e.patrolT = 0;
      if (!Number.isFinite(e.dir)) e.dir = e.seed * 6.283185;
      if (e.aiState === 'idle') {
        e.patrolT += dt;
        if (e.patrolT >= 1.1) {
          e.patrolT = 0;
          e.dir += (rng(Math.floor(time * 3) + Math.floor(e.x) + Math.floor(e.y)) - .5) * 0.9;
        }
        const speed = e.type === 'guardian' ? 12 : 18;
        if (Math.hypot(e.x - e.homeX, e.y - e.homeY) > 70) e.dir = Math.atan2(e.homeY - e.y, e.homeX - e.x);
        moveActor(e, Math.cos(e.dir) * speed * dt, Math.sin(e.dir) * speed * dt);
      }
    }
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return;
    updateImpactFeedback(dt);
    let live = 0;
    for (const e of entities) if (e.kind !== 'enemy' || e.hp > 0 || e._corpseUntil > time) entities[live++] = e;
    entities.length = live;
    time += dt;
    const combatTick = combatEngine.tick(combatStateSnapshot(), { dt, now: time, maxStamina: player.maxStamina, blocking: player.blocking, tuning: buildProfile.combat });
    applyCombatState(combatTick.state);
    if (combatTick.exhausted) cancelBlock();
    for (const effect of combatTick.effects) if (effect.type === 'executeBufferedAttack') beginPlayerAttack();
    const moving = Math.hypot(joy.x, joy.y) > .06;
    const dodgeUntil = Number.isFinite(player.dodgeUntil) ? player.dodgeUntil : 0;
    player.dodgeUntil = dodgeUntil;
    const speed = player.speed * (player.blocking ? .58 : 1) * (player.dodgeUntil > time ? .9 : 1);
    const dashStep = Math.min(dt, Math.max(0, player.dashRemaining || 0), Math.max(0, dodgeUntil - (time - dt)));
    if (dashStep > 0) {
      moveActor(player, player.dashX * (COMBAT_RULES.dashDistance / COMBAT_RULES.dashDuration) * dashStep, player.dashY * (COMBAT_RULES.dashDistance / COMBAT_RULES.dashDuration) * dashStep);
      player.dashRemaining = Math.max(0, player.dashRemaining - dashStep);
    }
    const walkStep = dt - dashStep;
    if (moving && time >= dodgeUntil && walkStep > 0) {
      moveActor(player, joy.x * speed * walkStep, joy.y * speed * walkStep);
      player.dir = Math.atan2(joy.y, joy.x);
    }
    updateEnemies(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    checkDiscoveries();
    flushImpactFeedback();
  }
  function enemyDetectionRange(e) {
    return e?.type === 'marksman' ? 420 : 220;
  }
  function enemyActivationHomeRange(e) {
    return e?.type === 'marksman' ? 420 : 300;
  }
  function enemyDisengageDistance(e) {
    if (e?.type === 'marksman') return 520;
    if (e?.type === 'guardian') return 480;
    return 440;
  }
  function marksmanDistanceIntent(distance, phase = '') {
    if (!Number.isFinite(distance)) return 'approach';
    if (distance < 210) return 'retreat';
    if (distance < 280) return phase === 'recovery' ? 'retreat' : 'near';
    if (distance <= 360) return 'hold';
    if (distance <= 460) return phase === 'recovery' ? 'approach' : 'far';
    return 'approach';
  }
  const GUARDIAN_SEQUENCES = Object.freeze({
    1: Object.freeze(['slam', 'bolt', 'wave']),
    2: Object.freeze(['bolt', 'slam', 'wave', 'slam'])
  });
  const GUARDIAN_PROFILES = Object.freeze({
    slam: Object.freeze({ attack: 'slam', damage: 26, windup: .75, recovery1: .85, recovery2: .68, startRange: 125 }),
    bolt: Object.freeze({ attack: 'bolt', damage: 24, windup: .70, recovery1: .90, recovery2: .72, startRange: 460 }),
    wave: Object.freeze({ attack: 'wave', damage: 22, windup: .95, recovery1: 1.00, recovery2: .80, startRange: 300 })
  });
  function guardianSequence(phase = 1) {
    return GUARDIAN_SEQUENCES[phase === 2 ? 2 : 1];
  }
  function guardianPhaseForHp(hp, maxHp) {
    const max = Number(maxHp);
    if (!Number.isFinite(max) || max <= 0) return 1;
    return Number(hp) < max * .5 ? 2 : 1;
  }
  function guardianAttackProfile(attack, phase = 1) {
    const base = GUARDIAN_PROFILES[attack] || GUARDIAN_PROFILES.slam;
    return { attack: base.attack, damage: base.damage, windup: base.windup, recovery: phase === 2 ? base.recovery2 : base.recovery1, startRange: base.startRange };
  }
  function guardianNextAttack(e) {
    const seq = guardianSequence(e?.bossPhase);
    const step = Math.max(0, Math.floor(Number(e?.bossSequenceStep) || 0));
    return seq[step % seq.length];
  }
  function guardianAttackEligible(e, attack, distance, hasLos) {
    if (!e || e.type !== 'guardian' || !hasLos) return false;
    const profile = guardianAttackProfile(attack, e.bossPhase);
    return Number.isFinite(distance) && distance <= profile.startRange;
  }
  function guardianAttackDamage(e, baseDamage) {
    return scaledEnemyDamage(baseDamage, e?.level ?? player.level);
  }
  function resetGuardianAttack(e) {
    e.attackPhase = '';
    e.attackStartedAt = 0;
    e.attackImpactAt = 0;
    e.attackWindup = 0;
    e.attackRecovery = 0;
    e.bossAttack = '';
    e.cd = 0;
  }
  function settleGuardianPhasePending(e) {
    if (!e.bossPhasePending) return;
    e.bossSequenceStep = 0;
    e.bossPhasePending = false;
  }
  function triggerGuardianPhase(e) {
    if (!e || e.type !== 'guardian' || e.hp <= 0 || e.bossPhase === 2 || guardianPhaseForHp(e.hp, e.maxHp) !== 2) return false;
    e.bossPhase = 2;
    e.bossPhaseTransitioned = true;
    e.bossPhaseTransitionSerial = (Number(e.bossPhaseTransitionSerial) || 0) + 1;
    e.bossPhaseFlashUntil = time + .55;
    if (e.attackPhase) e.bossPhasePending = true;
    else { e.bossSequenceStep = 0; e.bossPhasePending = false; }
    return true;
  }
  function resetGuardianEncounter(e) {
    if (!e || e.type !== 'guardian') return;
    e.hp = e.maxHp;
    e.bossPhase = 1;
    e.bossSequenceStep = 0;
    e.bossPhasePending = false;
    e.bossPhaseTransitioned = false;
    e.bossPhaseTransitionSerial = 0;
    e.bossPhaseFlashUntil = 0;
    e.attackBossPhase = 1;
    resetGuardianAttack(e);
  }
  function startGuardianAttack(e, attack) {
    const phase = e.bossPhase === 2 ? 2 : 1;
    const profile = guardianAttackProfile(attack, phase);
    e.bossAttack = attack;
    e.attackBossPhase = phase;
    e.attackWindup = profile.windup;
    e.attackRecovery = profile.recovery;
    e.attackPhase = 'windup';
    e.attackStartedAt = time;
    e.attackImpactAt = time + profile.windup;
    animate(e, 'attack', profile.windup + .12);
  }
  function advanceGuardianSequence(e) {
    if (e.bossPhasePending || e.bossPhase !== e.attackBossPhase) return;
    const seq = guardianSequence(e.attackBossPhase);
    e.bossSequenceStep = (Math.max(0, Math.floor(Number(e.bossSequenceStep) || 0)) + 1) % seq.length;
  }
  function finishGuardianRecovery(e) {
    e.attackPhase = '';
    e.cd = 0;
    e.bossAttack = '';
    e.attackStartedAt = 0;
    e.attackImpactAt = 0;
    e.attackWindup = 0;
    e.attackRecovery = 0;
    settleGuardianPhasePending(e);
  }
  function enemyAttackTiming(e) {
    if (e.type === 'marksman') return { windup: .55, recovery: 1.15 };
    if (e.type === 'guardian') {
      if (e.attackPhase && Number.isFinite(e.attackWindup) && Number.isFinite(e.attackRecovery)) return { windup: e.attackWindup, recovery: e.attackRecovery };
      const profile = guardianAttackProfile(guardianNextAttack(e), e.bossPhase);
      return { windup: profile.windup, recovery: profile.recovery };
    }
    const windup = e.type === 'boar' ? .30 : .35;
    return { windup, recovery: Math.max(.35, 1.35 - windup) };
  }
  function enemyAttackRange(e, playerRadius) {
    const enemyRadius = Number.isFinite(e?.r) ? Math.max(0, e.r) : 0;
    const targetRadius = Number.isFinite(playerRadius) ? Math.max(0, playerRadius) : 0;
    return enemyRadius + targetRadius + 8;
  }
  function phaseProgress(elapsed, duration) {
    if (!Number.isFinite(elapsed) || !Number.isFinite(duration) || duration <= 0) return 0;
    if (elapsed <= 0) return 0;
    const epsilon = Number.EPSILON * Math.max(1, Math.abs(duration)) * 8;
    if (elapsed >= duration - epsilon) return 1;
    return elapsed / duration;
  }
  function enemyRecoveryProgress(e) {
    const timing = enemyAttackTiming(e);
    const cd = Number(e?.cd);
    if (!Number.isFinite(cd) || !Number.isFinite(timing.recovery) || timing.recovery <= 0) return 0;
    if (cd <= 0) return 1;
    if (cd >= timing.recovery) return 0;
    return clamp(1 - cd / timing.recovery, 0, 1);
  }
  function enemyAttackPresentation(e, now, playerRadius) {
    if (!e) return { phase: 'none' };
    if (e.attackPhase === 'windup') return {
      phase: 'windup',
      dangerRadius: enemyAttackRange(e, playerRadius),
      progress: phaseProgress(Number(now) - Number(e.attackStartedAt), Number(e.attackWindup))
    };
    if (e.attackPhase === 'recovery') return { phase: 'recovery', progress: enemyRecoveryProgress(e) };
    return { phase: 'none' };
  }
  function moveMarksman(e, intent, dt) {
    if (intent === 'hold') return;
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    if (intent === 'retreat') {
      const speed = Number.isFinite(e.retreatSpeed) ? e.retreatSpeed : 88;
      moveActor(e, -Math.cos(a) * speed * dt, -Math.sin(a) * speed * dt);
      return;
    }
    if (physics) physics.chase(e, player, e.speed * dt, time);
    else moveActor(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
  }
  function releaseMarksmanBolt(e) {
    const dx = player.x - e.x, dy = player.y - e.y, len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len <= 0) return false;
    const nx = dx / len, ny = dy / len;
    projectiles.push({
      owner: 'enemy',
      x: e.x + nx * (e.r + 8),
      y: e.y + ny * (e.r + 8),
      vx: nx * 280,
      vy: ny * 280,
      damage: e.damage,
      life: 2,
      r: 5,
      collisionPad: 7,
      color: '#e5b86a'
    });
    return true;
  }
  function applyIncomingCombatImpact({ damage, sourceX, sourceY }) {
    const impact = combatEngine.resolveIncomingDamage({ damage, blocking: player.blocking, dodging: time < player.dodgeUntil, tuning: buildProfile.combat });
    if (!impact.valid) return impact;
    if (impact.avoided) {
      burst(player.x, player.y, '#91c6cc', 5, 105);
      queueImpactFeedback('evade', sourceX, sourceY, player.x, player.y);
      return impact;
    }
    const dmg = impact.damage;
    player.hp = Math.max(0, player.hp - dmg);
    animate(player, impact.blocked ? 'block' : 'hit', .24);
    addFloatingText('−' + dmg, player.x, player.y - 52, '#ff9690');
    burst(player.x, player.y, impact.blocked ? '#e8d08a' : '#e06d68', 7, 80);
    queueImpactFeedback(impact.blocked ? 'block' : 'playerHit', sourceX, sourceY, player.x, player.y);
    if (player.hp <= 0) {
      animate(player, 'death', .75);
      flushImpactFeedback();
      player.hp = player.maxHp;
      player.x = zones[zoneId].camp.x;
      player.y = zones[zoneId].camp.y;
      player.attackQueuedUntil = 0;
      player.dashRemaining = 0;
      player.dodgeUntil = 0;
      cancelBlock();
      physics?.relocate(player);
      save();
      toast('Вы возвращены к лагерю');
      resetImpactFeedback();
    }
    return impact;
  }
  function resolveGuardianSlam(e) {
    if (!e || e.hp <= 0 || e.aiState !== 'chase') return false;
    if (dist(player, e) > 115) return false;
    const impact = applyIncomingCombatImpact({ damage: guardianAttackDamage(e, 26), sourceX: e.x, sourceY: e.y });
    return !!impact?.valid && !impact.avoided;
  }
  function resolveGuardianWave(e) {
    if (!e || e.hp <= 0 || e.aiState !== 'chase') return false;
    const d = dist(player, e);
    if (d < 140 || d > 260) return false;
    const impact = applyIncomingCombatImpact({ damage: guardianAttackDamage(e, 22), sourceX: e.x, sourceY: e.y });
    return !!impact?.valid && !impact.avoided;
  }
  function releaseGuardianBolt(e) {
    const dx = player.x - e.x, dy = player.y - e.y, len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len <= 0) return false;
    const nx = dx / len, ny = dy / len;
    projectiles.push({
      owner: 'enemy',
      style: 'guardianBolt',
      x: e.x + nx * (e.r + 12),
      y: e.y + ny * (e.r + 12),
      vx: nx * 220,
      vy: ny * 220,
      damage: guardianAttackDamage(e, 24),
      life: 2.4,
      r: 9,
      collisionPad: 11,
      color: '#c99be8'
    });
    return true;
  }
  function resolveEnemyImpact(e) {
    const range = enemyAttackRange(e, player.r);
    if (e.hp <= 0 || e.aiState !== 'chase' || dist(player, e) > range || physics && !physics.clearLine(e.x, e.y, player.x, player.y, 2)) return false;
    const impact = applyIncomingCombatImpact({ damage: e.damage, sourceX: e.x, sourceY: e.y });
    return !!impact?.valid && !impact.avoided;
  }
  function updateEnemies(dt) {
    for (const e of entities) {
      if (e.hp <= 0 || e.kind !== 'enemy') continue;
      e.cd = Math.max(0, e.cd - dt);
      e.hit = Math.max(0, e.hit - dt);
      const d = dist(player, e);
      if (!Number.isFinite(e.homeX)) {
        e.homeX = e.x;
        e.homeY = e.y;
        e.home = { x: e.x, y: e.y };
        e.aiState = 'idle';
      }
      const homeDistance = Math.hypot(e.x - e.homeX, e.y - e.homeY);
      const playerFromHome = Math.hypot(player.x - e.homeX, player.y - e.homeY);
      if (e.aiState === 'chase' && (d > enemyDisengageDistance(e) || homeDistance > 420 || playerFromHome > 480)) {
        e.aiState = 'return';
        if (e.type === 'guardian') {
          resetGuardianAttack(e);
          settleGuardianPhasePending(e);
        } else e.attackPhase = '';
      }
      if (e.aiState === 'return') {
        if (e.type === 'guardian') {
          resetGuardianAttack(e);
          const canReaggro = d < enemyDetectionRange(e) && playerFromHome < enemyActivationHomeRange(e) && (!physics || physics.clearLine(e.x, e.y, player.x, player.y, 2));
          if (canReaggro && homeDistance > 8) e.aiState = 'chase';
          else if (homeDistance > 8) {
            if (physics) physics.chase(e, e.home, e.speed * dt, time);
            else moveActor(e, (e.homeX - e.x) / homeDistance * e.speed * dt, (e.homeY - e.y) / homeDistance * e.speed * dt);
            continue;
          } else {
            resetGuardianEncounter(e);
            e.aiState = 'idle';
            continue;
          }
        } else {
          e.attackPhase = '';
          if (homeDistance > 8) {
            if (physics) physics.chase(e, e.home, e.speed * dt, time);else moveActor(e, (e.homeX - e.x) / homeDistance * e.speed * dt, (e.homeY - e.y) / homeDistance * e.speed * dt);
          } else e.aiState = 'idle';
          continue;
        }
      }
      if (e.aiState === 'idle' && e.hp === e.maxHp && e.level !== clamp(Math.floor(Number(player.level) || 1), 1, 100)) scaleEnemy(e);
      if (e.aiState === 'idle' && d < enemyDetectionRange(e) && playerFromHome < enemyActivationHomeRange(e) && (!physics || physics.clearLine(e.x, e.y, player.x, player.y, 2))) e.aiState = 'chase';
      if (e.aiState !== 'chase') continue;

      if (e.type === 'guardian') {
        triggerGuardianPhase(e);
        const currentDistance = dist(player, e);
        const hasLos = !physics || physics.clearLine(e.x, e.y, player.x, player.y, 2);
        if (e.attackPhase === 'windup') {
          if (e.bossAttack === 'bolt' && (!hasLos || currentDistance > 460)) {
            resetGuardianAttack(e);
            settleGuardianPhasePending(e);
            continue;
          }
          if (time >= e.attackImpactAt) {
            let resolved = true;
            if (e.bossAttack === 'slam') resolveGuardianSlam(e);
            else if (e.bossAttack === 'wave') resolveGuardianWave(e);
            else if (e.bossAttack === 'bolt') resolved = releaseGuardianBolt(e);
            if (!resolved) {
              resetGuardianAttack(e);
              settleGuardianPhasePending(e);
              continue;
            }
            advanceGuardianSequence(e);
            e.attackPhase = 'recovery';
            e.cd = e.attackRecovery;
          }
          continue;
        }
        if (e.attackPhase === 'recovery') {
          if (e.cd <= 0) finishGuardianRecovery(e);
          else {
            const a = Math.atan2(player.y - e.y, player.x - e.x);
            if (physics) physics.chase(e, player, e.speed * dt, time);
            else moveActor(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
            continue;
          }
        }
        const attack = guardianNextAttack(e);
        if (guardianAttackEligible(e, attack, currentDistance, hasLos) && e.cd <= 0) {
          startGuardianAttack(e, attack);
        } else {
          const a = Math.atan2(player.y - e.y, player.x - e.x);
          if (physics) physics.chase(e, player, e.speed * dt, time);
          else moveActor(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
        }
        continue;
      }

      if (e.type === 'marksman') {
        const currentDistance = dist(player, e);
        const hasLos = !physics || physics.clearLine(e.x, e.y, player.x, player.y, 2);
        if (e.attackPhase === 'windup') {
          if (!hasLos || currentDistance > 460) {
            e.attackPhase = '';
            e.attackStartedAt = 0;
            e.attackImpactAt = 0;
            e.attackWindup = 0;
          } else if (time >= e.attackImpactAt) {
            releaseMarksmanBolt(e);
            const timing = enemyAttackTiming(e);
            e.attackPhase = 'recovery';
            e.cd = timing.recovery;
          }
          continue;
        }
        if (e.attackPhase === 'recovery') {
          if (e.cd <= 0) e.attackPhase = '';
          else {
            moveMarksman(e, marksmanDistanceIntent(currentDistance, 'recovery'), dt);
            continue;
          }
        }
        if (!hasLos) {
          moveMarksman(e, 'approach', dt);
          continue;
        }
        const intent = marksmanDistanceIntent(currentDistance, '');
        if (intent === 'retreat' || intent === 'approach') {
          moveMarksman(e, intent, dt);
          continue;
        }
        if (e.cd <= 0 && currentDistance >= 210 && currentDistance <= 460) {
          const timing = enemyAttackTiming(e);
          e.attackPhase = 'windup';
          e.attackStartedAt = time;
          e.attackImpactAt = time + timing.windup;
          e.attackWindup = timing.windup;
          animate(e, 'attack', timing.windup + .12);
        }
        continue;
      }

      if (e.attackPhase === 'windup') {
        if (time >= e.attackImpactAt) {
          resolveEnemyImpact(e);
          const timing = enemyAttackTiming(e);
          e.attackPhase = 'recovery';
          e.cd = timing.recovery;
        }
        continue;
      }
      if (e.attackPhase === 'recovery' && e.cd <= 0) e.attackPhase = '';
      const currentDistance = dist(player, e),
        a = Math.atan2(player.y - e.y, player.x - e.x),
        range = enemyAttackRange(e, player.r);
      if (currentDistance > range) {
        if (physics) physics.chase(e, player, e.speed * dt, time);else moveActor(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
      } else if (!e.attackPhase && e.cd <= 0 && (!physics || physics.clearLine(e.x, e.y, player.x, player.y, 2))) {
        const timing = enemyAttackTiming(e);
        e.attackPhase = 'windup';
        e.attackStartedAt = time;
        e.attackImpactAt = time + timing.windup;
        e.attackWindup = timing.windup;
        animate(e, 'attack', timing.windup + .12);
      }
    }
    updateEnemyPatrol(dt);
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (physics && !physics.clearLine(p.x, p.y, p.x + p.vx * dt, p.y + p.vy * dt, 3)) {
        projectiles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      let hit = false;
      if (p.owner === 'enemy') {
        const collisionPad = Number.isFinite(p.collisionPad) ? p.collisionPad : 7;
        if (dist(p, player) < player.r + collisionPad) {
          applyIncomingCombatImpact({ damage: p.damage, sourceX: p.x, sourceY: p.y });
          hit = true;
        }
      } else {
        for (const e of entities) {
          if (e.hp > 0 && e.kind === 'enemy' && dist(p, e) < e.r + 7) {
            hitTarget(e, p.damage);
            hit = true;
            break;
          }
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
  function updateActionState(button, view) {
    if (!button || !view) return;
    const state = view.interaction !== 'idle' ? view.interaction : view.availability,
      progress = String(clamp01(view.progress));
    if (button.dataset.state !== state) button.dataset.state = state;
    if (button.style.getPropertyValue('--action-progress') !== progress) button.style.setProperty('--action-progress', progress);
    if (button.disabled !== view.disabled) button.disabled = view.disabled;
    if (button.title !== view.title) button.title = view.title;
    if (button.getAttribute('aria-label') !== view.ariaLabel) button.setAttribute('aria-label', view.ariaLabel);
  }
  function updateUI() {
    setWidth(ui.hp, player.hp / player.maxHp * 100 + '%');
    const guardian = entities.find(e => e.kind === 'enemy' && e.type === 'guardian' && e.hp > 0 && e.aiState === 'chase');
    const bossActive = !!guardian;
    ui.bossHud?.classList.toggle('hidden', !bossActive);
    if (bossActive) {
      setText(ui.bossName, 'Guardian');
      setText(ui.bossPhase, guardian.bossPhase === 2 ? 'II' : 'I');
      setText(ui.bossHpText, `${Math.ceil(guardian.hp)} / ${Math.ceil(guardian.maxHp)}`);
      setWidth(ui.bossHpFill, clamp(guardian.hp / guardian.maxHp * 100, 0, 100) + '%');
      ui.bossHud?.classList.toggle('phase2', guardian.bossPhase === 2);
    }
    setWidth(ui.stamina, player.stamina / player.maxStamina * 100 + '%');
    setWidth(ui.xp, player.xp / player.xpNeed * 100 + '%');
    setText(ui.level, 'Ур. ' + player.level);
    const z = zones[zoneId];
    setText(ui.zone, z.name);
    const objective = currentObjective();
    setText(ui.objective, objective);
    setText(ui.questTitle, quest().title);
    setText(ui.questProgress, objective);
    setText(ui.badge, z.badge);
    setText(ui.herb, player.inv.herb);
    setText(ui.wood, player.inv.wood);
    setText(ui.ore, player.inv.ore);
    setText(ui.gold, player.gold);
    const supplyId = player.loadout.quick;
    const supplyLeft = Math.max(0, player.supplyCd - time);
    const supplyName = supplyId === 'tonic' ? 'ТОНИК' : supplyId === 'fieldKit' ? 'ЭЛИКСИР' : supplyId ? 'ЗЕЛЬЕ' : 'ПУСТО';
    setText(ui.supplyLabel, supplyName + ' · ' + (supplyLeft > 0 ? `${supplyLeft.toFixed(1)}с` : player.supplies[supplyId] || 0));
    const supplyEmpty = !player.supplies[supplyId], supplyDisabled = supplyEmpty || supplyLeft > 0;
    if (ui.supplyBtn.disabled !== supplyDisabled) ui.supplyBtn.disabled = supplyDisabled;
    ui.supplyBtn.title = supplyLeft > 0 ? `Расходник: ${supplyLeft.toFixed(1)} с` : supplyEmpty ? 'Нет выбранного расходника' : 'Использовать быстрый расходник';
    ui.supplyBtn.setAttribute('aria-label', ui.supplyBtn.title);
    const actionState = {
      attackCd: player.attackCd,
      attackQueuedUntil: player.attackQueuedUntil,
      stamina: player.stamina,
      hp: player.hp,
      maxHp: player.maxHp,
      dodgeCd: player.dodgeCd,
      secondWindCd: player.secondWindCd
    };
    updateActionState(ui.attackBtn, getActionPresentation('attack', actionState, time, ui.attackBtn?.classList.contains('pressed')));
    updateActionState(ui.skill1Btn, getActionPresentation('skill1', actionState, time, ui.skill1Btn?.classList.contains('pressed')));
    updateActionState(ui.skill2Btn, getActionPresentation('skill2', actionState, time, ui.skill2Btn?.classList.contains('pressed')));
    const secondWindLeft = Math.max(0, player.secondWindCd - time);
    if (ui.skill3Meta) setText(ui.skill3Meta, secondWindLeft > 0 ? `${Math.ceil(secondWindLeft)}с` : `${buildProfile.combat.skillStaminaCost} EN`);
    updateActionState(ui.skill3Btn, getActionPresentation('skill3', actionState, time, ui.skill3Btn?.classList.contains('pressed')));
    const dodgeLeft = Math.max(0, player.dodgeCd - time);
    if (ui.dodgeMeta) setText(ui.dodgeMeta, dodgeLeft > 0 ? `${dodgeLeft.toFixed(1)}с` : `${buildProfile.combat.dodgeStaminaCost} EN`);
    updateActionState(ui.dodgeBtn, getActionPresentation('dodge', actionState, time, ui.dodgeBtn?.classList.contains('pressed')));
    refreshSaveHealth();
    const hit = nearbyInteraction();
    ui.actionUse.classList.toggle('available', !!hit);
    setText(ui.actionLabel, hit ? {
      portal: 'ПЕРЕЙТИ',
      portalLocked: 'ЗАКРЫТО',
      scout: 'ГОВОРИТЬ',
      camp: 'ЛАГЕРЬ',
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
  function groundShadow(x, y, width) {
    ctx.save();
    if (profile.softShadows) {
      const sway = Math.sin(time * .09) * .7;
      ctx.fillStyle = shadowColor(.12);
      ctx.beginPath();
      ctx.ellipse(x + 4 + sway, y + 3, width * 1.18, width * .36, -.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shadowColor(.19);
      ctx.beginPath();
      ctx.ellipse(x + 2 + sway * .5, y + 1.5, width * 1.05, width * .31, -.04, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = shadowColor(.3);
    ctx.beginPath();
    ctx.ellipse(x, y, width, width * .28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function screenPos(x, y) {
    return {
      x: x - player.x + W / 2 + cameraImpactX,
      y: isoY(y - player.y) + H / 2 + cameraImpactY
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
    ctx.translate(W / 2 - player.x + cameraImpactX, H / 2 - player.y * .82 + cameraImpactY);
    const basePattern = zoneId === 'mistwood' ? patterns.grass : zoneId === 'stonevale' ? patterns.stone : patterns.dirt;
    texturedRect(basePattern, z.ground, -160, -160, WORLD.w + 320, WORLD.h * .82 + 320, .42 + profile.textureScale * .3);
    ctx.globalAlpha = .2 + profile.detail * .06;
    const fallbackSpots = Math.min(groundSpots.length, 24 + profile.detail * 10);
    for (let i = 0; !art?.terrainReady && i < fallbackSpots; i++) {
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
    if (art?.has('pine')) {
      const p = screenPos(a.x, a.y),
        tree = zoneId === 'mistwood';
      const name = tree ? a.kind < .5 ? 'pine' : 'oak' : zoneId === 'stonevale' ? 'rock' : a.kind < .3 ? 'ruins' : 'rock';
      ctx.save();
      if (tree && Math.abs(a.x - player.x) < 85 && a.y > player.y && a.y - player.y < 190) ctx.globalAlpha = .3;
      groundShadow(p.x, p.y + 12, (tree ? 30 : 24) * a.scale);
      ctx.translate(p.x, p.y + 16);
      if (tree) ctx.rotate(Math.sin(time * 1.2 + a.x * .01) * .012);
      art.draw(ctx, name, 0, 0, (tree ? 118 : 50) * a.scale);
      ctx.restore();
      return;
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
  function drawCampBoard(z) {
    const p = screenPos(z.camp.x + 72, z.camp.y - 26);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, .82);
    ctx.strokeStyle = '#6b4b31'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-24, 18); ctx.lineTo(-24, -34); ctx.moveTo(24, 18); ctx.lineTo(24, -34); ctx.stroke();
    ctx.fillStyle = '#6f5238'; ctx.fillRect(-37, -48, 74, 38);
    ctx.strokeStyle = '#c8aa72'; ctx.lineWidth = 2; ctx.strokeRect(-37, -48, 74, 38);
    ctx.fillStyle = '#e9d79a'; ctx.fillRect(-20, -38, 27, 4); ctx.fillRect(-20, -28, 40, 3);
    ctx.restore();
  }
  function drawCamp(z) {
    if (art?.has('house')) {
      const p = screenPos(z.camp.x, z.camp.y - 100);
      groundShadow(p.x, p.y + 14, 55);
      art.draw(ctx, 'house', p.x, p.y + 20, 130);
      drawCampBoard(z);
      return;
    }
    const s = screenPos(z.camp.x, z.camp.y - 100);
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
    drawCampBoard(z);
  }
  function drawScout(z) {
    if (art?.has('scout')) {
      const p = screenPos(z.scout.x, z.scout.y);
      groundShadow(p.x, p.y + 14, 22);
      art.actor(ctx, 'scout', p.x, p.y + 17, 82, time, 0, dist(player, z.scout) < 130 ? 'gather' : 'idle', (Math.sin(time * 1.5) + 1) / 2);
      return;
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
    const open = canUsePortal();
    groundShadow(s.x, s.y + 17, 43);
    if (art?.has('portal')) {
      ctx.save();
      ctx.globalAlpha = open ? 1 : .58;
      art.draw(ctx, 'portal', s.x, s.y + 22, 140);
      ctx.restore();
      if (open && profile.detail >= 2) {
        ctx.save();
        ctx.fillStyle = zoneId === 'ashfield' ? '#ffd0ab' : '#d1ffee';
        ctx.globalAlpha = .25 + Math.sin(time * 2) * .15;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 68);
        ctx.lineTo(s.x + 5, s.y - 52);
        ctx.lineTo(s.x, s.y - 36);
        ctx.lineTo(s.x - 5, s.y - 52);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else {
      ctx.fillStyle = '#63756b';
      ctx.fillRect(s.x - 34, s.y - 75, 13, 92);
      ctx.fillRect(s.x + 21, s.y - 75, 13, 92);
      ctx.fillRect(s.x - 34, s.y - 83, 68, 13);
      ctx.fillStyle = open ? '#568b91' : '#233c3d';
      ctx.fillRect(s.x - 20, s.y - 70, 40, 86);
    }
  }
  function drawResource(e) {
    if (art?.has(e.type)) {
      const p = screenPos(e.x, e.y);
      groundShadow(p.x, p.y + 12, 17);
      art.draw(ctx, e.type, p.x, p.y + 16, e.type === 'herb' ? 36 : 40);
      return;
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
    const artType = e.type === 'marksman' ? 'raider' : e.type;
    if (art?.has(artType)) {
      const p = screenPos(e.x, e.y),
        height = e.type === 'guardian' ? 122 : e.type === 'boar' ? 54 : 80;
      groundShadow(p.x, p.y + 14, e.r * 1.15);
      ctx.save();
      ctx.globalAlpha = e.hp <= 0 ? clamp((e._corpseUntil - time) / .75, 0, 1) * .5 : e.hit > 0 ? .65 : 1;
      const bob = e.hp > 0 && dist(player, e) > e.r + player.r + 8 ? Math.sin(time * 7 + e.seed * 6) * 1.2 : 0;
      const motion = motions.get(e),
        progress = motion ? clamp((time - motion.start) / motion.duration, 0, 1) : 1;
      const death = e.hp <= 0 ? clamp(1 - (e._corpseUntil - time) / .75, 0, 1) : 0;
      art.actor(ctx, artType, p.x, p.y + 17 + bob, height, time + e.seed * 6, e.hp > 0 && dist(player, e) > e.r + player.r + 8 ? 1 : 0, progress < 1 ? motion.action : 'idle', progress, player.x < e.x, death);
      ctx.restore();
      if (e.type === 'marksman' && e.hp > 0) {
        ctx.save();
        ctx.strokeStyle = '#e5b86a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x + 17, p.y - 18, 9, -1.15, 1.15);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 13, p.y - 35);
        ctx.lineTo(p.x - 7, p.y - 8);
        ctx.stroke();
        ctx.restore();
      }
      if (e.type === 'guardian' && e.hp > 0 && e.bossPhase === 2) {
        ctx.save();
        ctx.globalAlpha = reduceMotion ? .62 : .52 + Math.sin(time * 4) * .08;
        ctx.strokeStyle = '#d5a6ef';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y + 4, e.r + 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (e.hp > 0 && !(e.type === 'guardian' && e.aiState === 'chase')) {
        const width = e.r * 2.1;
        ctx.fillStyle = '#111b19';
        ctx.fillRect(p.x - width / 2, p.y - height + 10, width, 5);
        ctx.fillStyle = e.type === 'guardian' ? '#d5b077' : e.type === 'marksman' ? '#d5aa68' : '#dc7772';
        ctx.fillRect(p.x - width / 2, p.y - height + 10, width * clamp(e.hp / e.maxHp, 0, 1), 5);
      }
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
    if (e.type === 'guardian' && e.hp > 0 && e.bossPhase === 2) {
      ctx.strokeStyle = '#d5a6ef';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 3, e.r + 11, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!(e.type === 'guardian' && e.aiState === 'chase')) {
      const hpw = e.r * 2.1;
      ctx.fillStyle = 'rgba(0,0,0,.48)';
      ctx.fillRect(-hpw / 2, -e.r - 15, hpw, 4);
      ctx.fillStyle = e.type === 'guardian' ? '#d8a1e8' : '#df6f73';
      ctx.fillRect(-hpw / 2, -e.r - 15, hpw * Math.max(0, e.hp / e.maxHp), 4);
    }
    ctx.restore();
  }
  function drawPlayer() {
    if (art?.has('hero')) {
      const p = screenPos(player.x, player.y),
        moving = Math.hypot(joy.x, joy.y) > .08;
      const motion = motions.get(player),
        progress = motion ? clamp((time - motion.start) / motion.duration, 0, 1) : 1;
      const action = progress < 1 ? motion.action : player.blocking ? 'block' : 'idle';
      if (action === 'death') {
        const fallen = screenPos(motion.x, motion.y);
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        art.actor(ctx, 'hero', fallen.x, fallen.y + 18, 88, time, 0, 'idle', 1, false, progress);
        ctx.restore();
      }
      const accent = COSMETICS.accents[player.cosmetics.accent] || COSMETICS.accents.teal;
      ctx.save(); ctx.globalAlpha = .20 + Math.sin(time * 2.2) * .04; ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y + 13, 27, 10, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      groundShadow(p.x, p.y + 15, 24);
      ctx.save();
      if (time < player.dodgeUntil) ctx.globalAlpha = .68;
      if (action === 'death') ctx.globalAlpha = progress;
      art.actor(ctx, Math.sin(player.dir) < -.3 ? 'heroBack' : 'hero', p.x, p.y + 18 + (moving ? Math.sin(time * 12) * 1.6 : 0), 88, time, moving ? 1 : 0, action, progress, Math.cos(player.dir) < 0);
      const lean = art.bodyLean(action, progress),
        facing = Math.cos(player.dir) < 0 ? -1 : 1;
      ctx.restore();
      const swing = action === 'attack' || action === 'cast' ? Math.sin(progress * Math.PI) * 1.8 * (player.combo % 2 ? -1 : 1) : 0;
      const hand = art.hand(action, progress, time, moving ? 1 : 0, false),
        left = art.hand(action, progress, time, moving ? 1 : 0, true);
      const bob = moving ? Math.sin(time * 12) * 1.6 : 0;
      const handX = p.x + facing * (hand.x * Math.cos(lean) - hand.y * Math.sin(lean)),
        handY = p.y + 18 + bob + hand.x * Math.sin(lean) + hand.y * Math.cos(lean);
      const leftX = p.x + facing * (left.x * Math.cos(lean) - left.y * Math.sin(lean)),
        leftY = p.y + 18 + bob + left.x * Math.sin(lean) + left.y * Math.cos(lean);
      if (action === 'drink') art.draw(ctx, 'potion', handX, handY, 23);else art.weapon(ctx, handX, handY, player.loadout.weapon === 'dawnBlade' ? 48 : 40, (action === 'attack' || action === 'cast' ? motion.dir ?? player.dir : facing > 0 ? .85 : Math.PI - .85) + (player.blocking && player.loadout.offhand !== 'buckler' ? -Math.PI / 2 : swing));
      if (player.loadout.offhand === 'buckler') art.shield(ctx, leftX, leftY, player.blocking ? 34 : 29, player.blocking ? player.dir : 0);
      return;
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
    ctx.restore();
  }
  function drawProjectiles() {
    for (const p of projectiles) {
      const s = screenPos(p.x, p.y);
      ctx.save();
      ctx.translate(s.x, s.y);
      if (p.owner === 'enemy') {
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.strokeStyle = p.color || '#e5b86a';
        ctx.lineWidth = p.style === 'guardianBolt' ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(p.style === 'guardianBolt' ? -18 : -10, 0);
        ctx.lineTo(p.style === 'guardianBolt' ? 10 : 8, 0);
        ctx.stroke();
      }
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = profile.detail >= 2 ? 6 : 0;
      ctx.beginPath();
      ctx.arc(0, 0, Number.isFinite(p.r) ? p.r : 5, 0, Math.PI * 2);
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
    ctx.translate(W / 2 - player.x + cameraImpactX, H / 2 - player.y * .82 + cameraImpactY);
    // Zone landmark cluster
    const lx = zoneId === 'mistwood' ? 1180 : zoneId === 'stonevale' ? 1220 : 1520;
    const ly = zoneId === 'mistwood' ? 420 : zoneId === 'stonevale' ? 520 : 900;
    ctx.save();
    ctx.translate(lx, ly * .82);
    ctx.scale(1, .82);
    ctx.fillStyle = shadowColor(.18);
    ctx.beginPath();
    ctx.ellipse(0, 30, 48, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    if (art?.has('house')) {
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
    if (zoneId === 'mistwood' && patterns.water && visible(1940, 620, 200)) {
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
      ctx.beginPath();
      ctx.ellipse((wx.x + ww.x) / 2, wx.y, 160, 44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(157,205,185,.3)';
      ctx.lineWidth = 3;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const phase = (time * .25 + i / 3) % 1;
        ctx.globalAlpha = (1 - phase) * .3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(1940 + (i - 1) * 70, wx.y + (i % 2 ? 12 : -9), 8 + phase * 25, 3 + phase * 7, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  function drawLoot() {
    for (const l of lootDrops) {
      if (!visible(l.x, l.y, 35)) continue;
      const asset = {
        guardianToken: 'armor',
        emberShard: 'ore'
      }[l.id] || l.id;
      if (art?.has(asset)) {
        const p = screenPos(l.x, l.y);
        art.draw(ctx, asset, p.x, p.y + 3 + Math.sin(time * 4 + l.x) * 2, 25);
        continue;
      }
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
    if (art?.has('house')) return;
    const z = zones[zoneId];
    const list = LANDMARKS[zoneId];
    for (const [x, y, k] of list) {
      const s = screenPos(x, y);
      if (s.x < -140 || s.x > W + 140 || s.y < -140 || s.y > H + 140) continue;
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
    ctx.save();
    const grad = atmosphereGradient || ctx.createLinearGradient(0, 0, 0, H);
    if (!atmosphereGradient) {
      grad.addColorStop(0, 'rgba(223,224,205,.06)'); grad.addColorStop(.38, 'rgba(20,28,23,0)'); grad.addColorStop(1, 'rgba(7,11,9,.16)'); atmosphereGradient = grad;
    }
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    if (profile.detail >= 2 && !reduceMotion) {
      const count = profile.detail >= 4 ? 26 : profile.detail >= 3 ? 18 : 10;
      for (let i = 0; i < count; i++) {
        const seed = rng(i * 37 + zoneId.length * 91), phase = time * (zoneId === 'ashfield' ? .34 : .12) + seed * 12;
        const x = (seed * W + Math.sin(phase + i) * 80 + W) % W;
        const y0 = rng(i * 71 + 29) * H;
        if (zoneId === 'mistwood') {
          const y = (y0 + Math.sin(phase * .7) * 18 + H) % H;
          ctx.globalAlpha = .12 + .14 * (Math.sin(phase * 2) * .5 + .5); ctx.fillStyle = '#c8f0b4'; ctx.beginPath(); ctx.arc(x, y, 1.2 + (i % 3) * .35, 0, Math.PI * 2); ctx.fill();
        } else if (zoneId === 'stonevale') {
          const y = (y0 + time * (4 + i % 3)) % H;
          ctx.globalAlpha = .09; ctx.strokeStyle = '#d8ccb0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y + 1.5); ctx.stroke();
        } else {
          const y = (y0 - time * (10 + i % 5) + H * 4) % H;
          ctx.globalAlpha = .18 + (i % 3) * .05; ctx.fillStyle = i % 2 ? '#ff9b63' : '#e26e4f'; ctx.fillRect(x, y, 1.5, 3 + i % 3);
        }
      }
    }
    ctx.globalAlpha = 1; ctx.restore();
  }
  function drawDiscoveryLabels() {
    const list = LANDMARKS[zoneId] || [];
    ctx.save(); ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
    for (let i = 0; i < list.length; i++) {
      const [x, y, , name] = list[i], id = `${zoneId}:${i}`;
      if (!player.discoveries.includes(id) || Math.hypot(player.x - x, player.y - y) > 280) continue;
      const p = screenPos(x, y - 75), w = ctx.measureText(name).width + 18;
      ctx.fillStyle = 'rgba(8,14,12,.72)'; ctx.fillRect(p.x - w / 2, p.y - 14, w, 20); ctx.fillStyle = '#e9d79a'; ctx.fillText(name, p.x, p.y + 1);
    }
    ctx.restore();
  }
  function lightHole(x, y, radius, intensity = 1) {
    if (!FX_CACHE.light || radius <= 0) return;
    const alpha = clamp(intensity, 0, 1),
      previousAlpha = lightCtx.globalAlpha;
    lightCtx.globalAlpha = previousAlpha * alpha;
    lightCtx.drawImage(FX_CACHE.light, x - radius, y - radius, radius * 2, radius * 2);
    lightCtx.globalAlpha = previousAlpha;
  }
  function drawLighting(z) {
    if (!(profile.lighting > 0) || !lightCtx || lightCanvas.width <= 1) return;
    const lightScale = clamp(profile.lightmapScale || .5, .25, 1);
    lightCtx.setTransform(1, 0, 0, 1, 0, 0);
    lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
    lightCtx.setTransform(lightScale, 0, 0, lightScale, 0, 0);
    lightCtx.globalCompositeOperation = 'source-over';
    const tint = zoneId === 'ashfield' ? '73,31,24' : zoneId === 'stonevale' ? '24,35,39' : '18,38,34';
    lightCtx.fillStyle = `rgba(${tint},${profile.lighting})`;
    lightCtx.fillRect(0, 0, W, H);
    lightCtx.globalCompositeOperation = 'destination-out';
    const hero = screenPos(player.x, player.y),
      camp = screenPos(campGlowPoint(z.camp).x, campGlowPoint(z.camp).y),
      portal = screenPos(z.portal.x, z.portal.y);
    lightHole(hero.x, hero.y - 18, 105, .48);
    lightHole(camp.x, camp.y, 138, .78);
    if (canUsePortal()) lightHole(portal.x, portal.y - 28, 155, .88);
    let projectileLights = 0;
    for (const p of projectiles) {
      if (projectileLights >= 8) break;
      const s = screenPos(p.x, p.y);
      if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) continue;
      lightHole(s.x, s.y, 54, .56);
      projectileLights++;
    }
    // Only a sparse deterministic subset of particles contributes to lighting;
    // this avoids the random lightmap flicker and fill-rate spike of the prototype.
    for (let i = 0, lit = 0; i < particles.length && lit < 8; i += 4) {
      const p = particles[i], s = screenPos(p.x, p.y);
      if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) continue;
      lightHole(s.x, s.y, 24 + p.size * 2, clamp(p.life / p.max, 0, 1) * .22);
      lit++;
    }
    lightCtx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(lightCanvas, 0, 0, lightCanvas.width, lightCanvas.height, 0, 0, W, H);
    ctx.restore();
  }
  function glowCircle(x, y, radius, sprite, alpha) {
    if (!sprite || radius <= 0 || alpha <= 0) return;
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = previousAlpha * clamp(alpha, 0, 1);
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = previousAlpha;
  }
  function drawBloom(z) {
    if (!(profile.bloom > 0)) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const portal = screenPos(z.portal.x, z.portal.y), camp = screenPos(campGlowPoint(z.camp).x, campGlowPoint(z.camp).y);
    if (canUsePortal()) glowCircle(portal.x, portal.y - 26, 95, zoneId === 'ashfield' ? FX_CACHE.glowPortalAsh : FX_CACHE.glowPortal, profile.bloom * .34);
    glowCircle(camp.x, camp.y, 50, FX_CACHE.glowCamp, profile.bloom * .28);
    let count = 0;
    for (const p of projectiles) {
      if (count++ >= 8) break;
      const s = screenPos(p.x, p.y);
      glowCircle(s.x, s.y, 30, FX_CACHE.glowProjectile, profile.bloom * .18);
    }
    // Cheap secondary halos for a small particle subset, no per-particle blur pass.
    ctx.globalAlpha = profile.bloom * .18;
    for (let i = 0, drawn = 0; i < particles.length && drawn < 10; i += 5) {
      const p = particles[i], s = screenPos(p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size * 2.8, 0, Math.PI * 2);
      ctx.fill();
      drawn++;
    }
    ctx.restore();
  }
  function drawCombatTelegraphs() {
    for (const e of entities) {
      if (e.kind !== 'enemy' || e.hp <= 0) continue;
      const s = screenPos(e.x, e.y), start = -Math.PI / 2;
      if (e.attackPhase === 'windup') {
        const progress = phaseProgress(time - Number(e.attackStartedAt), Number(e.attackWindup)),
          end = start + Math.PI * 2 * progress;
        if (e.type === 'guardian') {
          ctx.save();
          if (e.bossAttack === 'bolt') {
            const target = screenPos(player.x, player.y), sourceRadius = e.r + 7, timingRadius = e.r + 14;
            ctx.globalAlpha = .78;
            ctx.strokeStyle = 'rgba(201,155,232,.82)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(201,155,232,.92)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(s.x, s.y, sourceRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(240,205,255,.98)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(s.x, s.y, timingRadius, start, end);
            ctx.stroke();
          } else if (e.bossAttack === 'wave') {
            if (profile.detail > 0) {
              ctx.globalAlpha = .08 + progress * .06;
              ctx.strokeStyle = 'rgba(201,155,232,.45)';
              ctx.lineWidth = 120;
              ctx.beginPath();
              ctx.arc(s.x, s.y, 200, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(201,155,232,.80)';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(s.x, s.y, 140, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(s.x, s.y, 260, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(240,205,255,.98)';
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(s.x, s.y, e.r + 14, start, end); ctx.stroke();
          } else {
            const dangerRadius = 115;
            if (profile.detail > 0) {
              ctx.globalAlpha = .07 + progress * .07;
              ctx.fillStyle = '#c99be8';
              ctx.beginPath(); ctx.arc(s.x, s.y, dangerRadius, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(201,155,232,.78)';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(s.x, s.y, dangerRadius, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(240,205,255,.98)';
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(s.x, s.y, dangerRadius, start, end); ctx.stroke();
            ctx.strokeStyle = 'rgba(220,180,245,.92)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(s.x, s.y, e.r + 7, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.restore();
          continue;
        }
        if (e.type === 'marksman') {
          const target = screenPos(player.x, player.y), sourceRadius = e.r + 5, timingRadius = e.r + 10;
          ctx.save();
          ctx.globalAlpha = .72;
          ctx.strokeStyle = 'rgba(229,184,106,.72)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(229,184,106,.88)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, sourceRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,218,143,.98)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(s.x, s.y, timingRadius, start, end);
          ctx.stroke();
          ctx.restore();
          continue;
        }
        const dangerRadius = enemyAttackRange(e, player.r);
        ctx.save();
        if (profile.detail > 0) {
          ctx.globalAlpha = .07 + progress * .07;
          ctx.fillStyle = '#e86f60';
          ctx.beginPath();
          ctx.arc(s.x, s.y, dangerRadius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(232,111,96,.62)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, dangerRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,154,126,.96)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(s.x, s.y, dangerRadius, start, end);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,190,154,.92)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, e.r + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (e.attackPhase === 'recovery') {
        const progress = enemyRecoveryProgress(e), radius = e.r + 7;
        ctx.save();
        ctx.globalAlpha = .86;
        ctx.strokeStyle = 'rgba(134,190,196,.82)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius, start, start + Math.PI * 2 * progress);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  function drawDamageFlash() {
    if (damageFlash <= 0) return;
    const band = Math.min(30, Math.max(18, Math.min(W, H) * .045));
    ctx.save();
    ctx.globalAlpha = Math.min(.38, damageFlash);
    ctx.fillStyle = '#b83232';
    ctx.fillRect(0, 0, W, band);
    ctx.fillRect(0, H - band, W, band);
    ctx.fillRect(0, band, band, Math.max(0, H - band * 2));
    ctx.fillRect(W - band, band, band, Math.max(0, H - band * 2));
    ctx.restore();
  }
  function drawWorld() {
    const z = zones[zoneId];
    drawGround(z);
    drawAtmosphere();
    drawLandmarks(z);
    drawWorldLandmarkOverlay();
    drawQueue.length = 0;
    for (const item of staticDrawables) {
      item.y = item.kind === 'player' ? player.y : z[item.kind].y - (item.kind === 'camp' ? 100 : 0);
      drawQueue.push(item);
    }
    for (const e of entities) if ((e.hp > 0 || e._corpseUntil > time) && visible(e.x, e.y, 100)) drawQueue.push(e);
    for (const a of ambient) if (visible(a.x, a.y, 250)) drawQueue.push(a);
    if (art?.has('house')) for (const item of structures) if (visible(item.x, item.y, 200)) drawQueue.push(item);
    drawQueue.sort(sortDepth);
    for (const e of drawQueue) {
      if (e.kind === 'structure') {
        const p = screenPos(e.x, e.y);
        art.draw(ctx, e.asset, p.x, p.y + 20, e.height);
      } else if (e.kind === 'enemy') drawEntity(e);else if (e.kind === 'resource') drawResource(e);else if (e.kind === 'player') drawPlayer();else if (typeof e.scale === 'number') drawAmbientItem(e);else if (e.kind === 'camp') drawCamp(z);else if (e.kind === 'scout') drawScout(z);else drawPortal(z);
    }
    drawLighting(z);
    drawCombatTelegraphs();
    drawCombatFeedback();
    drawLoot();
    drawProjectiles();
    drawParticles();
    drawBloom(z);
    drawFloatingTexts();
    drawNpcLabels();
    drawDiscoveryLabels();
    drawDamageFlash();
  }
  function objectiveTarget() {
    const objective = inspectCurrentQuest()?.active;
    const z = zones[zoneId];
    if (!objective) return null;
    if (objective.type === 'talk') return { x: z.scout.x, y: z.scout.y };
    if (objective.type === 'portal') return { x: z.portal.x, y: z.portal.y };

    let candidates = [];
    if (objective.type === 'gather') {
      candidates = entities.filter(e => e.kind === 'resource' && e.type === objective.target && e.hp > 0);
    } else if (objective.type === 'kill') {
      candidates = entities.filter(e => e.kind === 'enemy' && e.hp > 0 && (
        objective.match === 'target' ? e.type === objective.target : enemyQuestCategory(e) === objective.target
      ));
    } else if (objective.type === 'discover') {
      const landmarks = LANDMARKS[zoneId] || [];
      candidates = landmarks.flatMap(([x, y, kind], index) => {
        const id = `${zoneId}:${index}`;
        if (player.discoveries.includes(id)) return [];
        const match = objective.match === 'target' ? id === objective.target : kind === objective.target;
        return match ? [{ x, y }] : [];
      });
    }
    if (!candidates.length) return null;
    return candidates.reduce((best, item) => !best || dist(player, item) < dist(player, best) ? item : best, null);
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
    const target = objectiveTarget();
    if (target) {
      const tx = target.x / WORLD.w * 240, ty = target.y / WORLD.h * 240;
      mctx.strokeStyle = '#ffe08a';
      mctx.lineWidth = 2;
      mctx.globalAlpha = .65 + Math.sin(time * 5) * .25;
      mctx.beginPath();
      mctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
      mctx.stroke();
      mctx.globalAlpha = 1;
    }
    mctx.fillStyle = '#eef5ef';
    mctx.beginPath();
    mctx.arc(player.x / WORLD.w * 240, player.y / WORLD.h * 240, 4, 0, Math.PI * 2);
    mctx.fill();
    for (let i = 0; i < (LANDMARKS[zoneId] || []).length; i++) {
      const lm = LANDMARKS[zoneId][i], known = player.discoveries.includes(`${zoneId}:${i}`);
      mctx.fillStyle = known ? 'rgba(255,225,150,.82)' : 'rgba(255,225,150,.18)';
      mctx.beginPath(); mctx.arc(lm[0] / WORLD.w * 240, lm[1] / WORLD.h * 240, known ? 2.5 : 1.4, 0, Math.PI * 2); mctx.fill();
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
    applyControlLayout();
    applyInterfaceSettings();
    const tracker = $('questTracker');
    tracker.classList.toggle('collapsed', settings.questCollapsed);
    $('questToggle').setAttribute('aria-expanded', String(!settings.questCollapsed));
    setText($('questChevron'), settings.questCollapsed ? '›' : '‹');
    applyGraphics();
    const x = player.x,
      y = player.y;
    resetZone();
    if (restoredPosition) {
      player.x = x;
      player.y = y;
    }
    physics?.relocate(player);
    if (reconcileActiveDiscoveryObjective()) saveDirty = true;
    if (saveDirty && !saveBlockedReason) save();
    updateUI();
    if (pendingLoadNotice) {
      toast(pendingLoadNotice);
      pendingLoadNotice = '';
    }
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
      await Promise.all([loadTextures(), art?.load(() => applyGraphics())]);
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
      registerPWA,
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
      persistence: { codecActive: true },
      build: { engineActive: Boolean(buildEngine), profile: () => buildProfile },
      recoveryCopies: () => [...testStorage.entries()].filter(([key]) => key.startsWith(RECOVERY_PREFIX)),
      saveHealth: () => ({ dirty: saveDirty, blockedReason: saveBlockedReason, revision: saveRevision }),
      storage,
      firstPaint,
      resetInput,
      queueImpactFeedback,
      flushImpactFeedback,
      updateImpactFeedback,
      resetImpactFeedback,
      impactFeedbackState,
      screenPos,
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
      physics,
      buildObstacles,
      moveActor,
      openInventory,
      openQuests,
      toggleQuest,
      openMenu,
      openShop,
      buyItem,
      openEquipment,
      openCustomization,
      openCamp,
      acceptContract,
      claimContract,
      applyContractEvent,
      applyQuestProgressEvent,
      progressContract,
      checkDiscoveries,
      installRune,
      setCosmetic,
      equipItem,
      switchGear,
      recomputeDerivedStats,
      selectSupply,
      useSupply,
      supplyUseReason,
      scaledSelfHeal,
      brewSupply,
      setUiSetting,
      setVolume,
      applyInterfaceSettings,
      applyPreset,
      suspend,
      resume,
      resetFrameLimiter,
      drawWorld,
      drawEntity,
      drawProjectiles,
      drawCombatTelegraphs,
      drawMap,
      updateUI,
      transitionZone,
      currentQuestId,
      inspectCurrentQuest,
      reconcileActiveDiscoveryObjective,
      canUsePortal,
      validateZoneQuestBindings,
      applyMainQuestEvent,
      advanceQuest,
      questTransitions: { engineActive: Boolean(questEngine) },
      combat: { engineActive: Boolean(combatEngine) },
      actionPresentation: (action, state, now, pressed = false, tuning = buildProfile?.combat) => getActionPresentation(action, state, now, pressed, tuning),
      enemyAttackRange: (enemy, playerRadius) => enemyAttackRange(enemy, playerRadius),
      enemyQuestCategory,
      ensureQuestTargets,
      enemyDetectionRange: enemy => enemyDetectionRange(enemy),
      enemyActivationHomeRange: enemy => enemyActivationHomeRange(enemy),
      enemyDisengageDistance: enemy => enemyDisengageDistance(enemy),
      marksmanDistanceIntent: (distance, phase = '') => marksmanDistanceIntent(distance, phase),
      guardianSequence: phase => guardianSequence(phase),
      guardianPhaseForHp: (hp, maxHp) => guardianPhaseForHp(hp, maxHp),
      guardianAttackProfile: (attack, phase) => guardianAttackProfile(attack, phase),
      guardianAttackDamage: (enemy, baseDamage) => guardianAttackDamage(enemy, baseDamage),
      guardianNextAttack: enemy => guardianNextAttack(enemy),
      guardianAttackEligible: (enemy, attack, distance, hasLos) => guardianAttackEligible(enemy, attack, distance, hasLos),
      enemyAttackTiming: enemy => enemyAttackTiming(enemy),
      enemyAttackPresentation: (enemy, now, playerRadius) => enemyAttackPresentation(enemy, now, playerRadius),
      renderFrame,
      applyGraphics,
      update,
      nearbyInteraction,
      campInteractionPoint: id => { const zone = typeof id === 'string' && Object.hasOwn(zones, id) ? zones[id] : zones[zoneId]; return campInteractionPoint(zone.camp); },
      campGlowPoint: id => { const zone = typeof id === 'string' && Object.hasOwn(zones, id) ? zones[id] : zones[zoneId]; return campGlowPoint(zone.camp); },
      isInCombat,
      statSources,
      objectiveTarget,
      zones,
      LANDMARKS,
      MAIN_QUESTS,
      CONTRACTS,
      validateLiveQuestStateBindings,
      RUNES,
      COSMETICS,
      player,
      setZone: id => { if (Object.hasOwn(zones, id)) { zoneId = id; audio.setZone(zoneId); resetZone(); updateUI(); return true; } return false; },
      setFps: f => {
        settings.fps = FPS.includes(Number(f)) ? Number(f) : 60;
        resetFrameLimiter();
      },
      setQuality: q => {
        if (!Object.hasOwn(QUALITY, q)) return false;
        settings.quality = q;
        applyGraphics();
        return true;
      },
      graphics: () => ({
        quality: settings.quality,
        DPR,
        dprCap: profile.dprCap || 2,
        pixelBudget: profile.pixelBudget || 1500000,
        detail: profile.detail,
        lighting: profile.lighting || 0,
        bloom: profile.bloom || 0,
        softShadows: !!profile.softShadows,
        lightmap: { width: lightCanvas.width, height: lightCanvas.height },
        effectCache: {
          light: !!FX_CACHE.light,
          bloom: !!(FX_CACHE.glowPortal && FX_CACHE.glowPortalAsh && FX_CACHE.glowCamp && FX_CACHE.glowProjectile)
        }
      }),
      getPerf: () => ({
        fps: perfActualFps,
        frameMs: perfAvgFrameMs,
        renderMs: perfAvgRenderMs
      })
    };
  } else boot();
  if (!globalThis.__AETHER_TEST__) registerPWA();
})();

