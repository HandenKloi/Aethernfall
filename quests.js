(() => {
  'use strict';

  const MAIN_TYPES = new Set(['talk', 'gather', 'kill', 'discover', 'portal']);
  const CONTRACT_KINDS = new Set(['gather', 'kill', 'discover']);
  const MATCH_MODES = new Set(['target', 'category']);

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function positiveInteger(value) {
    return Number.isInteger(value) && value > 0;
  }

  function cloneState(state) {
    return object(state) ? { ...state } : {};
  }

  function matches(eventType, target, match, event) {
    if (!object(event) || event.type !== eventType) return false;
    if (match === 'target') return event.target === target;
    if (match === 'category') return event.category === target;
    return false;
  }

  function validateMainObjective(questId, objective, index) {
    if (!object(objective) || !nonEmptyString(objective.id) || !MAIN_TYPES.has(objective.type) || !nonEmptyString(objective.text)) {
      throw new Error(`Main quest objective definition error: ${questId}:${index}`);
    }
    if (objective.progressText !== undefined && !nonEmptyString(objective.progressText)) {
      throw new Error(`Main quest progress text error: ${questId}:${objective.id}`);
    }
    if (objective.effect !== undefined && !nonEmptyString(objective.effect)) {
      throw new Error(`Main quest effect error: ${questId}:${objective.id}`);
    }

    if (objective.type === 'talk') {
      if (!nonEmptyString(objective.target)) throw new Error(`Main quest talk target error: ${questId}:${objective.id}`);
    } else if (objective.type === 'gather') {
      if (!nonEmptyString(objective.target) || objective.match !== 'target') {
        throw new Error(`Main quest gather match error: ${questId}:${objective.id}`);
      }
      if (!nonEmptyString(objective.counter)) throw new Error(`Main quest counter error: ${questId}:${objective.id}`);
      if (!positiveInteger(objective.required)) throw new Error(`Main quest required error: ${questId}:${objective.id}`);
    } else if (objective.type === 'kill') {
      if (!nonEmptyString(objective.target) || !MATCH_MODES.has(objective.match)) {
        throw new Error(`Main quest match error: ${questId}:${objective.id}`);
      }
      if (!nonEmptyString(objective.counter)) throw new Error(`Main quest counter error: ${questId}:${objective.id}`);
      if (!positiveInteger(objective.required)) throw new Error(`Main quest required error: ${questId}:${objective.id}`);
      if (objective.match === 'category' && !nonEmptyString(objective.spawnTarget)) {
        throw new Error(`Main quest spawn target error: ${questId}:${objective.id}`);
      }
    } else if (objective.type === 'discover') {
      if (!nonEmptyString(objective.target) || !MATCH_MODES.has(objective.match)) {
        throw new Error(`Main quest discover match error: ${questId}:${objective.id}`);
      }
      const hasCounter = nonEmptyString(objective.counter);
      const hasRequired = positiveInteger(objective.required);
      if (hasCounter !== hasRequired) throw new Error(`Discover progress shape error: ${questId}:${objective.id}`);
      if (!hasCounter && (objective.counter !== undefined || objective.required !== undefined || objective.progressText !== undefined)) {
        throw new Error(`One-shot discover progress shape error: ${questId}:${objective.id}`);
      }
    }

    if (objective.spawnTarget !== undefined && !(objective.type === 'kill' && objective.match === 'category')) {
      throw new Error(`Unexpected spawn target: ${questId}:${objective.id}`);
    }
  }

  function validateDefinitions(definitions) {
    if (!object(definitions) || !object(definitions.main) || !Object.keys(definitions.main).length) {
      throw new Error('Quest definition error: at least one main quest is required');
    }
    if (!object(definitions.contracts)) throw new Error('Quest definition error: contracts registry is required');

    for (const [questId, definition] of Object.entries(definitions.main)) {
      if (!object(definition) || !nonEmptyString(definition.title) || !Array.isArray(definition.objectives) || !definition.objectives.length) {
        throw new Error(`Main quest definition error: ${questId}`);
      }
      const ids = new Set();
      let portalCount = 0;
      definition.objectives.forEach((objective, index) => {
        validateMainObjective(questId, objective, index);
        if (ids.has(objective.id)) throw new Error(`Main quest objective id must be unique: ${questId}:${objective.id}`);
        ids.add(objective.id);
        if (objective.type === 'portal') {
          portalCount++;
          if (index !== definition.objectives.length - 1) throw new Error(`Main quest portal must be final: ${questId}:${objective.id}`);
        }
      });
      if (portalCount !== 1) throw new Error(`Main quest portal definition error: ${questId}`);
    }

    for (const [zoneId, definition] of Object.entries(definitions.contracts)) {
      if (!object(definition) || !CONTRACT_KINDS.has(definition.kind) || !nonEmptyString(definition.target) ||
          !positiveInteger(definition.required) || !Number.isFinite(definition.gold) || definition.gold < 0 ||
          !nonEmptyString(definition.supply) || !nonEmptyString(definition.title) || !nonEmptyString(definition.note)) {
        throw new Error(`Contract definition error: ${zoneId}`);
      }
      if (definition.kind === 'gather') {
        if (definition.match !== 'target') throw new Error(`Contract gather match error: ${zoneId}`);
      } else if (!MATCH_MODES.has(definition.match)) {
        throw new Error(`Contract match error: ${zoneId}`);
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

  function applyProgressObjective(step, next, event, stepIndex) {
    if (!matches(step.type, step.target, step.match, event)) return null;
    const amount = event.amount === undefined ? 1 : Number(event.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const current = Math.max(0, Number(next[step.counter]) || 0);
    const progress = Math.min(step.required, current + amount);
    if (progress === current) return null;
    next[step.counter] = progress;
    if (progress >= step.required) {
      next.step = stepIndex + 1;
      return mainResult(next, true, true, true, stepEffects(step));
    }
    return mainResult(next, true, true, false, []);
  }

  function applyMain(definitions, questId, state, event) {
    const definition = definitions.main[questId];
    if (!definition || !object(event)) return mainNoop(state);
    const next = cloneState(state);
    const stepIndex = Number(next.step);
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= definition.objectives.length) return mainNoop(state);
    const step = definition.objectives[stepIndex];

    if (step.type === 'talk') {
      if (event.type !== 'talk' || event.target !== step.target) return mainNoop(state);
      next.step = stepIndex + 1;
      return mainResult(next, true, false, true, stepEffects(step));
    }

    if (step.type === 'gather' || step.type === 'kill' || (step.type === 'discover' && step.counter)) {
      return applyProgressObjective(step, next, event, stepIndex) || mainNoop(state);
    }

    if (step.type === 'discover') {
      if (!matches('discover', step.target, step.match, event)) return mainNoop(state);
      next.step = stepIndex + 1;
      return mainResult(next, true, false, true, stepEffects(step));
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
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= definition.objectives.length) return mainNoop(state);
    const step = definition.objectives[stepIndex];
    let shouldAdvance = false;
    if (step.type === 'talk') shouldAdvance = step.target === 'scout' && reason === 'scout';
    else if ((step.type === 'gather' || step.type === 'kill' || (step.type === 'discover' && step.counter)) && step.counter) {
      shouldAdvance = (Number(next[step.counter]) || 0) >= step.required;
    } else if (step.type === 'portal') shouldAdvance = reason === 'portal';
    if (!shouldAdvance) return mainNoop(state);
    if (step.type === 'portal') return mainResult(resetQuestState(next), true, false, true, stepEffects(step));
    next.step = stepIndex + 1;
    return mainResult(next, true, false, true, stepEffects(step));
  }

  function objectiveCurrent(step, state) {
    if (!step.counter) return undefined;
    return Math.min(step.required, Math.max(0, Number(state?.[step.counter]) || 0));
  }

  function activeProjection(step, state) {
    const active = {};
    for (const key of ['id','type','target','match','counter','required','text','progressText','spawnTarget']) {
      if (step[key] !== undefined) active[key] = step[key];
    }
    const current = objectiveCurrent(step, state);
    if (current !== undefined) active.current = current;
    active.displayText = step.counter && step.progressText ? `${step.progressText}: ${current}/${step.required}` : step.text;
    return active;
  }

  function inspectMain(definitions, questId, state) {
    const definition = definitions.main[questId];
    if (!definition || !object(state)) return null;
    const stepIndex = Number(state.step);
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= definition.objectives.length) return null;
    const active = activeProjection(definition.objectives[stepIndex], state);
    const steps = definition.objectives.map((step, index) => ({
      id: step.id,
      type: step.type,
      text: step.text,
      displayText: index === stepIndex ? active.displayText : step.text,
      status: index < stepIndex ? 'complete' : index === stepIndex ? 'current' : 'upcoming',
    }));
    return { questId, title: definition.title, stepIndex, stepCount: definition.objectives.length, active, steps };
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

  function applyContract(definitions, zoneId, state, event, cycle) {
    const definition = definitions.contracts[zoneId];
    if (!definition || state?.state !== 1 || !matches(definition.kind, definition.target, definition.match, event)) return contractNoop(state);
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
      inspectMain: (questId, state) => inspectMain(definitions, questId, state),
      refreshContract: (zoneId, state, cycle) => refreshContract(definitions, zoneId, state, cycle),
      acceptContract: (zoneId, state, cycle) => acceptContract(definitions, zoneId, state, cycle),
      applyContractEvent: (zoneId, state, event, cycle) => applyContract(definitions, zoneId, state, event, cycle),
      claimContract: (zoneId, state, cycle) => claimContract(definitions, zoneId, state, cycle),
    });
  }

  window.AetherQuests = Object.freeze({ createEngine });
})();
