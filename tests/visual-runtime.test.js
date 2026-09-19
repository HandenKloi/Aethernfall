"use strict";

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadBrowserScript(file, globals = {}) {
  const sandbox = { console, Math, Object, Array, Number, Set, Map, ...globals };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename:file });
  return sandbox;
}

function drawingContext() {
  const images = [];
  return {
    images,
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    drawImage(image) { images.push(image.id); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
    ellipse() {}, arc() {}, quadraticCurveTo() {}, strokeRect() {}, fillRect() {}
  };
}

function entry(id, extra = {}) {
  return {
    image:{ id }, pack:{ id:'test', src:'test.webp', width:300, height:136 },
    record:{ id, rect:[0,0,100,136], frames:[[0,0,100,136],[100,0,100,136],[200,0,100,136]], directions:['front','back','side'], pivot:[50,128], ...extra }
  };
}

function testEquipmentLayers() {
  const env = loadBrowserScript('art.js');
  const records = new Map([
    ['player.ranger', entry('actor', { actorContract:true })],
    ['equipment.weapon.starter_blade', entry('weapon')],
    ['equipment.offhand.buckler', entry('shield')]
  ]);
  env.AetherArt.setAssetManager({ source:id => records.get(id) || null, has:id => records.has(id), draw:() => false });
  const ctx = drawingContext();
  assert.equal(env.AetherArt.actor(ctx, 'player.ranger', 0, 0, {
    height:88, direction:'front', clip:'idle', equipment:{ weapon:'starterBlade', armor:'starterArmor', offhand:'buckler' }
  }), true);
  assert.deepEqual(ctx.images, ['actor', 'weapon', 'shield'], 'equipped weapon and shield must be composited over the player');
}

function testPainterlyPlayerEquipment() {
  const env = loadBrowserScript('art.js');
  const records = new Map([['legacy.sword', entry('painterly-sword')]]);
  env.AetherArt.setAssetManager({
    source:id => records.get(id === 'sword' ? 'legacy.sword' : id) || null,
    has:id => records.has(id === 'sword' ? 'legacy.sword' : id),
    draw:() => false
  });
  const ctx = drawingContext();
  assert.equal(typeof env.AetherArt.drawPlayerEquipment, 'function');
  assert.equal(env.AetherArt.drawPlayerEquipment(ctx, 100, 120, 88, {
    action:'block', progress:.5, time:1, moving:false, flip:false,
    loadout:{ weapon:'starterBlade', offhand:'buckler' }
  }), true);
  assert.ok(ctx.images.includes('painterly-sword'), 'painterly player path must draw the equipped sword');
}

function testVisibleCollisionPlan() {
  const env = loadBrowserScript('zone-visuals.js');
  assert.equal(typeof env.AetherZoneVisuals.staticObstacles, 'function', 'zone visuals must own the static collision plan');
  const result = env.AetherZoneVisuals.staticObstacles('mistwood', { x:320, y:410 }, [{ x:600, y:700, scale:1, footprint:12, visualId:'prop.mist.fern_cluster' }]);
  assert.ok(result.length >= 6);
  assert.ok(result.every(item => item.visualId), 'every static collider must have a visible asset id');
  assert.ok(!result.some(item => item.x === 1180 && item.y === 430), 'legacy invisible hard-coded collider must not return');
}

function testWorldObjectFallback() {
  const env = loadBrowserScript('art.js');
  const records = new Map([
    ['legacy.ruins', entry('legacy-ruins')],
    ['landmark.mist.unknown', entry('geometric-placeholder')]
  ]);
  env.AetherArt.setAssetManager({
    source:id => records.get(id === 'ruins' ? 'legacy.ruins' : id) || null,
    has:id => records.has(id === 'ruins' ? 'legacy.ruins' : id),
    draw(ctx, id) { const found = this.source(id); if (!found) return false; ctx.drawImage(found.image); return true; }
  });
  const ctx = drawingContext();
  assert.equal(typeof env.AetherArt.drawWorldObject, 'function');
  assert.equal(env.AetherArt.drawWorldObject(ctx, 'landmark.mist.unknown', 10, 20, { height:120 }), true);
  assert.deepEqual(ctx.images, ['legacy-ruins'], 'painterly world fallback must win over a geometric zone placeholder');
}

function testManifestVersionAndCoverage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  const version = game.match(/BUILD_VERSION\s*=\s*'([^']+)'/)[1];
  assert.equal(manifest.buildVersion, version, 'asset manifest must invalidate PWA tier caches with the release');
  const zoneEnv = loadBrowserScript('zone-visuals.js');
  for (const tier of manifest.tiers) {
    const ids = new Set(manifest.records.filter(record => record.tier === tier).map(record => record.id));
    for (const zone of Object.values(zoneEnv.AetherZoneVisuals.ZONES)) {
      for (const item of [...zone.landmarks, zone.camp, zone.portal, ...zone.ambient]) assert.ok(ids.has(item.id), `${tier} is missing ${item.id}`);
      for (const id of Object.values(zone.resources)) assert.ok(ids.has(id), `${tier} is missing ${id}`);
    }
  }
}


function testReleaseVersionConsistency() {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const appManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const assetManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
  const version = game.match(/BUILD_VERSION\s*=\s*'([^']+)'/)[1];
  assert.equal(sw.match(/const VERSION\s*=\s*'([^']+)'/)[1], version);
  assert.equal(appManifest.version, version);
  assert.equal(assetManifest.buildVersion, version);
  assert.ok(index.includes(`<title>Aethernfall v${version}</title>`));
  assert.ok(index.includes(`game.js?v=${version}`));
  assert.ok(index.includes(`style.css?v=${version}`));
}


function testPainterlyFallbackCoverage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
  const required = ['legacy.house','legacy.oak','legacy.pine','legacy.rock','legacy.ruins','legacy.shrine','legacy.herb','legacy.wood','legacy.ore'];
  for (const tier of manifest.tiers) {
    const ids = new Set(manifest.records.filter(record => record.tier === tier).map(record => record.id));
    for (const id of required) assert.ok(ids.has(id), `${tier} is missing painterly fallback ${id}`);
  }
}

const tests = [testEquipmentLayers, testPainterlyPlayerEquipment, testVisibleCollisionPlan, testWorldObjectFallback, testManifestVersionAndCoverage, testReleaseVersionConsistency, testPainterlyFallbackCoverage];
let failures = 0;
for (const test of tests) {
  try { test(); console.log(`PASS ${test.name}`); }
  catch (error) { failures++; console.error(`FAIL ${test.name}: ${error.message}`); }
}
if (failures) process.exitCode = 1;
