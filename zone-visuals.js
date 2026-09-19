"use strict";

/* Aethernfall 5.1.9 — immutable world visual registry. */
(() => {
  'use strict';
  const PORTAL_STATES = Object.freeze(['locked','charging','open','transition','completed']);
  const TERRAIN_KEYS = Object.freeze(['base','path','secondary','hazard','arena','decals']);
  const slug = Object.freeze({mistwood:'mist',stonevale:'stone',ashfield:'ash',frostmere:'frost',starreach:'star'});
  const terrain = zone => Object.freeze(Object.fromEntries(TERRAIN_KEYS.map(key => [key, `terrain.${slug[zone]}.${key}`])));
  const ambient = (zone, names, heights, footprints) => Object.freeze(names.map((name, index) => Object.freeze({
    id:`prop.${slug[zone]}.${name}`, height:heights[index], footprint:footprints[index]
  })));
  const landmark = (zone, id, x, y, name, footprint, height) => Object.freeze({
    id:`landmark.${slug[zone]}.${id}`, x, y, name, footprint, height
  });
  const ZONES = Object.freeze({
    mistwood:Object.freeze({
      terrain:terrain('mistwood'),
      landmarks:Object.freeze([
        landmark('mistwood','whispering_grove',940,440,'Шепчущая чаща',58,164),
        landmark('mistwood','sunken_ruins',1540,1030,'Затонувшие руины',54,148),
        landmark('mistwood','dew_shrine',2150,540,'Святилище росы',42,132),
        landmark('mistwood','watch_stone',2440,1320,'Камень туманного дозора',44,138)
      ]),
      camp:Object.freeze({id:'camp.mist.road_lodge',height:154,footprint:48}),
      portal:Object.freeze({id:'portal.mist.root_gate',height:148,footprint:43}),
      ambient:ambient('mistwood',['elder_pine','crooked_oak','fern_cluster','moss_boulder','root_arch','reed_patch','fallen_log','mushroom_ring','willow_stump','firefly_bush'],[126,116,44,52,82,42,46,34,58,48],[20,22,8,18,18,7,17,6,14,10]),
      resources:Object.freeze({herb:'resource.mist.herb',wood:'resource.mist.wood'}),
      path:Object.freeze([[360,500],[940,440],[1540,1030],[2100,850],[2440,1320]]), hazard:Object.freeze({x:1940,y:620,rx:160,ry:48})
    }),
    stonevale:Object.freeze({
      terrain:terrain('stonevale'),
      landmarks:Object.freeze([
        landmark('stonevale','old_watch',820,480,'Старый дозор',56,158),
        landmark('stonevale','silver_mine',1500,840,'Серебряный рудник',60,146),
        landmark('stonevale','shattered_arch',2180,520,'Расколотая арка',48,154),
        landmark('stonevale','watch_rift',2360,1320,'Раскол дозорных',52,142)
      ]),
      camp:Object.freeze({id:'camp.stone.quarry_watch',height:154,footprint:48}),
      portal:Object.freeze({id:'portal.stone.rune_arch',height:148,footprint:43}),
      ambient:ambient('stonevale',['slate_spire','quarry_cart','silver_vein','dust_shrub','broken_column','rope_post','stone_stack','mine_lantern','chisel_rack','watch_brazier'],[72,48,44,34,76,48,46,42,44,58],[21,17,14,8,20,10,16,8,10,15]),
      resources:Object.freeze({ore:'resource.stone.ore',herb:'resource.stone.herb'}),
      path:Object.freeze([[340,520],[820,480],[1500,840],[1680,720],[2180,520],[2360,1320]]), hazard:Object.freeze({x:1880,y:1120,rx:138,ry:42})
    }),
    ashfield:Object.freeze({
      terrain:terrain('ashfield'),
      landmarks:Object.freeze([
        landmark('ashfield','ash_outpost',940,500,'Пепельный пост',58,154),
        landmark('ashfield','charred_arena',1760,1240,'Обугленная арена',66,132),
        landmark('ashfield','spark_shrine',1260,930,'Святилище искры',43,138),
        landmark('ashfield','beacon',700,1360,'Пепельный маяк',48,166)
      ]),
      camp:Object.freeze({id:'camp.ash.guard_post',height:154,footprint:48}),
      portal:Object.freeze({id:'portal.ash.ember_gate',height:148,footprint:43}),
      ambient:ambient('ashfield',['charred_tree','slag_boulder','ember_vent','burned_cart','ash_reeds','iron_stake','coal_heap','scorched_banner','furnace_pipe','cinder_bush'],[104,54,42,48,38,58,42,68,62,44],[19,18,9,16,7,9,15,10,13,8]),
      resources:Object.freeze({wood:'resource.ash.wood',ore:'resource.ash.ore'}),
      path:Object.freeze([[2040,1020],[1880,1120],[1760,1240],[1260,930],[940,500],[330,420]]), hazard:Object.freeze({x:1460,y:610,rx:150,ry:40})
    }),
    frostmere:Object.freeze({
      terrain:terrain('frostmere'),
      landmarks:Object.freeze([
        landmark('frostmere','icewalker_shelter',720,520,'Приют ледоходов',56,150),
        landmark('frostmere','rime_circle',1480,780,'Круг инея',48,126),
        landmark('frostmere','watch_tower',2260,480,'Башня дозорных',54,168),
        landmark('frostmere','winter_mirror',2100,1370,'Зеркало зимы',58,146)
      ]),
      camp:Object.freeze({id:'camp.frost.icewalker_tent',height:154,footprint:48}),
      portal:Object.freeze({id:'portal.frost.ice_lens',height:148,footprint:43}),
      ambient:ambient('frostmere',['snow_pine','ice_spire','frozen_shrub','rime_boulder','sled_wreck','frost_lantern','bone_marker','snow_drift','ice_reeds','crystal_cluster'],[116,74,40,52,44,48,54,30,42,48],[20,16,8,18,15,8,10,7,7,13]),
      resources:Object.freeze({herb:'resource.frost.herb',ore:'resource.frost.ore'}),
      path:Object.freeze([[360,560],[720,520],[1480,780],[2100,1370],[2420,760]]), hazard:Object.freeze({x:1740,y:1120,rx:164,ry:50})
    }),
    starreach:Object.freeze({
      terrain:terrain('starreach'),
      landmarks:Object.freeze([
        landmark('starreach','last_camp',620,1370,'Последний привал',54,146),
        landmark('starreach','broken_observatory',1260,980,'Разбитая обсерватория',62,164),
        landmark('starreach','star_well',2050,520,'Колодец звёзд',48,138),
        landmark('starreach','rift_heart',2310,1260,'Сердце разлома',62,158)
      ]),
      camp:Object.freeze({id:'camp.star.observer_refuge',height:154,footprint:48}),
      portal:Object.freeze({id:'portal.star.rift_ring',height:148,footprint:43}),
      ambient:ambient('starreach',['violet_spire','orbit_stone','star_bloom','rift_shard','telescope_wreck','astral_reeds','constellation_post','void_bush','meteor_fragment','lumen_orb'],[76,48,38,62,52,42,58,44,46,36],[18,12,7,14,16,7,9,8,13,6]),
      resources:Object.freeze({wood:'resource.star.wood',ore:'resource.star.ore'}),
      path:Object.freeze([[420,1420],[620,1370],[1260,980],[2050,520],[2310,1260],[360,340]]), hazard:Object.freeze({x:1720,y:760,rx:154,ry:46})
    })
  });
  function hash(zoneId, seed) {
    let value = 2166136261;
    for (const char of `${zoneId}:${seed}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return value >>> 0;
  }
  function chooseAmbient(zoneId, seed, x, y, placed = []) {
    const list = ZONES[zoneId]?.ambient || ZONES.mistwood.ambient;
    const start = hash(zoneId, seed) % list.length;
    for (let offset = 0; offset < list.length; offset++) {
      const candidate = list[(start + offset) % list.length];
      if (!placed.some(item => item.visualId === candidate.id && Math.hypot(item.x - x, item.y - y) <= 720)) {
        return Object.freeze({...candidate, frame:hash(zoneId, Number(seed) + 7919) % 2});
      }
    }
    const candidate = list[start];
    return Object.freeze({...candidate, frame:hash(zoneId, Number(seed) + 7919) % 2});
  }
  const portalFrame = state => Math.max(0, PORTAL_STATES.indexOf(state));
  globalThis.AetherZoneVisuals = Object.freeze({ ZONES, PORTAL_STATES, chooseAmbient, portalFrame });
})();
