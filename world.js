(() => {
  'use strict';
  const ENEMIES = new Set(['boar','raider','marksman']);
  const RESOURCES = new Set(['herb','wood','ore']);
  const ENEMY_OFFSETS = Object.freeze([[-96,-72],[96,-72],[0,112]].map(Object.freeze));
  const RESOURCE_OFFSETS = Object.freeze([[-128,96],[-48,144],[48,144],[128,96]].map(Object.freeze));

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }
  function objectLike(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function sameKeys(a,b) {
    const aa = Object.keys(a).sort(), bb = Object.keys(b).sort();
    return aa.length === bb.length && aa.every((key,i) => key === bb[i]);
  }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0; }
  function expandCounts(counts) {
    const out = [];
    for (const [type,count] of Object.entries(counts)) for (let i=0;i<count;i++) out.push(type);
    return out;
  }
  function fail(message) { throw new Error(`Invalid world identities: ${message}`); }

  function createEngine({ identities, landmarks } = {}) {
    if (!objectLike(identities) || !objectLike(landmarks)) fail('identities and landmarks must be objects');
    if (!sameKeys(identities, landmarks)) fail('zone keys must match landmark zone keys');
    const normalized = {};
    for (const zoneId of Object.keys(identities)) {
      const input = identities[zoneId];
      if (!objectLike(input)) fail(`${zoneId} identity must be an object`);
      const resourceKinds = Array.isArray(input.resourceKinds) ? [...input.resourceKinds] : [];
      if (resourceKinds.length !== 2) fail(`${zoneId} resourceKinds must contain exactly 2 entries`);
      if (new Set(resourceKinds).size !== resourceKinds.length) fail(`${zoneId} duplicate resource kind`);
      if (resourceKinds.some(type => !RESOURCES.has(type))) fail(`${zoneId} unsupported resource kind`);
      if (!objectLike(input.ambientEnemies) || !objectLike(input.ambientResources)) fail(`${zoneId} ambient maps are required`);
      if (Object.entries(input.ambientEnemies).some(([type,count]) => !ENEMIES.has(type) || !positiveInteger(count))) {
        const unsupported = Object.keys(input.ambientEnemies).some(type => !ENEMIES.has(type));
        fail(`${zoneId} ${unsupported ? 'unsupported enemy type' : 'positive integer enemy count required'}`);
      }
      if (Object.entries(input.ambientResources).some(([type,count]) => !RESOURCES.has(type) || !positiveInteger(count))) {
        const unsupported = Object.keys(input.ambientResources).some(type => !RESOURCES.has(type));
        fail(`${zoneId} ${unsupported ? 'unsupported resource type' : 'positive integer resource count required'}`);
      }
      if (Object.keys(input.ambientResources).some(type => !resourceKinds.includes(type))) fail(`${zoneId} ambient resource must belong to resourceKinds`);
      const ambientEnemies = expandCounts(input.ambientEnemies);
      const ambientResources = expandCounts(input.ambientResources);
      if (ambientEnemies.length !== 14) fail(`${zoneId} ambient enemy total must be 14; ordinary enemy total must be 17`);
      if (ambientResources.length !== 28) fail(`${zoneId} ambient resource total must be 28; resource total must be 32`);
      const signature = input.signature;
      if (!objectLike(signature)) fail(`${zoneId} signature is required`);
      if (typeof signature.id !== 'string' || !signature.id.trim()) fail(`${zoneId} signature id must be non-empty`);
      if (typeof signature.name !== 'string' || !signature.name.trim()) fail(`${zoneId} signature name must be non-empty`);
      if (!Number.isInteger(signature.landmarkIndex) || signature.landmarkIndex < 0 || signature.landmarkIndex >= landmarks[zoneId].length) fail(`${zoneId} signature landmark index is invalid`);
      if (!Array.isArray(signature.enemies) || signature.enemies.length !== 3) fail(`${zoneId} signature enemy list must contain 3 entries; ordinary enemy total must be 17`);
      if (!Array.isArray(signature.resources) || signature.resources.length !== 4) fail(`${zoneId} signature resource list must contain 4 entries; resource total must be 32`);
      if (signature.enemies.some(type => !ENEMIES.has(type))) fail(`${zoneId} unsupported signature enemy type`);
      if (signature.resources.some(type => !RESOURCES.has(type))) fail(`${zoneId} unsupported signature resource type`);
      if (signature.resources.some(type => !resourceKinds.includes(type))) fail(`${zoneId} signature resource must belong to resourceKinds`);
      if (ambientEnemies.length + signature.enemies.length !== 17) fail(`${zoneId} ordinary enemy total must be 17`);
      if (ambientResources.length + signature.resources.length !== 32) fail(`${zoneId} resource total must be 32`);

      const identity = deepFreeze({
        id:zoneId, resourceKinds:[...resourceKinds],
        ambientEnemyCounts:{...input.ambientEnemies}, ambientResourceCounts:{...input.ambientResources},
        signature:{id:signature.id,name:signature.name,landmarkIndex:signature.landmarkIndex},
      });
      const enemyPlan = deepFreeze({ ambient:[...ambientEnemies], signature:[...signature.enemies], totalOrdinary:17 });
      const resourcePlan = deepFreeze({ ambient:[...ambientResources], signature:[...signature.resources], total:32 });
      const eventPlan = deepFreeze({
        id:signature.id, name:signature.name, landmarkIndex:signature.landmarkIndex,
        enemies:signature.enemies.map((type,i) => ({type,dx:ENEMY_OFFSETS[i][0],dy:ENEMY_OFFSETS[i][1]})),
        resources:signature.resources.map((type,i) => ({type,dx:RESOURCE_OFFSETS[i][0],dy:RESOURCE_OFFSETS[i][1]})),
      });
      normalized[zoneId] = { identity, enemyPlan, resourcePlan, eventPlan };
    }
    const lookup = zoneId => {
      if (!Object.hasOwn(normalized, zoneId)) throw new Error(`Unknown world zone: ${zoneId}`);
      return normalized[zoneId];
    };
    return Object.freeze({
      identity:zoneId => lookup(zoneId).identity,
      enemyPlan:zoneId => lookup(zoneId).enemyPlan,
      resourcePlan:zoneId => lookup(zoneId).resourcePlan,
      eventPlan:zoneId => lookup(zoneId).eventPlan,
    });
  }

  window.AetherWorld = Object.freeze({ createEngine });
})();
