"use strict";

(() => {
  'use strict';

  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const object = value => isObject(value) ? value : {};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, fallback, min = 0, max = 1e9) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  const finiteSigned = (value, fallback = 0, min = -1e9, max = 1e9) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  const finiteSetting = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? clamp(n, 0, 1) : fallback;
  };

  function validateRules(rules) {
    if (!isObject(rules) || !Number.isInteger(rules.saveSchema) || rules.saveSchema < 1) throw new TypeError('Invalid persistence rules');
    if (!Array.isArray(rules.zoneIds) || !Array.isArray(rules.contractIds)) throw new TypeError('Invalid persistence rules');
  }

  function createCodec(rules) {
    validateRules(rules);
    const zoneIds = new Set(rules.zoneIds);
    const contractIds = [...rules.contractIds];

    function validSaveShape(data, schema) {
      if (!isObject(data) || !isObject(data.player)) return false;
      const p = data.player;
      const finiteFields = (value, fields) => fields.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]));
      const stringFields = (value, fields) => fields.every(key => typeof value[key] === 'string');
      const booleanFields = (value, fields) => fields.every(key => typeof value[key] === 'boolean');
      if (schema >= 3) {
        const meta = object(data.meta);
        const inv = object(p.inv);
        const shopOwned = object(p.shopOwned);
        const loadout = object(p.loadout);
        const supplies = object(p.supplies);
        const progression = object(p.progression);
        const quests = object(p.quests);
        const config = object(data.settings);
        if (!finiteFields(p, ['x', 'y', 'hp', 'stamina', 'level', 'xp', 'xpNeed', 'gold', 'dir'])) return false;
        if (!finiteFields(meta, ['revision', 'updatedAt']) || typeof meta.sessionId !== 'string' || !meta.sessionId) return false;
        if (!zoneIds.has(data.zoneId)) return false;
        if (!finiteFields(inv, ['wood', 'ore', 'herb', 'guardianToken', 'emberShard'])) return false;
        if (!booleanFields(shopOwned, ['dawnBlade', 'wardenArmor', 'buckler'])) return false;
        if (!stringFields(loadout, ['weapon', 'armor', 'offhand', 'quick'])) return false;
        if (!finiteFields(supplies, ['potion', 'tonic'])) return false;
        if (!finiteFields(progression, ['forgeRank', 'vitalityRank', 'legacyDamageBonus', 'legacyHpBonus', 'completedCycles'])) return false;
        if (!finiteFields(object(quests.mist), ['step', 'herb', 'kills'])) return false;
        if (!finiteFields(object(quests.stone), ['step', 'ore', 'guardian'])) return false;
        if (!finiteFields(object(quests.ash), ['step', 'wood', 'kills'])) return false;
        if (typeof config.quality !== 'string' || typeof config.fps !== 'number' || !Number.isFinite(config.fps) || typeof config.controls !== 'string' || typeof config.questCollapsed !== 'boolean') return false;
        if (schema >= 4) {
          const runes = object(p.runes);
          const cosmetics = object(p.cosmetics);
          const contracts = object(p.contracts);
          if (!finiteFields(supplies, ['fieldKit'])) return false;
          if (!stringFields(runes, ['weapon', 'armor']) || !stringFields(cosmetics, ['accent', 'trail'])) return false;
          for (const id of contractIds) if (!finiteFields(object(contracts[id]), ['state', 'progress', 'cycle'])) return false;
          if (!Array.isArray(p.discoveries) || p.discoveries.some(id => typeof id !== 'string')) return false;
          if (typeof config.controlSize !== 'string' || typeof config.brightness !== 'number' || !Number.isFinite(config.brightness) || typeof config.uiScale !== 'string' || typeof config.minimapSize !== 'string' || typeof config.combatNumbers !== 'boolean' || typeof config.haptics !== 'boolean') return false;
          if (!finiteFields(config, ['masterVolume', 'musicVolume', 'ambientVolume', 'sfxVolume']) || typeof config.musicEnabled !== 'boolean') return false;
        }
        return true;
      }
      return finiteFields(p, ['x', 'y', 'hp', 'maxHp', 'stamina', 'level', 'gold', 'damage']) && isObject(p.inv) && isObject(p.quests);
    }

    function parse(raw) {
      if (!raw || typeof raw !== 'string') return { ok: false, reason: 'empty' };
      try {
        const data = JSON.parse(raw);
        if (!isObject(data)) return { ok: false, reason: 'shape' };
        const schema = Number.isFinite(Number(data.schemaVersion)) ? Number(data.schemaVersion) : 1;
        if (schema > rules.saveSchema) return { ok: false, reason: 'newer', schema };
        if (!validSaveShape(data, schema)) return { ok: false, reason: 'shape', schema };
        return { ok: true, data, schema };
      } catch {
        return { ok: false, reason: 'json' };
      }
    }

    function readMeta(data) {
      const meta = object(data?.meta);
      return {
        revision: Math.floor(finite(meta.revision, 0, 0, Number.MAX_SAFE_INTEGER)),
        updatedAt: finite(meta.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
        sessionId: typeof meta.sessionId === 'string' ? meta.sessionId : ''
      };
    }

    function requireNormalizeRules() {
      const requiredObjects = ['zones', 'world', 'baseStats', 'gear', 'supplies', 'runes', 'cosmetics', 'contracts', 'defaults', 'settingsOptions'];
      for (const key of requiredObjects) if (!isObject(rules[key])) throw new TypeError('Invalid persistence normalization rules');
      if (!isObject(rules.defaults.player) || !isObject(rules.defaults.settings)) throw new TypeError('Invalid persistence normalization rules');
      if (!Array.isArray(rules.inventoryKeys) || !Array.isArray(rules.shopOwnedIds) || !Array.isArray(rules.qualityIds) || !Array.isArray(rules.fpsValues)) throw new TypeError('Invalid persistence normalization rules');
      if (!Number.isInteger(rules.maxUpgradeRank) || rules.maxUpgradeRank < 0) throw new TypeError('Invalid persistence normalization rules');
    }

    function normalize(data, schema, fallbacks = {}) {
      requireNormalizeRules();
      const defaults = rules.defaults.player;
      const saved = object(data?.player);
      const zoneId = zoneIds.has(data?.zoneId) ? data.zoneId : rules.defaultZoneId;
      const zone = object(rules.zones[zoneId]);
      const camp = object(zone.camp);
      const world = rules.world;
      const baseStats = rules.baseStats;
      const player = {
        x: finite(saved.x, finite(camp.x, defaults.x, 70, world.w - 70), 70, world.w - 70),
        y: finite(saved.y, finite(camp.y, defaults.y, 70, world.h - 70), 70, world.h - 70),
        hp: finite(saved.hp, defaults.hp, 0, 1e12),
        stamina: finite(saved.stamina, defaults.stamina, 0, baseStats.maxStamina),
        level: Math.max(1, Math.floor(finite(saved.level, defaults.level, 1, 1e6))),
        xp: finite(saved.xp, defaults.xp, 0, 1e12),
        xpNeed: Math.max(1, finite(saved.xpNeed, defaults.xpNeed, 1, 1e12)),
        gold: Math.floor(finite(saved.gold, defaults.gold, 0, 1e12)),
        dir: finiteSigned(saved.dir, 0, -Math.PI * 2, Math.PI * 2),
        inv: {},
        shopOwned: {},
        loadout: {},
        supplies: {},
        runes: {},
        cosmetics: {},
        contracts: {},
        discoveries: [],
        progression: {},
        quests: {}
      };

      const savedInv = object(saved.inv);
      for (const key of rules.inventoryKeys) player.inv[key] = Math.floor(finite(savedInv[key], 0, 0, 1e9));

      const savedOwned = object(saved.shopOwned);
      for (const id of rules.shopOwnedIds) player.shopOwned[id] = savedOwned[id] === true;

      const previousLoadout = object(saved.loadout);
      const savedEquipment = object(saved.equipment);
      const gear = rules.gear;
      const ownsGear = id => id === 'emptyHand' || id === 'starterBlade' || id === 'starterArmor' || player.shopOwned[id] === true || id === 'guardianArmor' && player.inv.guardianToken > 0;
      const defaultWeapon = player.shopOwned.dawnBlade ? 'dawnBlade' : 'starterBlade';
      const defaultArmor = savedEquipment.armor === gear.guardianArmor?.name && player.inv.guardianToken > 0 ? 'guardianArmor' : player.shopOwned.wardenArmor ? 'wardenArmor' : 'starterArmor';
      player.loadout = { weapon: defaultWeapon, armor: defaultArmor, offhand: 'emptyHand', quick: defaults.loadout?.quick || 'potion' };
      for (const slot of ['weapon', 'armor', 'offhand']) {
        const id = previousLoadout[slot];
        if (Object.hasOwn(gear, id) && gear[id].slot === slot && ownsGear(id)) player.loadout[slot] = id;
      }
      if (previousLoadout.quick === '' || Object.hasOwn(rules.supplies, previousLoadout.quick)) player.loadout.quick = previousLoadout.quick;

      const savedSupplies = object(saved.supplies);
      for (const id of Object.keys(rules.supplies)) player.supplies[id] = Math.floor(finite(savedSupplies[id], 0, 0, 9999));

      const savedRunes = object(saved.runes);
      player.runes = {
        weapon: Object.hasOwn(rules.runes.weapon, savedRunes.weapon) ? savedRunes.weapon : defaults.runes?.weapon || 'none',
        armor: Object.hasOwn(rules.runes.armor, savedRunes.armor) ? savedRunes.armor : defaults.runes?.armor || 'none'
      };

      const savedCosmetics = object(saved.cosmetics);
      player.cosmetics = {
        accent: Object.hasOwn(rules.cosmetics.accents, savedCosmetics.accent) ? savedCosmetics.accent : defaults.cosmetics?.accent || 'teal',
        trail: Object.hasOwn(rules.cosmetics.trails, savedCosmetics.trail) ? savedCosmetics.trail : defaults.cosmetics?.trail || 'steel'
      };

      const savedContracts = object(saved.contracts);
      for (const id of contractIds) {
        const c = object(savedContracts[id]);
        player.contracts[id] = {
          state: Math.floor(finite(c.state, 0, 0, 3)),
          progress: Math.floor(finite(c.progress, 0, 0, rules.contracts[id]?.required ?? 0)),
          cycle: Math.floor(finite(c.cycle, 0, 0, 1e9))
        };
      }

      player.discoveries = Array.isArray(saved.discoveries)
        ? [...new Set(saved.discoveries.filter(id => typeof id === 'string' && /^\w+:\d+$/.test(id)))].slice(0, 128)
        : [];

      const savedQuests = object(saved.quests);
      for (const [key, fields] of Object.entries(defaults.quests)) {
        player.quests[key] = {};
        const source = object(savedQuests[key]);
        for (const field of Object.keys(fields)) player.quests[key][field] = Math.floor(finite(source[field], 0, 0, field === 'step' ? 3 : 1e9));
      }

      if (schema < 3 && player.inv.guardianToken === 0 && (player.quests.stone?.step >= 3 || zoneId === 'ashfield')) player.inv.guardianToken = 1;

      if (schema >= 3) {
        const progression = object(saved.progression);
        player.progression = {
          forgeRank: Math.floor(finite(progression.forgeRank, 0, 0, rules.maxUpgradeRank)),
          vitalityRank: Math.floor(finite(progression.vitalityRank, 0, 0, rules.maxUpgradeRank)),
          legacyDamageBonus: finiteSigned(progression.legacyDamageBonus, 0),
          legacyHpBonus: finiteSigned(progression.legacyHpBonus, 0),
          completedCycles: Math.floor(finite(progression.completedCycles, 0, 0, 1e9))
        };
      } else {
        const levelSteps = Math.max(0, Math.floor(player.level) - baseStats.startLevel);
        const weaponBonus = gear[player.loadout.weapon]?.damage || 0;
        const armorBonus = gear[player.loadout.armor]?.health || 0;
        const baseDamage = baseStats.damage + levelSteps * baseStats.damagePerLevel + weaponBonus;
        const baseHp = baseStats.maxHp + levelSteps * baseStats.hpPerLevel + armorBonus;
        const oldDamage = finiteSigned(saved.damage, baseDamage, 1, 1e9);
        const oldMaxHp = finiteSigned(saved.maxHp, baseHp, 1, 1e9);
        const damageExtra = oldDamage - baseDamage;
        const hpExtra = oldMaxHp - baseHp;
        const forgeRank = clamp(Math.floor(Math.max(0, damageExtra) / 5), 0, rules.maxUpgradeRank);
        const vitalityRank = clamp(Math.floor(Math.max(0, hpExtra) / 12), 0, rules.maxUpgradeRank);
        player.progression = {
          forgeRank,
          vitalityRank,
          legacyDamageBonus: damageExtra - forgeRank * 5,
          legacyHpBonus: hpExtra - vitalityRank * 12,
          completedCycles: 0
        };
      }

      const config = object(data?.settings);
      const fallbackSettings = object(fallbacks.settings);
      const defaultsSettings = rules.defaults.settings;
      const fallbackQuality = rules.qualityIds.includes(fallbackSettings.quality) ? fallbackSettings.quality : defaultsSettings.quality;
      const fallbackFps = rules.fpsValues.includes(Number(fallbackSettings.fps)) ? Number(fallbackSettings.fps) : defaultsSettings.fps;
      const options = rules.settingsOptions;
      const settings = {
        quality: rules.qualityIds.includes(config.quality) ? config.quality : fallbackQuality,
        fps: rules.fpsValues.includes(Number(config.fps)) ? Number(config.fps) : fallbackFps,
        controls: config.controls === 'left' ? 'left' : 'right',
        controlSize: options.controlSizes.includes(config.controlSize) ? config.controlSize : 'normal',
        questCollapsed: config.questCollapsed !== false,
        brightness: options.brightness.includes(Number(config.brightness)) ? Number(config.brightness) : 100,
        uiScale: config.uiScale === 'large' ? 'large' : 'normal',
        minimapSize: config.minimapSize === 'large' ? 'large' : 'normal',
        combatNumbers: config.combatNumbers !== false,
        haptics: config.haptics !== false,
        masterVolume: finiteSetting(config.masterVolume, .8),
        musicVolume: finiteSetting(config.musicVolume, .55),
        ambientVolume: finiteSetting(config.ambientVolume, .65),
        sfxVolume: finiteSetting(config.sfxVolume, .8),
        musicEnabled: config.musicEnabled !== false
      };

      return {
        schemaVersion: rules.saveSchema,
        zoneId,
        player,
        settings,
        meta: readMeta(data)
      };
    }

    function serialize(runtimeSnapshot, meta) {
      const player = object(runtimeSnapshot?.player);
      const settings = object(runtimeSnapshot?.settings);
      const inv = object(player.inv);
      const shopOwned = object(player.shopOwned);
      const loadout = object(player.loadout);
      const supplies = object(player.supplies);
      const runes = object(player.runes);
      const cosmetics = object(player.cosmetics);
      const contracts = object(player.contracts);
      const progression = object(player.progression);
      const quests = object(player.quests);
      const persistentInv = {};
      for (const key of rules.inventoryKeys || []) persistentInv[key] = inv[key] || 0;
      const persistentOwned = {};
      for (const id of rules.shopOwnedIds || []) persistentOwned[id] = shopOwned[id] === true;
      const persistentSupplies = {};
      for (const id of Object.keys(rules.supplies || {})) persistentSupplies[id] = supplies[id] || 0;
      const persistentContracts = {};
      for (const id of contractIds) {
        const c = object(contracts[id]);
        persistentContracts[id] = { state: c.state, progress: c.progress, cycle: c.cycle };
      }
      const persistentQuests = {};
      for (const [id, fields] of Object.entries(object(rules.defaults?.player?.quests))) {
        const q = object(quests[id]);
        persistentQuests[id] = {};
        for (const field of Object.keys(fields)) persistentQuests[id][field] = q[field];
      }
      return {
        schemaVersion: rules.saveSchema,
        version: meta?.buildVersion,
        meta: { revision: meta?.revision, updatedAt: meta?.updatedAt, sessionId: meta?.sessionId },
        zoneId: runtimeSnapshot?.zoneId,
        player: {
          x: player.x,
          y: player.y,
          hp: player.hp,
          stamina: player.stamina,
          level: player.level,
          xp: player.xp,
          xpNeed: player.xpNeed,
          gold: player.gold,
          dir: player.dir,
          inv: persistentInv,
          shopOwned: persistentOwned,
          loadout: { weapon: loadout.weapon, armor: loadout.armor, offhand: loadout.offhand, quick: loadout.quick },
          supplies: persistentSupplies,
          runes: { weapon: runes.weapon, armor: runes.armor },
          cosmetics: { accent: cosmetics.accent, trail: cosmetics.trail },
          contracts: persistentContracts,
          discoveries: Array.isArray(player.discoveries) ? player.discoveries.slice() : [],
          progression: {
            forgeRank: progression.forgeRank,
            vitalityRank: progression.vitalityRank,
            legacyDamageBonus: progression.legacyDamageBonus,
            legacyHpBonus: progression.legacyHpBonus,
            completedCycles: progression.completedCycles
          },
          quests: persistentQuests
        },
        settings: {
          quality: settings.quality,
          fps: settings.fps,
          controls: settings.controls,
          controlSize: settings.controlSize,
          questCollapsed: settings.questCollapsed,
          brightness: settings.brightness,
          uiScale: settings.uiScale,
          minimapSize: settings.minimapSize,
          combatNumbers: settings.combatNumbers,
          haptics: settings.haptics,
          masterVolume: settings.masterVolume,
          musicVolume: settings.musicVolume,
          ambientVolume: settings.ambientVolume,
          sfxVolume: settings.sfxVolume,
          musicEnabled: settings.musicEnabled
        }
      };
    }

    return Object.freeze({ parse, readMeta, normalize, serialize });
  }

  window.AetherPersistence = Object.freeze({ createCodec });
})();
