"use strict";

/* Aethernfall 5.1.3 — bounded allocation-free decorative VFX pool. */
(() => {
  'use strict';
  const EFFECT_IDS = Object.freeze([
    'vfx.foundation.impact','vfx.foundation.secondary','vfx.foundation.emissive',
    'vfx.combat.slash_1','vfx.combat.slash_2','vfx.combat.slash_3','vfx.combat.crit','vfx.combat.wind_slash',
    'vfx.combat.triple_pulse_core','vfx.combat.triple_pulse_trail','vfx.combat.triple_pulse_impact','vfx.combat.second_wind','vfx.combat.heal_tick',
    'vfx.defense.block','vfx.defense.perfect_block','vfx.defense.riposte_ready','vfx.defense.dodge_afterimage',
    'vfx.hit.flesh','vfx.hit.stone','vfx.hit.armor','vfx.hit.beast',
    'vfx.death.humanoid','vfx.death.beast','vfx.death.construct','vfx.death.rift',
    'vfx.arena.boundary_idle','vfx.arena.boundary_active','vfx.arena.wave_transition','vfx.arena.boss_entry','vfx.arena.victory','vfx.arena.defeat',
    'vfx.portal.mist','vfx.portal.stone','vfx.portal.ash','vfx.portal.frost','vfx.portal.star',
    'vfx.world.mist_mote','vfx.world.stone_dust','vfx.world.ash_cinder','vfx.world.snowflake','vfx.world.star_mote',
    'vfx.reward.gold','vfx.reward.resource','vfx.reward.gear','vfx.reward.quest','vfx.reward.discovery','vfx.reward.quest_complete','vfx.reward.level_up',
    'vfx.projectile.arrow_mist.head','vfx.projectile.arrow_mist.trail','vfx.projectile.arrow_mist.impact',
    'vfx.projectile.arrow_stone.head','vfx.projectile.arrow_stone.trail','vfx.projectile.arrow_stone.impact',
    'vfx.projectile.arrow_ash.head','vfx.projectile.arrow_ash.trail','vfx.projectile.arrow_ash.impact',
    'vfx.projectile.arrow_frost.head','vfx.projectile.arrow_frost.trail','vfx.projectile.arrow_frost.impact',
    'vfx.projectile.arrow_star.head','vfx.projectile.arrow_star.trail','vfx.projectile.arrow_star.impact',
    'vfx.projectile.thorn_seed.head','vfx.projectile.thorn_seed.trail','vfx.projectile.thorn_seed.impact',
    'vfx.projectile.guardian_core.head','vfx.projectile.guardian_core.trail','vfx.projectile.guardian_core.impact',
    'vfx.projectile.ember_lance.head','vfx.projectile.ember_lance.trail','vfx.projectile.ember_lance.impact',
    'vfx.projectile.ice_shard.head','vfx.projectile.ice_shard.trail','vfx.projectile.ice_shard.impact',
    'vfx.projectile.rift_spear.head','vfx.projectile.rift_spear.trail','vfx.projectile.rift_spear.impact'
  ]);
  const INDEX = new Map(EFFECT_IDS.map((id,index) => [id,index]));
  // Effects that read as light/energy rather than solid matter get additive blending
  // so they glow against dark terrain instead of looking like a flat alpha sticker.
  const GLOW_IDS = Object.freeze([
    'vfx.combat.crit','vfx.combat.triple_pulse_core','vfx.combat.triple_pulse_trail','vfx.combat.second_wind','vfx.combat.heal_tick',
    'vfx.defense.perfect_block','vfx.defense.riposte_ready',
    'vfx.arena.boundary_active','vfx.arena.wave_transition','vfx.arena.boss_entry','vfx.arena.victory',
    'vfx.portal.mist','vfx.portal.ash','vfx.portal.frost','vfx.portal.star',
    'vfx.world.star_mote',
    'vfx.reward.discovery','vfx.reward.quest_complete','vfx.reward.level_up',
    'vfx.projectile.ember_lance.head','vfx.projectile.ember_lance.trail',
    'vfx.projectile.ice_shard.head','vfx.projectile.ice_shard.trail',
    'vfx.projectile.rift_spear.head','vfx.projectile.rift_spear.trail',
    'vfx.projectile.guardian_core.head','vfx.projectile.guardian_core.trail',
    'vfx.death.rift'
  ]);
  const glow = new Uint8Array(EFFECT_IDS.length);
  GLOW_IDS.forEach(id => { const i = INDEX.get(id); if (i !== undefined) glow[i] = 1; });

  function create({capacity=64}={}) {
    capacity=Math.max(1,Math.min(256,Math.floor(Number(capacity)||64)));
    const active=new Uint8Array(capacity), type=new Uint16Array(capacity), secondary=new Uint8Array(capacity);
    const x=new Float32Array(capacity), y=new Float32Array(capacity), vx=new Float32Array(capacity), vy=new Float32Array(capacity);
    const life=new Float32Array(capacity), maxLife=new Float32Array(capacity), dir=new Float32Array(capacity), size=new Float32Array(capacity);
    let activeCount=0, cursor=0, limit=capacity;

    function clearSlot(index) { if(active[index]) { active[index]=0; activeCount--; } }
    function spawn(id,options={}) {
      const effect=INDEX.get(id); if(effect===undefined||limit<=0)return false;
      let slot=-1;
      for(let scan=0;scan<capacity;scan++){const candidate=(cursor+scan)%capacity;if(!active[candidate]){slot=candidate;break;}}
      if(slot<0||activeCount>=limit){slot=cursor;clearSlot(slot);}
      cursor=(slot+1)%capacity; active[slot]=1; activeCount++; type[slot]=effect; secondary[slot]=options.secondary?1:0;
      x[slot]=Number(options.x)||0; y[slot]=Number(options.y)||0; vx[slot]=Number(options.vx)||0; vy[slot]=Number(options.vy)||0;
      life[slot]=Math.max(.01,Number(options.life)||.35); maxLife[slot]=life[slot]; dir[slot]=Number(options.dir)||0; size[slot]=Math.max(8,Number(options.size)||64);
      return true;
    }
    function update(dt) {
      dt=Math.max(0,Number(dt)||0);
      for(let i=0;i<capacity;i++){
        if(!active[i])continue;
        life[i]-=dt;
        if(life[i]<=0){clearSlot(i);continue;}
        x[i]+=vx[i]*dt; y[i]+=vy[i]*dt;
      }
    }
    function draw(ctx, assets, camera) {
      if(!ctx||!assets?.drawVfxFrame||!camera)return;
      const scaleY=Number(camera.scaleY)||1, width=Number(camera.width)||0, height=Number(camera.height)||0;
      for(let i=0;i<capacity;i++){
        if(!active[i])continue;
        const sx=x[i]-camera.x+width*.5+(camera.offsetX||0), sy=(y[i]-camera.y)*scaleY+height*.5+(camera.offsetY||0);
        if(sx<-size[i]||sx>width+size[i]||sy<-size[i]||sy>height+size[i])continue;
        const progress=1-life[i]/maxLife[i], frame=Math.max(0,Math.min(5,Math.floor(progress*6)));
        assets.drawVfxFrame(ctx,EFFECT_IDS[type[i]],sx,sy,size[i],frame,dir[i],Math.max(0,life[i]/maxLife[i]),glow[type[i]]?'lighter':null);
      }
    }
    function setLimit(value) {
      limit=Math.max(1,Math.min(capacity,Math.floor(Number(value)||1)));
      for(let pass=0;pass<2&&activeCount>limit;pass++)for(let i=0;i<capacity&&activeCount>limit;i++)if(active[i]&&(pass||secondary[i]))clearSlot(i);
      return limit;
    }
    function clear(){active.fill(0);activeCount=0;cursor=0;}
    function snapshot(){return {capacity,limit,active:activeCount,typedArrays:active instanceof Uint8Array};}
    function storage(){return {active,type,secondary,x,y,vx,vy,life,maxLife,dir,size};}
    return Object.freeze({spawn,update,draw,clear,setLimit,snapshot,storage});
  }
  globalThis.AetherVfx=Object.freeze({create,EFFECT_IDS});
})();
