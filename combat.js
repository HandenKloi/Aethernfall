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
        if (!Number.isFinite(damage) || damage <= 0) return { valid: false, avoided: false, blocked: false, damage: 0 };
        if (input.dodging === true) return { valid: true, avoided: true, blocked: false, damage: 0 };
        if (input.blocking === true) {
          const multiplier = input.buckler === true ? rules.bucklerIncomingMultiplier : rules.blockIncomingMultiplier;
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
        const dt = Number(input.dt), now = Number(input.now), maxStamina = Number(input.maxStamina), multiplier = Number(input.blockDrainMultiplier);
        if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(now) || !Number.isFinite(maxStamina) || maxStamina < 0 || !Number.isFinite(multiplier) || multiplier < 0) return { state: next, exhausted: false, effects };
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
        next.stamina = input.blocking === true
          ? Math.max(0, Math.min(maxStamina, stamina - rules.blockStaminaDrain * multiplier * dt))
          : Math.max(0, Math.min(maxStamina, stamina + rules.staminaRegen * dt));
        return { state: next, exhausted: input.blocking === true && next.stamina <= 0, effects };
      },
      requestDodge(input = {}) {
        const next = clone(input) || {};
        const now = Number(input.now), stamina = Number(input.stamina), dodgeCd = Number(input.dodgeCd);
        if (!Number.isFinite(now) || !Number.isFinite(stamina) || !Number.isFinite(dodgeCd)) return { accepted: false, reason: 'invalid', state: next, action: null };
        if (dodgeCd > now) return { accepted: false, reason: 'cooldown', state: next, action: null };
        if (stamina < rules.dodgeStaminaCost) return { accepted: false, reason: 'stamina', state: next, action: null };
        next.stamina = stamina - rules.dodgeStaminaCost;
        next.dodgeCd = now + rules.dodgeCooldown;
        next.dodgeUntil = now + rules.dodgeWindow;
        next.dashRemaining = rules.dashDuration;
        return { accepted: true, reason: '', state: next, action: { type: 'dodge', duration: rules.dashDuration, distance: rules.dashDistance } };
      },
      requestSkill(input = {}) {
        const next = clone(input) || {};
        const id = Number(input.id), now = Number(input.now), stamina = Number(input.stamina), hp = Number(input.hp), maxHp = Number(input.maxHp), secondWindCd = Number(input.secondWindCd), skillMultiplier = Number(input.skillDamageMultiplier);
        if (![1, 2, 3].includes(id)) return { accepted: false, reason: 'invalidSkill', state: next, action: null };
        if (![now, stamina, hp, maxHp, secondWindCd, skillMultiplier].every(Number.isFinite)) return { accepted: false, reason: 'invalid', state: next, action: null };
        if (id === 3 && hp >= maxHp) return { accepted: false, reason: 'fullHealth', state: next, action: null };
        if (id === 3 && secondWindCd > now) return { accepted: false, reason: 'cooldown', state: next, action: null };
        if (stamina < rules.skillStaminaCost) return { accepted: false, reason: 'stamina', state: next, action: null };
        next.stamina = stamina - rules.skillStaminaCost;
        if (id === 1) return { accepted: true, reason: '', state: next, action: { type: 'windSlash', range: rules.windSlashRange, halfArc: rules.windSlashHalfArc, damageMultiplier: rules.windSlashDamageMultiplier * skillMultiplier } };
        if (id === 2) return { accepted: true, reason: '', state: next, action: { type: 'triplePulse', count: rules.triplePulseCount, spread: rules.triplePulseSpread, speed: rules.triplePulseSpeed, lifetime: rules.triplePulseLifetime, damageMultiplier: rules.triplePulseDamageMultiplier * skillMultiplier } };
        next.secondWindCd = now + rules.secondWindCooldown;
        next.hp = Math.min(maxHp, hp + rules.secondWindHeal);
        return { accepted: true, reason: '', state: next, action: { type: 'secondWind', heal: next.hp - hp } };
      }
    });
  }
  window.AetherCombat = Object.freeze({ createEngine });
})();
