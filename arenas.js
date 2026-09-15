"use strict";

(() => {
  'use strict';

  const PHASES = new Set(['idle', 'entering', 'active', 'transition', 'boss', 'victory', 'defeat', 'completed']);
  const COMBAT_PHASES = new Set(['entering', 'active', 'transition', 'boss']);
  const objectLike = value => value && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, fallback, min = -1, max = 1e9) => Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const result = (state, effects = []) => Object.freeze({ state:Object.freeze(state), effects:Object.freeze(effects.map(Object.freeze)) });
  const fail = message => { throw new Error(`Invalid arena definition: ${message}`); };

  function createEngine(definitions) {
    if (!objectLike(definitions) || !Object.keys(definitions).length) fail('registry required');
    const normalized = {};
    for (const [id, input] of Object.entries(definitions)) {
      if (!id || !objectLike(input)) fail(`${id || 'unknown'} must be an object`);
      if (!Number.isFinite(input.radius) || input.radius < 180 || input.radius > 800) fail(`${id} radius`);
      if (!Number.isInteger(input.cap) || input.cap < 2 || input.cap > 8) fail(`${id} cap`);
      if (!Array.isArray(input.waves) || !input.waves.length || input.waves.length > 4) fail(`${id} waves`);
      const waves = input.waves.map((wave, index) => {
        if (!Array.isArray(wave) || !wave.length || wave.length > input.cap || wave.some(type => typeof type !== 'string' || !type)) fail(`${id} wave ${index}`);
        return Object.freeze([...wave]);
      });
      if (typeof input.boss !== 'string' || !input.boss) fail(`${id} boss`);
      if (!objectLike(input.reward)) fail(`${id} reward`);
      normalized[id] = Object.freeze({
        id,
        radius:input.radius,
        cap:input.cap,
        waves:Object.freeze(waves),
        boss:input.boss,
        reward:Object.freeze({ ...input.reward })
      });
    }

    function definition(id) {
      if (!Object.hasOwn(normalized, id)) throw new Error(`Unknown arena: ${id}`);
      return normalized[id];
    }

    function initialState() {
      return Object.freeze({ phase:'idle', waveIndex:0, remaining:0, attempts:0, completedCycle:-1, rewardedCycle:-1 });
    }

    function normalizedState(raw) {
      const source = objectLike(raw) ? raw : {};
      return {
        phase:PHASES.has(source.phase) ? source.phase : 'idle',
        waveIndex:integer(source.waveIndex, 0, 0, 99),
        remaining:integer(source.remaining, 0, 0, 99),
        attempts:integer(source.attempts, 0, 0),
        completedCycle:integer(source.completedCycle, -1),
        rewardedCycle:integer(source.rewardedCycle, -1)
      };
    }

    function normalize(id, raw, cycle = 0) {
      definition(id);
      const state = normalizedState(raw);
      const currentCycle = integer(cycle, 0, 0);
      if (state.phase === 'victory') {
        state.phase = 'completed';
        state.completedCycle = currentCycle;
      } else if (state.completedCycle === currentCycle) state.phase = 'completed';
      else if (state.phase !== 'idle' && state.phase !== 'completed') state.phase = 'idle';
      if (state.completedCycle !== currentCycle && state.phase === 'completed') state.phase = 'idle';
      state.waveIndex = 0;
      state.remaining = 0;
      return Object.freeze(state);
    }

    function enter(id, raw, cycle = 0) {
      definition(id);
      const state = normalizedState(raw), currentCycle = integer(cycle, 0, 0);
      if (state.completedCycle === currentCycle) return result({ ...state, phase:'completed', remaining:0 }, [{ type:'unlockExit' }]);
      if (state.phase !== 'idle' && state.phase !== 'defeat') return result(state);
      return result({ ...state, phase:'entering', waveIndex:0, remaining:0, attempts:state.attempts + 1 }, [{ type:'closeGate' }]);
    }

    function spawnWave(id, state) {
      const def = definition(id), wave = def.waves[state.waveIndex];
      return result({ ...state, phase:'active', remaining:wave.length }, [{ type:'spawnWave', waveIndex:state.waveIndex, enemies:[...wave], cap:def.cap }]);
    }

    function activate(id, raw, cycle = 0) {
      const state = normalizedState(raw);
      if (state.phase !== 'entering') return result(state);
      return spawnWave(id, state, cycle);
    }

    function enemyDefeated(id, raw) {
      const def = definition(id), state = normalizedState(raw);
      if (state.phase !== 'active' || state.remaining < 1) return result(state);
      const remaining = state.remaining - 1;
      if (remaining > 0) return result({ ...state, remaining });
      const clearedIndex = state.waveIndex, nextIndex = clearedIndex + 1;
      return result({ ...state, phase:'transition', waveIndex:Math.min(nextIndex, def.waves.length), remaining:0 }, [{ type:'waveCleared', waveIndex:clearedIndex }]);
    }

    function advance(id, raw) {
      const def = definition(id), state = normalizedState(raw);
      if (state.phase !== 'transition') return result(state);
      if (state.waveIndex < def.waves.length) return spawnWave(id, state);
      return result({ ...state, phase:'boss', remaining:1 }, [{ type:'spawnBoss', boss:def.boss }]);
    }

    function bossDefeated(id, raw, cycle = 0) {
      const def = definition(id), state = normalizedState(raw), currentCycle = integer(cycle, 0, 0);
      if (state.phase !== 'boss') return result(state);
      const effects = [{ type:'cleanup' }];
      let rewardedCycle = state.rewardedCycle;
      if (rewardedCycle !== currentCycle) {
        rewardedCycle = currentCycle;
        effects.push({ type:'grantReward', reward:{ ...def.reward }, cycle:currentCycle });
      }
      effects.push({ type:'unlockExit' });
      return result({ ...state, phase:'victory', remaining:0, rewardedCycle }, effects);
    }

    function defeat(id, raw) {
      definition(id);
      const state = normalizedState(raw);
      if (!COMBAT_PHASES.has(state.phase)) return result(state);
      return result({ ...state, phase:'defeat', waveIndex:0, remaining:0 }, [{ type:'cleanup' }, { type:'openGate' }]);
    }

    function restart(id, raw, cycle = 0) {
      const state = normalizedState(raw);
      if (state.phase !== 'defeat') return result(state);
      const entered = enter(id, { ...state, phase:'idle' }, cycle);
      return result(entered.state, [{ type:'cleanup' }, ...entered.effects]);
    }

    function complete(id, raw, cycle = 0) {
      definition(id);
      const state = normalizedState(raw), currentCycle = integer(cycle, 0, 0);
      if (state.phase !== 'victory' && state.completedCycle !== currentCycle) return result(state);
      return result({ ...state, phase:'completed', remaining:0, completedCycle:currentCycle }, [{ type:'unlockExit' }]);
    }

    return Object.freeze({ definition, initialState, normalize, enter, activate, enemyDefeated, advance, bossDefeated, defeat, restart, complete });
  }

  window.AetherArenas = Object.freeze({ createEngine });
})();
