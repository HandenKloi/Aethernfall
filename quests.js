(() => {
  'use strict';

  const MAIN_TYPES = new Set(['talk', 'gather', 'kill', 'portal']);
  const CONTRACT_KINDS = new Set(['gather', 'kill']);

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneState(state) {
    return object(state) ? { ...state } : {};
  }

  function validateDefinitions(definitions) {
    if (!object(definitions) || !object(definitions.main) || !Object.keys(definitions.main).length) {
      throw new Error('Quest definition error: at least one main quest is required');
    }
    if (!object(definitions.contracts)) throw new Error('Quest definition error: contracts registry is required');

    for (const [questId, definition] of Object.entries(definitions.main)) {
      if (!object(definition) || !Array.isArray(definition.steps) || definition.steps.length !== 4) {
        throw new Error(`Main quest definition error: ${questId}`);
      }
      definition.steps.forEach((step, index) => {
        if (!object(step) || !MAIN_TYPES.has(step.type)) throw new Error(`Main quest objective definition error: ${questId}:${index}`);
        if (step.type === 'talk' && !step.target) throw new Error(`Main quest objective definition error: ${questId}:${index}`);
        if (step.type === 'gather' || step.type === 'kill') {
          if (!step.target || typeof step.counter !== 'string' || !step.counter || !Number.isFinite(step.required) || step.required <= 0) {
            throw new Error(`Main quest objective definition error: ${questId}:${index}`);
          }
        }
      });
    }

    for (const [zoneId, definition] of Object.entries(definitions.contracts)) {
      if (!object(definition) || !CONTRACT_KINDS.has(definition.kind) || !definition.target || !Number.isFinite(definition.required) || definition.required <= 0 || !Number.isFinite(definition.gold) || definition.gold < 0 || typeof definition.supply !== 'string' || !definition.supply) {
        throw new Error(`Contract definition error: ${zoneId}`);
      }
    }
  }

  function mainResult(state, changed = false, progressChanged = false, stepChanged = false, effects = []) {
    return { state, changed, progressChanged, stepChanged, effects };
  }

  function mainNoop(state) {
    return mainResult(cloneState(state));
  }

  function resetQuestState(state) {
    const next = cloneState(state);
    for (const key of Object.keys(next)) next[key] = 0;
    return next;
  }

  function stepEffects(step) {
    const effects = [{ type: 'questStepChanged' }];
    if (step?.effect) effects.push({ type: step.effect });
    return effects;
  }

  function matchesProgressTarget(step, event) {
    if (step.type === 'gather') return event.target === step.target;
    if (step.type === 'kill') return event.target === step.target || event.category === step.target;
    return false;
  }

  function applyMain(definitions, questId, state, event) {
    const definition = definitions.main[questId];
    if (!definition || !object(event)) return mainNoop(state);
    const next = cloneState(state);
    const stepIndex = Number(next.step);
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= definition.steps.length) return mainNoop(state);
    const step = definition.steps[stepIndex];

    if (step.type === 'talk') {
      if (event.type !== 'talk' || event.target !== step.target) return mainNoop(state);
      next.step = stepIndex + 1;
      return mainResult(next, true, false, true, stepEffects(step));
    }

    if (step.type === 'gather' || step.type === 'kill') {
      if (event.type !== step.type || !matchesProgressTarget(step, event)) return mainNoop(state);
      const amount = event.amount === undefined ? 1 : Number(event.amount);
      if (!Number.isFinite(amount) || amount <= 0) return mainNoop(state);
      const current = Math.max(0, Number(next[step.counter]) || 0);
      const progress = Math.min(step.required, current + amount);
      if (progress === current) return mainNoop(state);
      next[step.counter] = progress;
      if (progress >= step.required) {
        next.step = stepIndex + 1;
        return mainResult(next, true, true, true, stepEffects(step));
      }
      return mainResult(next, true, true, false, []);
    }

    if (step.type === 'portal') {
      if (event.type !== 'portal') return mainNoop(state);
      return mainResult(resetQuestState(next), true, false, true, stepEffects(step));
    }
    return mainNoop(state);
  }

  function evaluateLegacy(definitions, questId, state, reason) {
    const definition = definitions.main[questId];
    if (!definition) return mainNoop(state);
    const next = cloneState(state);
    const stepIndex = Number(next.step);
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= definition.steps.length) return mainNoop(state);
    const step = definition.steps[stepIndex];
    let shouldAdvance = false;
    if (step.type === 'talk') shouldAdvance = reason === 'scout';
    else if (step.type === 'gather' || step.type === 'kill') shouldAdvance = (Number(next[step.counter]) || 0) >= step.required;
    else if (step.type === 'portal') shouldAdvance = reason === 'portal';
    if (!shouldAdvance) return mainNoop(state);
    if (step.type === 'portal') return mainResult(resetQuestState(next), true, false, true, stepEffects(step));
    next.step = stepIndex + 1;
    return mainResult(next, true, false, true, stepEffects(step));
  }

  function contractResult(state, changed = false, progressChanged = false, effects = []) {
    return { state, changed, progressChanged, effects };
  }

  function contractNoop(state) {
    return contractResult(cloneState(state));
  }

  function validCycle(cycle) {
    const n = Number(cycle);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }

  function refreshContract(definitions, zoneId, state, cycle) {
    if (!definitions.contracts[zoneId]) return contractNoop(state);
    const currentCycle = validCycle(cycle);
    const next = cloneState(state);
    if (currentCycle === null) return contractNoop(state);
    if (next.state === 3 && Number(next.cycle) < currentCycle) {
      next.state = 0;
      next.progress = 0;
      next.cycle = currentCycle;
      return contractResult(next, true);
    }
    return contractNoop(state);
  }

  function acceptContract(definitions, zoneId, state, cycle) {
    if (!definitions.contracts[zoneId]) return contractNoop(state);
    const currentCycle = validCycle(cycle);
    if (currentCycle === null || state?.state !== 0) return contractNoop(state);
    const next = cloneState(state);
    next.state = 1;
    next.progress = 0;
    next.cycle = currentCycle;
    return contractResult(next, true);
  }

  function matchContractEvent(definition, event) {
    if (!object(event) || event.type !== definition.kind) return false;
    if (definition.kind === 'kill') return event.target === definition.target || event.category === definition.target;
    return event.target === definition.target;
  }

  function applyContract(definitions, zoneId, state, event, cycle) {
    const definition = definitions.contracts[zoneId];
    if (!definition || state?.state !== 1 || !matchContractEvent(definition, event)) return contractNoop(state);
    const currentCycle = validCycle(cycle);
    if (currentCycle === null) return contractNoop(state);
    const amount = event.amount === undefined ? 1 : Number(event.amount);
    if (!Number.isFinite(amount) || amount <= 0) return contractNoop(state);
    const next = cloneState(state);
    const current = Math.max(0, Number(next.progress) || 0);
    const progress = Math.min(definition.required, current + amount);
    next.progress = progress;
    if (progress >= definition.required) {
      next.state = 2;
      return contractResult(next, true, progress !== current, [{ type: 'contractCompleted' }]);
    }
    if (progress === current) return contractNoop(state);
    return contractResult(next, true, true);
  }

  function claimContract(definitions, zoneId, state, cycle) {
    const definition = definitions.contracts[zoneId];
    const currentCycle = validCycle(cycle);
    if (!definition || currentCycle === null || state?.state !== 2) return contractNoop(state);
    const next = cloneState(state);
    next.state = 3;
    next.cycle = currentCycle;
    return contractResult(next, true, false, [{
      type: 'grantContractReward',
      gold: definition.gold,
      supply: definition.supply,
      amount: 1,
    }]);
  }

  function createEngine(definitions) {
    validateDefinitions(definitions);
    return Object.freeze({
      applyMainEvent: (questId, state, event) => applyMain(definitions, questId, state, event),
      evaluateLegacyReason: (questId, state, reason) => evaluateLegacy(definitions, questId, state, reason),
      refreshContract: (zoneId, state, cycle) => refreshContract(definitions, zoneId, state, cycle),
      acceptContract: (zoneId, state, cycle) => acceptContract(definitions, zoneId, state, cycle),
      applyContractEvent: (zoneId, state, event, cycle) => applyContract(definitions, zoneId, state, event, cycle),
      claimContract: (zoneId, state, cycle) => claimContract(definitions, zoneId, state, cycle),
    });
  }

  window.AetherQuests = Object.freeze({ createEngine });
})();
