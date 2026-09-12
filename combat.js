'use strict';
(() => {
  const REQUIRED = [
    'attackCooldown','attackBufferWindow','comboWindow','maxCombo','critChance','critMultiplier','comboDamageStep',
    'dodgeStaminaCost','dodgeCooldown','dodgeWindow','dashDuration','dashDistance','blockStaminaDrain','staminaRegen',
    'bucklerIncomingMultiplier','blockIncomingMultiplier','skillStaminaCost','windSlashRange','windSlashHalfArc',
    'windSlashDamageMultiplier','triplePulseCount','triplePulseSpread','triplePulseSpeed','triplePulseLifetime',
    'triplePulseDamageMultiplier','secondWindHeal','secondWindCooldown'
  ];
  const clone = value => value && typeof value === 'object' ? { ...value } : value;
  function validateRules(rules) {
    if (!rules || typeof rules !== 'object') throw new TypeError('combat rule set required');
    for (const key of REQUIRED) {
      const value = rules[key];
      if (!Number.isFinite(value) || value < 0) throw new TypeError(`combat rule ${key} must be finite and non-negative`);
    }
    if (rules.critChance < 0 || rules.critChance > 1) throw new TypeError('combat rule critChance must be within 0..1');
    if (rules.maxCombo < 1 || !Number.isInteger(rules.maxCombo)) throw new TypeError('combat rule maxCombo must be a positive integer');
    if (rules.triplePulseCount < 1 || !Number.isInteger(rules.triplePulseCount)) throw new TypeError('combat rule triplePulseCount must be a positive integer');
  }
  function readTuning(input, keys) {
    if (input.tuning === undefined) return { supplied: false, values: null };
    if (!input.tuning || typeof input.tuning !== 'object') return { supplied: true, values: null };
    const values = {};
    for (const key of keys) {
      const value = input.tuning[key];
      if (!Number.isFinite(value) || value < 0) return { supplied: true, values: null };
      values[key] = value;
    }
    return { supplied: true, values };
  }
  function createEngine(rules) {
    validateRules(rules);
    return Object.freeze({
      resolveBasicDamage(input = {}) {
        const damage = Number(input.damage), combo = Number(input.combo), critRoll = Number(input.critRoll);
        if (!Number.isFinite(damage) || damage <= 0 || !Number.isFinite(critRoll) || critRoll < 0 || critRoll >= 1) return { valid: false, amount: 0, critical: false };
        const critical = critRoll < rules.critChance;
        const comboStep = Math.max(0, (Number.isFinite(combo) ? combo : 1) - 1);
        const amount = Math.round(damage * (critical ? rules.critMultiplier : 1) * (1 + rules.comboDamageStep * comboStep));
        return { valid: Number.isFinite(amount) && amount > 0, amount: Number.isFinite(amount) && amount > 0 ? amount : 0, critical };
      },
      resolveIncomingDamage(input = {}) {
        const damage = Number(input.damage);
        const tuning = readTuning(input, ['blockIncomingMultiplier']);
        if (!Number.isFinite(damage) || damage <= 0 || tuning.supplied && !tuning.values) return { valid: false, avoided: false, blocked: false, damage: 0 };
        if (input.dodging === true) return { valid: true, avoided: true, blocked: false, damage: 0 };
        if (input.blocking === true) {
          const multiplier = tuning.supplied ? tuning.values.blockIncomingMultiplier : input.buckler === true ? rules.bucklerIncomingMultiplier : rules.blockIncomingMultiplier;
          return { valid: true, avoided: false, blocked: true, damage: Math.ceil(damage * multiplier) };
        }
        return { valid: true, avoided: false, blocked: false, damage };
      },
      requestAttack(state = {}, now = 0) {
        const next = clone(state) || {};
        const attackCd = Number(next.attackCd);
        if (!Number.isFinite(attackCd)) return { decision: 'reject', state: next };
        if (attackCd <= 0) return { decision: 'execute', state: next };
        if (attackCd <= rules.attackBufferWindow && Number.isFinite(now)) {
          next.attackQueuedUntil = now + rules.attackBufferWindow;
          return { decision: 'buffer', state: next };
        }
        return { decision: 'reject', state: next };
      },
      beginAttack(state = {}) {
        const next = clone(state) || {};
        const previousTimer = Number(next.comboTimer);
        const previousCombo = Number(next.combo);
        next.attackCd = rules.attackCooldown;
        next.attackQueuedUntil = 0;
        next.combo = previousTimer > 0 ? Math.min(rules.maxCombo, Math.max(0, Number.isFinite(previousCombo) ? previousCombo : 0) + 1) : 1;
        next.comboTimer = rules.comboWindow;
        return { accepted: true, state: next };
      },
      tick(state = {}, input = {}) {
        const next = clone(state) || {}, effects = [];
        const dt = Number(input.dt), now = Number(input.now), maxStamina = Number(input.maxStamina);
        const tuning = readTuning(input, ['blockStaminaDrain', 'staminaRegen']);
        const multiplier = Number(input.blockDrainMultiplier);
        if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(now) || !Number.isFinite(maxStamina) || maxStamina < 0 || tuning.supplied && !tuning.values || !tuning.supplied && (!Number.isFinite(multiplier) || multiplier < 0)) return { state: next, exhausted: false, effects };
        const attackCd = Number.isFinite(Number(next.attackCd)) ? Number(next.attackCd) : 0;
        next.attackCd = Math.max(0, attackCd - dt);
        const queuedUntil = Number.isFinite(Number(next.attackQueuedUntil)) ? Number(next.attackQueuedUntil) : 0;
        next.attackQueuedUntil = queuedUntil;
        if (next.attackCd === 0 && queuedUntil >= now && queuedUntil !== 0) effects.push({ type: 'executeBufferedAttack' });
        else if (queuedUntil && queuedUntil < now) next.attackQueuedUntil = 0;
        const comboTimer = Number.isFinite(Number(next.comboTimer)) ? Number(next.comboTimer) : 0;
        next.comboTimer = Math.max(0, comboTimer - dt);
        if (next.comboTimer === 0) next.combo = 0;
        const stamina = Number.isFinite(Number(next.stamina)) ? Number(next.stamina) : 0;
        const blockStaminaDrain = tuning.supplied ? tuning.values.blockStaminaDrain : rules.blockStaminaDrain * multiplier;
        const staminaRegen = tuning.supplied ? tuning.values.staminaRegen : rules.staminaRegen;
        next.stamina = input.blocking === true
          ? Math.max(0, Math.min(maxStamina, stamina - blockStaminaDrain * dt))
          : Math.max(0, Math.min(maxStamina, stamina + staminaRegen * dt));
        return { state: next, exhausted: input.blocking === true && next.stamina <= 0, effects };
      },
      requestDodge(input = {}) {
        const next = clone(input) || {};
        const now = Number(input.now), stamina = Number(input.stamina), dodgeCd = Number(input.dodgeCd);
        const tuning = readTuning(input, ['dodgeStaminaCost', 'dodgeCooldown']);
        if (!Number.isFinite(now) || !Number.isFinite(stamina) || !Number.isFinite(dodgeCd) || tuning.supplied && !tuning.values) return { accepted: false, reason: 'invalid', state: next, action: null };
        const dodgeStaminaCost = tuning.supplied ? tuning.values.dodgeStaminaCost : rules.dodgeStaminaCost;
        const dodgeCooldown = tuning.supplied ? tuning.values.dodgeCooldown : rules.dodgeCooldown;
        if (dodgeCd > now) return { accepted: false, reason: 'cooldown', state: next, action: null };
        if (stamina < dodgeStaminaCost) return { accepted: false, reason: 'stamina', state: next, action: null };
        next.stamina = stamina - dodgeStaminaCost;
        next.dodgeCd = now + dodgeCooldown;
        next.dodgeUntil = now + rules.dodgeWindow;
        next.dashRemaining = rules.dashDuration;
        return { accepted: true, reason: '', state: next, action: { type: 'dodge', duration: rules.dashDuration, distance: rules.dashDistance } };
      },
      requestSkill(input = {}) {
        const next = clone(input) || {};
        const id = Number(input.id), now = Number(input.now), stamina = Number(input.stamina), hp = Number(input.hp), maxHp = Number(input.maxHp), secondWindCd = Number(input.secondWindCd);
        const tuning = readTuning(input, ['skillStaminaCost', 'skillDamageMultiplier', 'secondWindHeal', 'secondWindCooldown']);
        if (![1, 2, 3].includes(id)) return { accepted: false, reason: 'invalidSkill', state: next, action: null };
        const legacySkillMultiplier = Number(input.skillDamageMultiplier);
        if (![now, stamina, hp, maxHp, secondWindCd].every(Number.isFinite) || tuning.supplied && !tuning.values || !tuning.supplied && !Number.isFinite(legacySkillMultiplier)) return { accepted: false, reason: 'invalid', state: next, action: null };
        const skillStaminaCost = tuning.supplied ? tuning.values.skillStaminaCost : rules.skillStaminaCost;
        const skillMultiplier = tuning.supplied ? tuning.values.skillDamageMultiplier : legacySkillMultiplier;
        const secondWindHeal = tuning.supplied ? tuning.values.secondWindHeal : rules.secondWindHeal;
        const secondWindCooldown = tuning.supplied ? tuning.values.secondWindCooldown : rules.secondWindCooldown;
        if (id === 3 && hp >= maxHp) return { accepted: false, reason: 'fullHealth', state: next, action: null };
        if (id === 3 && secondWindCd > now) return { accepted: false, reason: 'cooldown', state: next, action: null };
        if (stamina < skillStaminaCost) return { accepted: false, reason: 'stamina', state: next, action: null };
        next.stamina = stamina - skillStaminaCost;
        if (id === 1) return { accepted: true, reason: '', state: next, action: { type: 'windSlash', range: rules.windSlashRange, halfArc: rules.windSlashHalfArc, damageMultiplier: rules.windSlashDamageMultiplier * skillMultiplier } };
        if (id === 2) return { accepted: true, reason: '', state: next, action: { type: 'triplePulse', count: rules.triplePulseCount, spread: rules.triplePulseSpread, speed: rules.triplePulseSpeed, lifetime: rules.triplePulseLifetime, damageMultiplier: rules.triplePulseDamageMultiplier * skillMultiplier } };
        next.secondWindCd = now + secondWindCooldown;
        next.hp = Math.min(maxHp, hp + secondWindHeal);
        return { accepted: true, reason: '', state: next, action: { type: 'secondWind', heal: next.hp - hp } };
      }
    });
  }
  window.AetherCombat = Object.freeze({ createEngine });
})();
