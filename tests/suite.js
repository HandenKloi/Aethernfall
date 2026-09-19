"use strict";

function runAetherTests(api, doc) {
  const results = [];
  const test = (name, fn) => {
    try {
      const ok = fn();
      results.push({ name, pass: ok !== false });
    } catch (error) {
      results.push({ name, pass: false, error: error?.message || String(error) });
    }
  };

  test('boot exposes core state', () => {
    const state = api.state();
    return !!state && typeof state.zoneId === 'string' && !!state.player && typeof state.time === 'number';
  });

  test('player has sane core stats', () => {
    const player = api.state().player;
    return Number.isFinite(player.hp) && player.hp > 0
      && Number.isFinite(player.maxHp) && player.hp <= player.maxHp
      && Number.isInteger(player.level) && player.level > 0;
  });

  test('quest state and objective read without throwing', () => {
    const state = api.state();
    api.inspectCurrentQuest();
    return state.quest !== undefined;
  });

  test('arena engine reports a known phase for the current zone', () => {
    const PHASES = new Set(['idle', 'entering', 'active', 'transition', 'boss', 'victory', 'defeat', 'completed']);
    if (!api.arena.engineActive) return true;
    return PHASES.has(api.arena.state().phase);
  });

  test('canvas render pass does not throw', () => {
    api.drawWorld();
    api.updateUI();
    return true;
  });

  test('attack and dodge inputs are accepted without throwing', () => {
    api.attack();
    api.dodge();
    return true;
  });

  test('save then load round-trips player state from storage', () => {
    const originalLevel = api.state().player.level;
    if (!api.save()) throw new Error('save() reported failure');
    api.state().player.level = originalLevel + 1000;
    if (!api.load()) throw new Error('load() reported failure');
    return api.state().player.level === originalLevel;
  });

  test('save health surfaces no blocked reason after a clean save/load', () => {
    const health = api.saveHealth();
    return health.blockedReason === '';
  });

  test('suspend/resume do not throw and leave state readable', () => {
    api.suspend();
    api.resume();
    return !!api.state();
  });

  return results;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { runAetherTests };
