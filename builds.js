'use strict';
(() => {
  const SLOTS = new Set(['weapon', 'armor', 'offhand']);
  const BUILD_KEYS = new Set([
    'blockIncomingMultiplier',
    'blockDrainMultiplier',
    'staminaRegenMultiplier',
    'speedMultiplier',
    'dodgeStaminaCostMultiplier',
    'dodgeCooldownMultiplier',
    'skillStaminaCostMultiplier',
    'skillDamageMultiplier',
    'secondWindCooldownMultiplier',
    'healingMultiplier',
  ]);
  const REQUIRED_BASE = ['startLevel', 'damage', 'maxHp', 'maxStamina', 'speed', 'damagePerLevel', 'hpPerLevel'];
  const REQUIRED_COMBAT = [
    'blockIncomingMultiplier', 'bucklerIncomingMultiplier', 'blockStaminaDrain', 'staminaRegen',
    'dodgeStaminaCost', 'dodgeCooldown', 'skillStaminaCost', 'secondWindHeal', 'secondWindCooldown'
  ];

  function object(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function finite(value) {
    return Number.isFinite(value);
  }

  function validateBuildMetadata(build, owner) {
    if (build === undefined) return;
    if (!object(build)) throw new TypeError('build metadata required');
    for (const [key, value] of Object.entries(build)) {
      if (!BUILD_KEYS.has(key)) throw new TypeError(`unknown build modifier ${key}`);
      if (!finite(value) || value <= 0) throw new TypeError(`build modifier ${key} must be finite and positive`);
      if (key === 'blockIncomingMultiplier') {
        if (owner.kind !== 'gear' || owner.slot !== 'offhand') throw new TypeError('blockIncomingMultiplier requires offhand gear');
        if (value > 1) throw new TypeError('blockIncomingMultiplier must be within (0,1]');
      }
    }
  }

  function validateBaseStats(baseStats) {
    if (!object(baseStats)) throw new TypeError('base stats required');
    for (const key of REQUIRED_BASE) {
      const value = baseStats[key];
      if (!finite(value)) throw new TypeError(`base stat ${key} must be finite`);
    }
    if (!Number.isInteger(baseStats.startLevel) || baseStats.startLevel < 1) throw new TypeError('base stat startLevel must be a positive integer');
    for (const key of ['damage', 'maxHp', 'maxStamina', 'speed']) {
      if (baseStats[key] <= 0) throw new TypeError(`base stat ${key} must be positive`);
    }
    for (const key of ['damagePerLevel', 'hpPerLevel']) {
      if (baseStats[key] < 0) throw new TypeError(`base stat ${key} must be non-negative`);
    }
  }

  function validateCombatRules(combatRules) {
    if (!object(combatRules)) throw new TypeError('combat rules required');
    for (const key of REQUIRED_COMBAT) {
      const value = combatRules[key];
      if (!finite(value) || value < 0) throw new TypeError(`combat rule ${key} must be finite and non-negative`);
    }
    for (const key of ['blockIncomingMultiplier', 'bucklerIncomingMultiplier']) {
      if (combatRules[key] <= 0 || combatRules[key] > 1) throw new TypeError(`combat rule ${key} must be within (0,1]`);
    }
  }

  function validateCatalogs(gear, runes) {
    if (!object(gear)) throw new TypeError('gear catalog required');
    for (const [id, item] of Object.entries(gear)) {
      if (!object(item) || !SLOTS.has(item.slot)) throw new TypeError(`gear slot invalid for ${id}`);
      if ('damage' in item && !finite(item.damage)) throw new TypeError(`gear damage invalid for ${id}`);
      if ('health' in item && !finite(item.health)) throw new TypeError(`gear health invalid for ${id}`);
      validateBuildMetadata(item.build, { kind: 'gear', slot: item.slot, id });
    }
    if (!object(runes) || !object(runes.weapon) || !object(runes.armor)) throw new TypeError('rune catalog required');
    for (const slot of ['weapon', 'armor']) {
      if (!Object.hasOwn(runes[slot], 'none')) throw new TypeError(`neutral rune required for ${slot}`);
      for (const [id, rune] of Object.entries(runes[slot])) {
        if (!object(rune)) throw new TypeError(`rune invalid for ${slot}:${id}`);
        if ('damage' in rune && !finite(rune.damage)) throw new TypeError(`rune damage invalid for ${slot}:${id}`);
        if ('health' in rune && !finite(rune.health)) throw new TypeError(`rune health invalid for ${slot}:${id}`);
        validateBuildMetadata(rune.build, { kind: 'rune', slot, id });
      }
    }
  }

  function createEngine(definitions) {
    if (!object(definitions)) throw new TypeError('build definitions required');
    const { baseStats, combatRules, gear, runes } = definitions;
    validateBaseStats(baseStats);
    validateCombatRules(combatRules);
    validateCatalogs(gear, runes);

    function derive(input) {
      if (!object(input)) throw new TypeError('build derive input required');
      if (!finite(input.level) || input.level < 1) throw new TypeError('level must be finite and positive');
      const progression = input.progression;
      const loadout = input.loadout;
      const selectedRunes = input.runes;
      if (!object(progression)) throw new TypeError('progression required');
      if (!object(loadout)) throw new TypeError('loadout required');
      if (!object(selectedRunes)) throw new TypeError('runes required');
      for (const key of ['forgeRank', 'vitalityRank']) {
        if (!finite(progression[key]) || progression[key] < 0) throw new TypeError(`progression ${key} must be finite and non-negative`);
      }
      for (const key of ['legacyDamageBonus', 'legacyHpBonus']) {
        if (!finite(progression[key])) throw new TypeError(`progression ${key} must be finite`);
      }

      const weapon = gear[loadout.weapon];
      const armor = gear[loadout.armor];
      const offhand = gear[loadout.offhand];
      if (!weapon || weapon.slot !== 'weapon') throw new TypeError('loadout weapon slot invalid');
      if (!armor || armor.slot !== 'armor') throw new TypeError('loadout armor slot invalid');
      if (!offhand || offhand.slot !== 'offhand') throw new TypeError('loadout offhand slot invalid');
      const weaponRune = runes.weapon[selectedRunes.weapon];
      const armorRune = runes.armor[selectedRunes.armor];
      if (!weaponRune) throw new TypeError('weapon rune invalid');
      if (!armorRune) throw new TypeError('armor rune invalid');

      const levelSteps = Math.max(0, Math.floor(input.level) - baseStats.startLevel);
      const sources = [weapon, armor, offhand, weaponRune, armorRune];
      const product = key => sources.reduce((value, source) => value * (source.build?.[key] ?? 1), 1);
      const healingMultiplier = product('healingMultiplier');
      const combat = Object.freeze({
        blockIncomingMultiplier: offhand.build?.blockIncomingMultiplier ?? combatRules.blockIncomingMultiplier,
        blockStaminaDrain: combatRules.blockStaminaDrain * product('blockDrainMultiplier'),
        staminaRegen: combatRules.staminaRegen * product('staminaRegenMultiplier'),
        dodgeStaminaCost: combatRules.dodgeStaminaCost * product('dodgeStaminaCostMultiplier'),
        dodgeCooldown: combatRules.dodgeCooldown * product('dodgeCooldownMultiplier'),
        skillStaminaCost: combatRules.skillStaminaCost * product('skillStaminaCostMultiplier'),
        skillDamageMultiplier: product('skillDamageMultiplier'),
        secondWindHeal: Math.round(combatRules.secondWindHeal * healingMultiplier),
        secondWindCooldown: combatRules.secondWindCooldown * product('secondWindCooldownMultiplier'),
      });
      return Object.freeze({
        damage: Math.max(1,
          baseStats.damage + levelSteps * baseStats.damagePerLevel
          + progression.forgeRank * 5 + progression.legacyDamageBonus
          + (weapon.damage || 0) + (weaponRune.damage || 0)),
        maxHp: Math.max(1,
          baseStats.maxHp + levelSteps * baseStats.hpPerLevel
          + progression.vitalityRank * 12 + progression.legacyHpBonus
          + (armor.health || 0) + (armorRune.health || 0)),
        maxStamina: baseStats.maxStamina,
        speed: baseStats.speed * product('speedMultiplier'),
        healingMultiplier,
        combat,
      });
    }

    return Object.freeze({ derive });
  }

  window.AetherBuilds = Object.freeze({ createEngine });
})();
