(()=>{'use strict';
const BUILD_VERSION='3.2.0';
const $=id=>document.getElementById(id);const canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});const mcanvas=$('minimap'),mctx=mcanvas.getContext('2d',{alpha:false});
const ui={hp:$('hpFill'),stamina:$('staminaFill'),xp:$('xpFill'),level:$('levelText'),zone:$('zoneText'),objective:$('objectiveText'),questTitle:$('questTitle'),questProgress:$('questProgress'),toast:$('toast'),modal:$('modal'),modalTitle:$('modalTitle'),modalBody:$('modalBody'),prompt:$('interactPrompt'),promptText:$('interactText'),badge:$('zoneBadge'),loading:$('loadingOverlay'),loadText:$('loadText'),loadFill:$('loadFill'),herb:$('herbCount'),wood:$('woodCount'),ore:$('oreCount'),gold:$('goldCount'),perf:$('perfMonitor'),perfFps:$('perfFps'),perfTarget:$('perfTarget'),perfFrame:$('perfFrame'),perfRender:$('perfRender'),perfScale:$('perfScale'),perfDevice:$('perfDevice'),lootTicker:$('lootTicker'),perfPill:$('perfPill'),perfPillFps:$('perfPillFps'),perfPillMs:$('perfPillMs'),netPill:$('netPill')};

// Убран жесткий return, чтобы можно было тестировать на ПК мышкой.
const touchCap=('ontouchstart'in window)||navigator.maxTouchPoints>0;
if(!touchCap){console.warn('Touch not detected. Mouse fallback enabled.');}

const device={ram:Number.isFinite(Number(navigator.deviceMemory))?Number(navigator.deviceMemory):null,cores:Number(navigator.hardwareConcurrency)||4,dpr:Math.min(devicePixelRatio||1,2.5),ios:/iPhone|iPad|iPod/i.test(navigator.userAgent),android:/Android/i.test(navigator.userAgent)};
const QUALITY={low:{render:.68,ambient:18,enemyCap:8,particles:12,textureScale:.44,shadow:.06,fog:.07,detail:0},medium:{render:.80,ambient:28,enemyCap:12,particles:20,textureScale:.60,shadow:.16,fog:.12,detail:1},high:{render:.92,ambient:40,enemyCap:17,particles:30,textureScale:.76,shadow:.26,fog:.17,detail:2},'very-high':{render:1.00,ambient:54,enemyCap:22,particles:42,textureScale:.88,shadow:.36,fog:.21,detail:3}};
const FPS=[30,40,45,60,90,120];const detected=(device.ram>=8&&device.cores>=8)?'high':(device.ram>=6&&device.cores>=6)?'high':(device.ram>=4&&device.cores>=4)?'medium':'low';
let settings={quality:localStorage.getItem('aef_quality')||detected,fps:Number(localStorage.getItem('aef_fps')||60)};if(!QUALITY[settings.quality])settings.quality=detected;if(!FPS.includes(settings.fps))settings.fps=60;let profile=QUALITY[settings.quality];

// ИСПРАВЛЕНИЕ 1: Добавлено объявление lastFrame=0
let W=innerWidth,H=innerHeight,DPR=1,time=0,lastNow=performance.now(),rafId=0,transitioning=false,perfMonitorEnabled=localStorage.getItem('aef_perf_monitor')==='1',perfLastGameFrame=0,perfFrameCount=0,perfRenderTotal=0,perfFrameGapTotal=0,perfWindowStart=performance.now(),perfActualFps=0,perfAvgFrameMs=0,perfAvgRenderMs=0,rafLastNow=0,nextRenderAt=0,lastFrame=0,frameAccumulator=0,mapAccumulator=0,uiAccumulator=0;
const drawables=[];
const drawCampMarker={y:0,type:'camp'},drawScoutMarker={y:0,type:'scout'},drawPortalMarker={y:0,type:'portal'},drawPlayerMarker={y:0,type:'player'};
const uiCache={};
let rafCallbackCount=0,rafCallbackWindow=performance.now(),rafCallbackRate=0;

const WORLD={w:2800,h:1800};const SAVE='aethernfall_save_v30';
const LEGACY_SAVES=['aethernfall_save_v27','aethernfall_save_v21','aethernfall_save_v11'];
const zones={
 mistwood:{name:'Туманный лес',badge:'ЛЕС',base:'#0e1a15',ground:'#2f5538',accent:'#83b07a',water:'#2b6872',scout:{x:470,y:420},camp:{x:360,y:500},portal:{x:2100,y:850},quest:{id:'mist',title:'Следы в тумане',steps:['Поговорите с разведчиком','Соберите 3 травы','Победите 4 налётчиков','Перейдите в Каменную долину']},next:'stonevale',resources:['herb','wood']},
 stonevale:{name:'Каменная долина',badge:'РУИНЫ',base:'#292c2c',ground:'#6a6558',accent:'#c1a876',water:'#456167',scout:{x:450,y:430},camp:{x:340,y:520},portal:{x:210,y:820},quest:{id:'stone',title:'Пепел старого мира',steps:['Поговорите с разведчиком','Соберите 2 руды','Победите стража руин','Перейдите в Пепельные поля']},next:'ashfield',resources:['ore','herb']},
 ashfield:{name:'Пепельные поля',badge:'ПЕПЕЛ',base:'#332522',ground:'#735c4b',accent:'#d09564',water:'#66484b',scout:{x:1880,y:1120},camp:{x:2040,y:1020},portal:{x:330,y:420},quest:{id:'ash',title:'Осколок пламени',steps:['Поговорите с хранителем','Соберите 4 древесины','Победите 6 врагов','Вернитесь в Туманный лес']},next:'mistwood',resources:['wood','ore']}
};
const player={x:360,y:500,r:21,hp:240,maxHp:240,stamina:100,maxStamina:100,level:6,xp:34,xpNeed:160,gold:125,damage:32,dir:0,speed:205,attackCd:0,dodgeUntil:0,dodgeCd:0,blocking:false,combo:0,comboTimer:0,inv:{wood:0,ore:0,herb:0},equipment:{weapon:'Меч следопыта',armor:'Панцирь следопыта'},quests:{mist:{step:0,herb:0,kills:0},stone:{step:0,ore:0,guardian:0},ash:{step:0,wood:0,kills:0}}};
let zoneId='mistwood',entities=[],particles=[],projectiles=[],ambient=[],textureImages={},patterns={},interactionLock=0;
let lootDrops=[],floatingTexts=[];
const LOOT_TABLE={
  common:[
    {id:'coin',label:'Монеты',chance:.72,count:6},
    {id:'herb',label:'Лекарственная трава',chance:.18,count:1},
    {id:'wood',label:'Древесина',chance:.10,count:1}
  ],
  guardian:[
    {id:'coin',label:'Монеты',chance:.55,count:35},
    {id:'ore',label:'Серебряная руда',chance:.25,count:1},
    {id:'guardianToken',label:'Знак стража',chance:.20,count:1}
  ]
};

const look={ids:new Set(),lastX:0};
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b))}function rng(seed){const x=Math.sin(seed*928.371)*43758.5453;return x-Math.floor(x)}

function updateNetworkStatus(){
 const online=navigator.onLine!==false;
 if(ui.netPill){
  ui.netPill.textContent=online?'● ONLINE':'● OFFLINE';
  ui.netPill.classList.toggle('online',online);
  ui.netPill.classList.toggle('offline',!online);
 }
}
addEventListener('online',updateNetworkStatus,{passive:true});
addEventListener('offline',updateNetworkStatus,{passive:true});


function migrateLegacySave(){
 if(localStorage.getItem(SAVE))return;
 for(const key of LEGACY_SAVES){
   const raw=localStorage.getItem(key);
   if(!raw)continue;
   try{localStorage.setItem(SAVE,raw);return}catch{}
 }
}
migrateLegacySave();

function save(){try{localStorage.setItem(SAVE,JSON.stringify({zoneId,player,settings}))}catch(_){}}
function load(){try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');if(!s)return;zoneId=zones[s.zoneId]?s.zoneId:zoneId;Object.assign(player,s.player||{});player.inv=Object.assign({wood:0,ore:0,herb:0},player.inv||{});player.equipment=Object.assign({weapon:'Меч следопыта',armor:'Панцирь следопыта'},player.equipment||{});player.quests=Object.assign({mist:{step:0,herb:0,kills:0},stone:{step:0,ore:0,guardian:0},ash:{step:0,wood:0,kills:0}},player.quests||{});for(const k of Object.keys(player.quests))player.quests[k]=Object.assign(k==='mist'?{step:0,herb:0,kills:0}:k==='stone'?{step:0,ore:0,guardian:0}:{step:0,wood:0,kills:0},player.quests[k]||{});settings=Object.assign(settings,s.settings||{});if(!QUALITY[settings.quality])settings.quality=detected;if(!FPS.includes(Number(settings.fps)))settings.fps=60;settings.fps=Number(settings.fps)}catch(_){}}
load();
function toast(t){ui.toast.textContent=t;ui.toast.style.opacity=1;clearTimeout(toast._t);toast._t=setTimeout(()=>ui.toast.style.opacity=0,1900)}
function effectiveRenderScale(){return clamp(profile.render,.50,1)}
function resetFrameLimiter(now=performance.now()){lastNow=now;rafLastNow=now;nextRenderAt=now;lastFrame=0;frameAccumulator=0;mapAccumulator=0;perfLastGameFrame=0;perfFrameCount=0;perfRenderTotal=0;perfFrameGapTotal=0;perfWindowStart=now;perfActualFps=0;perfAvgFrameMs=0;perfAvgRenderMs=0;rafCallbackCount=0;rafCallbackWindow=now;rafCallbackRate=0}
function applyGraphics(){
 profile=QUALITY[settings.quality]||QUALITY.medium;
 const deviceDpr=Math.min(device.dpr||1,2.5);
 // User-selected quality controls render scale. No FPS/thermal adaptive resolution.
 DPR=clamp(deviceDpr*effectiveRenderScale(),.5,2.5);
 W=Math.max(1,innerWidth);H=Math.max(1,innerHeight);
 canvas.width=Math.max(1,Math.floor(W*DPR));
 canvas.height=Math.max(1,Math.floor(H*DPR));
 canvas.style.width=W+'px';canvas.style.height=H+'px';
 ctx.setTransform(DPR,0,0,DPR,0,0);ctx.imageSmoothingEnabled=true;
 patterns={};
 for(const [k,img] of Object.entries(textureImages)){if(img.complete)patterns[k]=ctx.createPattern(img,'repeat')}
 makeAmbient();
}
addEventListener('resize',()=>{applyGraphics();resetFrameLimiter()},{passive:true});
document.addEventListener('visibilitychange',()=>{resetFrameLimiter()});
function loadTextures(){
  const names=['grass','dirt','stone','water','wood','foliage','rune','leather','parchment'];
  let done=0;
  const mark=()=>{done++;ui.loadFill.style.width=(15+done/names.length*35)+'%'};
  return Promise.allSettled(names.map(name=>new Promise(resolve=>{
    const im=new Image();let settled=false;
    const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);if(ok)textureImages[name]=im;mark();resolve({name,ok});};
    const timer=setTimeout(()=>finish(false),1200);
    im.onload=()=>finish(true);im.onerror=()=>finish(false);
    im.decoding='async';
    im.src=new URL(`assets/textures/${name}.png`,document.baseURI).href;
  })));
}
function quest(){return zones[zoneId].quest}function questState(){return player.quests[quest().id]}

function questHint(){
 const s=questState(),q=quest();
 if(s.step===0)return 'Найдите отмеченного NPC и взаимодействуйте.';
 if(q.id==='mist'&&s.step===1)return `Травы: ${s.herb}/3`;
 if(q.id==='mist'&&s.step===2)return `Налётчики: ${s.kills}/4`;
 if(q.id==='stone'&&s.step===1)return `Руда: ${s.ore}/2`;
 if(q.id==='stone'&&s.step===2)return `Страж: ${s.guardian}/1`;
 if(q.id==='ashfield'&&s.step===1)return `Древесина: ${s.wood}/4`;
 if(q.id==='ashfield'&&s.step===2)return `Враги: ${s.kills}/6`;
 return q.steps[Math.min(s.step,q.steps.length-1)];
}

function currentObjective(){const q=quest(),s=questState(),step=q.steps[Math.min(s.step,q.steps.length-1)];if(q.id==='mist'&&s.step===1)return `Соберите траву: ${s.herb}/3`;if(q.id==='mist'&&s.step===2)return `Победите налётчиков: ${s.kills}/4`;if(q.id==='stone'&&s.step===1)return `Соберите руду: ${s.ore}/2`;if(q.id==='ash'&&s.step===1)return `Соберите древесину: ${s.wood}/4`;if(q.id==='ash'&&s.step===2)return `Победите врагов: ${s.kills}/6`;return step}
function advanceQuest(reason){const q=quest(),s=questState();if(q.id==='mist'){if(s.step===0&&reason==='scout')s.step=1;else if(s.step===1&&s.herb>=3)s.step=2;else if(s.step===2&&s.kills>=4)s.step=3;else if(s.step===3&&reason==='portal')s.step=0}else if(q.id==='stone'){if(s.step===0&&reason==='scout')s.step=1;else if(s.step===1&&s.ore>=2)s.step=2;else if(s.step===2&&s.guardian>=1)s.step=3;else if(s.step===3&&reason==='portal')s.step=0}else if(q.id==='ash'){if(s.step===0&&reason==='scout')s.step=1;else if(s.step===1&&s.wood>=4)s.step=2;else if(s.step===2&&s.kills>=6)s.step=3;else if(s.step===3&&reason==='portal')s.step=0}save()}
function addEnemy(type,x,y){const cap=entities.filter(e=>e.kind==='enemy'&&e.type!=='guardian').length;if(type!=='guardian'&&cap>=profile.enemyCap)return;const e={kind:'enemy',type,x,y,r:18,hp:100,maxHp:100,speed:76,damage:10,cd:0,hit:0,seed:rng(x+y),stun:0};if(type==='raider')Object.assign(e,{r:21,hp:140,maxHp:140,speed:82,damage:12});if(type==='boar')Object.assign(e,{r:19,hp:95,maxHp:95,speed:108,damage:9});if(type==='guardian')Object.assign(e,{r:40,hp:620,maxHp:620,speed:48,damage:22});entities.push(e)}
function addResource(kind,x,y){entities.push({kind:'resource',type:kind,x,y,r:20,hp:1,maxHp:1,pulse:rng(x*y)*Math.PI*2})}
function makeAmbient(){ambient=[];for(let i=0;i<profile.ambient;i++)ambient.push({x:60+rng(i+7)*(WORLD.w-120),y:60+rng(i+91)*(WORLD.h-120),kind:rng(i+201),scale:.65+rng(i+44)*1.55,seed:i})}
function resetZone(){entities=[];particles=[];projectiles=[];const z=zones[zoneId];player.x=z.camp.x;player.y=z.camp.y;player.dir=0;for(let i=0;i<58;i++){const x=150+rng(i+300+zoneId.length)*(WORLD.w-300),y=150+rng(i+620+zoneId.length*7)*(WORLD.h-300);let type=i%4?'raider':'boar';if(zoneId==='ashfield'&&i%5===0)type='boar';addEnemy(type,x,y)}for(let i=0;i<32;i++){const x=150+rng(i+1200+zoneId.length)*(WORLD.w-300),y=150+rng(i+1700+zoneId.length*3)*(WORLD.h-300),kind=i%3===0?z.resources[0]:z.resources[1];addResource(kind,x,y)}if(zoneId==='stonevale')addEnemy('guardian',1680,720);makeAmbient()}
function burst(x,y,color,count=10,speed=110){const room=Math.max(0,profile.particles-particles.length);count=Math.min(count,room);for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,v=(.25+Math.random())*speed;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.32+Math.random()*.48,max:.8,size:1.5+Math.random()*3.8,color})}}
function addFloatingText(text,x,y,color='#fff2bf'){if(floatingTexts.length>=48)floatingTexts.shift();floatingTexts.push({text,x,y,color,life:.85,max:.85})}
function gainXP(n){player.xp+=n;while(player.xp>=player.xpNeed){player.xp-=player.xpNeed;player.level++;player.xpNeed=Math.round(player.xpNeed*1.24);player.maxHp+=18;player.hp=player.maxHp;player.damage+=3;toast('Новый уровень — '+player.level)}}

function lootLabel(id,count){
 const names={coin:'Золото',herb:'Трава',wood:'Древесина',ore:'Серебряная руда',guardianToken:'Знак стража',emberShard:'Осколок пламени'};
 return `${names[id]||id} ×${count}`;
}

function spawnLootFromEnemy(e){
 const table=e.type==='guardian'?LOOT_TABLE.guardian:LOOT_TABLE.common;
 const roll=Math.random();let acc=0;
 for(const d of table){
  acc+=d.chance;
  if(roll<=acc){
   lootDrops.push({id:d.id,label:d.label,count:d.count+(d.id==='coin'&&e.type==='guardian'?Math.floor(Math.random()*20):0),x:e.x+(Math.random()*24-12),y:e.y+(Math.random()*24-12),life:22});
   break;
  }
 }
}
function kill(e){
 e.hp=0;e._corpseUntil=time+0.75;
 gainXP(e.type==='guardian'?120:18);
 player.gold+=e.type==='guardian'?90:4+Math.floor(Math.random()*5);
 spawnLootFromEnemy(e);
 const s=questState();
 if(zoneId==='mistwood'&&quest().id==='mist'&&s.step===2&&e.type==='raider'){s.kills++;advanceQuest('kill')}
 if(zoneId==='stonevale'&&e.type==='guardian'&&s.step===2){s.guardian++;advanceQuest('kill');toast('Страж руин повержен!')}
 if(zoneId==='ashfield'&&s.step===2){s.kills++;advanceQuest('kill')}
 burst(e.x,e.y,e.type==='guardian'?'#ceb1ea':'#e27677',24,155);
 save()
}
function hitTarget(e,dmg){if(e.hp<=0)return;e.hp-=dmg;e.hit=.16;burst(e.x,e.y,'#efcfa8',9,118);if(e.hp<=0)kill(e)}
function nearest(filter,max=120){let best=null,bd=max;for(const e of entities)if(e.hp>0&&filter(e)){const d=dist(player,e);if(d<bd){bd=d;best=e}}return best}
function attack(){if(player.attackCd>0||transitioning)return;player.attackCd=.42;player.combo=player.comboTimer>0?Math.min(3,player.combo+1):1;player.comboTimer=.9;const target=nearest(e=>e.kind==='enemy',155);if(target)player.dir=Math.atan2(target.y-player.y,target.x-player.x);const a=player.dir;let hits=0;for(const e of entities){if(e.hp<=0||e.kind!=='enemy')continue;const d=dist(player,e),ea=Math.atan2(e.y-player.y,e.x-player.x);if(d<104+e.r&&Math.abs(angleDiff(ea,a))<1.05){const crit=Math.random()<.12;const amount=player.damage*(crit?1.5:1)*(1+(.10*Math.max(0,player.combo-1)));hitTarget(e,Math.round(amount));addFloatingText(crit?'КРИТ!':String(Math.round(amount)),e.x,e.y-e.r-18,crit?'#ffe08a':'#f4d3a3');hits++}}burst(player.x+Math.cos(a)*36,player.y+Math.sin(a)*36,'#e4bf69',hits?12+player.combo*2:5,95)}
function dodge(){if(player.dodgeCd>time||player.stamina<24||transitioning)return;player.stamina-=24;player.dodgeCd=time+.78;player.dodgeUntil=time+.28;const mx=joy.x,my=joy.y,mag=Math.hypot(mx,my)||1;player.x=clamp(player.x+(mx/mag)*125,70,WORLD.w-70);player.y=clamp(player.y+(my/mag)*125,70,WORLD.h-70);burst(player.x,player.y,'#91c6cc',16,145);toast('Уклонение')}
function skill(n){if(player.stamina<20){toast('Недостаточно выносливости');return}player.stamina-=20;const a=player.dir;if(n===1){let hits=0;for(const e of entities){if(e.hp<=0||e.kind!=='enemy')continue;const d=dist(player,e),ea=Math.atan2(e.y-player.y,e.x-player.x);if(d<165&&Math.abs(angleDiff(ea,a))<1.3){hitTarget(e,Math.round(player.damage*1.85));hits++}}burst(player.x,player.y,'#8fc4e3',26,160);toast(hits?`Разрез ветра: ${hits} попад.`:'Разрез ветра — мимо')}else if(n===2){for(let i=0;i<3;i++){const aa=a+(i-1)*.15;projectiles.push({x:player.x+Math.cos(a)*24,y:player.y+Math.sin(a)*24,vx:Math.cos(aa)*480,vy:Math.sin(aa)*480,damage:Math.round(player.damage*.9),life:.82,color:'#bfe9ee'})}toast('Тройной импульс')}else{const before=player.hp;player.hp=Math.min(player.maxHp,player.hp+70);burst(player.x,player.y,'#86c99b',20,100);toast(before===player.maxHp?'Второе дыхание готово':'Восстановлено здоровье')}}
function nearbyInteraction(){
 const z=zones[zoneId];
 const candidates=[];
 const priority={loot:0,scout:1,resource:2,portal:3};
 const add=(type,entity,x,y,radius)=>{
  const d=Math.hypot(player.x-x,player.y-y);
  if(d<radius)candidates.push({type,entity,d});
 };
 // Locked portals do not steal focus from loot/NPC/resource.
 if(canUsePortal())add('portal',null,z.portal.x,z.portal.y,135);
 add('scout',z.scout,z.scout.x,z.scout.y,120);
 for(const e of entities){
  if(e.kind==='resource'&&e.hp>0)add('resource',e,e.x,e.y,105);
 }
 for(const l of lootDrops){
  if(l.life>0)add('loot',l,l.x,l.y,105);
 }
 candidates.sort((a,b)=>a.d-b.d || priority[a.type]-priority[b.type]);
 return candidates[0]||null;
}

function openNpcDialog(){const z=zones[zoneId];const name=zoneId==='ashfield'?'Смотритель Вейл':'Разведчик Ари';const text=zoneId==='ashfield'?'Пепел движется. Хранитель пробудился. Будьте готовы.':'Мы нашли след. Помоги очистить тропу и добраться до следующей долины.';openModal(name,`<div class="dialogue"><div class="dialogueName">${name}</div><p>${text}</p><p class="note">Новая цель: ${currentObjective()}</p><button class="btn" id="dialogContinue">Продолжить</button></div>`);setTimeout(()=>bindTap($('dialogContinue'),closeModal),0)}

function canUsePortal(){const s=questState();return s.step>=3}
function updateUI(){
 const hp=Math.round(player.hp),st=Math.round(player.stamina),xp=Math.round(player.xp),lvl=player.level,z=zones[zoneId],objective=currentObjective();
 const values={hp,st,xp,lvl,zone:z.name,objective,title:z.quest.title,herb:player.inv.herb,wood:player.inv.wood,ore:player.inv.ore,gold:player.gold,badge:z.badge};
 const set=(el,key,value,transform=v=>v)=>{if(!el)return;const next=transform(value);if(uiCache[key]===next)return;uiCache[key]=next;el[key==='hp'?'style': 'textContent'];if(key==='hp'||key==='st'||key==='xp')el.style.width=next;else el.textContent=next};
 set(ui.hp,'hp',hp,v=>`${clamp(v/player.maxHp*100,0,100)}%`);
 set(ui.stamina,'st',st,v=>`${clamp(v/player.maxStamina*100,0,100)}%`);
 set(ui.xp,'xp',xp,v=>`${clamp(v/player.xpNeed*100,0,100)}%`);
 set(ui.level,'lvl',lvl,v=>`Ур. ${v}`);set(ui.zone,'zone',z.name);set(ui.objective,'objective',objective);set(ui.questTitle,'title',z.quest.title);set(ui.questProgress,'progress',objective);set(ui.badge,'badge',z.badge);
 set(ui.herb,'herb',values.herb);set(ui.wood,'wood',values.wood);set(ui.ore,'ore',values.ore);set(ui.gold,'gold',values.gold);
 const hit=nearbyInteraction();
 if(ui.prompt){const prompt=hit?(hit.type==='portal'?'Перейти в другую локацию':hit.type==='scout'?(questState().step===0?'Поговорить с разведчиком':'Спросить о задании'):hit.type==='loot'?'Подобрать лут':'Собрать ресурс'):'';ui.prompt.classList.toggle('hidden',!hit);if(ui.promptText&&uiCache.prompt!==prompt){uiCache.prompt=prompt;ui.promptText.textContent=prompt}}
}

function interact(){
 if(interactionLock>time||transitioning)return;
 interactionLock=time+.16;
 const hit=nearbyInteraction();
 if(!hit)return;
 if(hit.type==='portal'){
  if(!canUsePortal()){toast('Сначала завершите текущую задачу');return}
  advanceQuest('portal');transitionZone();return;
 }
 if(hit.type==='scout'){
  const s=questState();
  if(s.step===0){advanceQuest('scout');openNpcDialog();}
  else toast('Цель: '+currentObjective());
  return;
 }
 if(hit.type==='loot'){
  const l=hit.entity;
  if(l.id==='coin')player.gold+=l.count;
  else if(['guardianToken','emberShard'].includes(l.id)){player.inv[l.id]=(player.inv[l.id]||0)+l.count}
  else {player.inv[l.id]=(player.inv[l.id]||0)+l.count} 
  if(l.id==='guardianToken'){player.equipment.armor='Пластинчатая броня стража';player.maxHp+=25;player.hp=Math.min(player.maxHp,player.hp+25)}
  const text=l.id==='coin'?`Золото +${l.count}`:`Получено: ${l.label} ×${l.count}`;
  toast(text);
  if(ui.lootTicker){ui.lootTicker.textContent=text;ui.lootTicker.classList.add('show');clearTimeout(ui.lootTicker._t);ui.lootTicker._t=setTimeout(()=>ui.lootTicker.classList.remove('show'),1500)}
  lootDrops.splice(lootDrops.indexOf(l),1);
  updateUI();save();return;
 }
 const r=hit.entity,key=r.type;
 player.inv[key]++;
 if(zoneId==='mistwood'&&key==='herb'&&questState().step===1){questState().herb++;advanceQuest('resource')}
 if(zoneId==='stonevale'&&key==='ore'&&questState().step===1){questState().ore++;advanceQuest('resource')}
 if(zoneId==='ashfield'&&key==='wood'&&questState().step===1){questState().wood++;advanceQuest('resource')}
 toast('Получено: '+({wood:'древесина',ore:'руда',herb:'трава'}[key]));
 burst(r.x,r.y,'#d6c274',12,105);
 entities.splice(entities.indexOf(r),1);
 updateUI();save()
}
function transitionZone(){if(transitioning)return;transitioning=true;ui.loading.classList.remove('hidden');ui.loadFill.style.width='0%';ui.loadText.textContent='Переход: '+zones[zones[zoneId].next].name;const start=performance.now();function tick(now){const p=Math.min(1,(now-start)/650);ui.loadFill.style.width=(p*100)+'%';if(p<1){requestAnimationFrame(tick);return}zoneId=zones[zoneId].next;resetZone();save();setTimeout(()=>{resetFrameLimiter();ui.loading.classList.add('hidden');transitioning=false;toast(zones[zoneId].name)},120)}requestAnimationFrame(tick)}
function openModal(title,body){ui.modalTitle.textContent=title;ui.modalBody.innerHTML=body;ui.modal.classList.remove('hidden')}function closeModal(){ui.modal.classList.add('hidden')}
function openInventory(){openModal('Сумка и экипировка',`<div class="grid"><div class="card"><h3>Оружие</h3><p>${player.equipment.weapon}<br>Урон: <b>${player.damage}</b></p></div><div class="card"><h3>Броня</h3><p>${player.equipment.armor}<br>Защита: <b>24</b></p></div><div class="card"><h3>Ресурсы</h3><p>Древесина: ${player.inv.wood}<br>Руда: ${player.inv.ore}<br>Трава: ${player.inv.herb}</p></div><div class="card"><h3>Валюта</h3><p class="gold">${player.gold} золотых</p><p>Знаки: ${player.inv.guardianToken||0}<br>Осколки: ${player.inv.emberShard||0}</p></div></div><div class="sectionTitle">КРАФТ</div><button class="btn" id="craftBtn">Закалить меч · 3 древесины + 2 руды</button><button class="btn" id="potionBtn">Зелье жизни · 3 травы + 1 древесина</button>`);bindTap($('craftBtn'),()=>craft('blade'));bindTap($('potionBtn'),()=>craft('potion'))}
function craft(recipe='blade'){if(recipe==='blade'&&player.inv.wood>=3&&player.inv.ore>=2){player.inv.wood-=3;player.inv.ore-=2;player.damage+=5;player.equipment.weapon='Закалённый меч следопыта';gainXP(35);save();closeModal();toast('Оружие улучшено: +5 урона')}else if(recipe==='potion'&&player.inv.herb>=3&&player.inv.wood>=1){player.inv.herb-=3;player.inv.wood-=1;player.maxHp+=12;player.hp=player.maxHp;gainXP(20);save();closeModal();toast('Создано зелье жизни · +12 макс. HP')}else toast('Недостаточно ресурсов')}
function openMenu(){openModal('Настройки · v3.0',`<div class="stats"><div class="stat"><b>${player.level}</b>Уровень</div><div class="stat"><b>${Math.round(player.hp)}</b>Здоровье</div><div class="stat"><b>${player.damage}</b>Урон</div></div><div class="sectionTitle">КАЧЕСТВО ГРАФИКИ</div><div class="settingRow"><div class="seg" id="qualitySeg">${['low','medium','high','very-high'].map(q=>`<button data-q="${q}" class="${settings.quality===q?'active':''}">${q==='very-high'?'Very High':q[0].toUpperCase()+q.slice(1)}</button>`).join('')}</div><div class="note">Меняет внутреннее разрешение canvas, плотность окружения, лимиты врагов и частиц, детализацию текстур, тени и туман. Применяется сразу.</div></div><div class="sectionTitle">ЧАСТОТА КАДРОВ</div><div class="settingRow"><div class="seg fps" id="fpsSeg">${FPS.map(f=>`<button data-f="${f}" class="${settings.fps===f?'active':''}">${f}</button>`).join('')}</div><div class="note">Лимит управляет реальными отрисованными кадрами. Монитор считает только кадры после update + draw.</div></div><div class="sectionTitle">МОНИТОР ПРОИЗВОДИТЕЛЬНОСТИ</div><button class="btn" id="perfBtn">${perfMonitorEnabled?'Выключить frame-time monitor':'Включить frame-time monitor'}</button><div class="sectionTitle">УСТРОЙСТВО</div><div class="card"><p>${device.ios?'iOS':device.android?'Android':'Mobile'} · RAM: ${device.ram===null?'n/a':device.ram+' GB'} · ${device.cores} CPU cores · DPR ${device.dpr.toFixed(2)}<br>Профиль: <b>${detected.toUpperCase()}</b><br>RAM: n/a означает, что Safari не предоставляет этот показатель.</p></div><div class="sectionTitle">СОХРАНЕНИЕ</div><button class="btn" id="saveBtn">Сохранить прогресс</button>`);document.querySelectorAll('#qualitySeg button').forEach(b=>bindTap(b,()=>{settings.quality=b.dataset.q;localStorage.setItem('aef_quality',settings.quality);applyGraphics();save();openMenu()}));document.querySelectorAll('#fpsSeg button').forEach(b=>bindTap(b,()=>{settings.fps=Number(b.dataset.f);localStorage.setItem('aef_fps',String(settings.fps));resetFrameLimiter();save();openMenu()}));bindTap($('saveBtn'),()=>{save();toast('Прогресс сохранён')});bindTap($('perfBtn'),()=>{perfMonitorEnabled=!perfMonitorEnabled;localStorage.setItem('aef_perf_monitor',perfMonitorEnabled?'1':'0');refreshPerformanceMonitorVisibility();openMenu()})}
function bindTap(el,fn){
 if(!el)return;
 let fired=false;
 const handler=e=>{
  e.preventDefault();e.stopPropagation();
  if(fired)return;
  fired=true;
  try{fn(e)}catch(err){console.error('Aethernfall input handler',err)}
  requestAnimationFrame(()=>{fired=false});
 };
 el.addEventListener('pointerdown',handler,{passive:false});
}


const joyEl=$('joystick'),stick=$('stick'),joy={id:null,x:0,y:0};

function resetJoy(){joy.id=null;joy.x=0;joy.y=0;if(stick)stick.style.transform='translate(0,0)'}
function setJoystickFromPoint(clientX,clientY){
 const r=joyEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=Math.max(1,Math.min(r.width,r.height)*.36);
 let dx=clientX-cx,dy=clientY-cy,l=Math.hypot(dx,dy);
 if(l>max){dx=dx/l*max;dy=dy/l*max}
 joy.x=dx/max;joy.y=dy/max;if(Math.hypot(joy.x,joy.y)<.08){joy.x=0;joy.y=0}
 if(stick)stick.style.transform=`translate(${dx}px,${dy}px)`;
}
function moveJoy(e){setJoystickFromPoint(e.clientX,e.clientY)}
if(joyEl){
 joyEl.addEventListener('pointerdown',e=>{
  if(e.button!==undefined&&e.button!==0&&e.pointerType==='mouse')return;
  e.preventDefault();e.stopPropagation();
  if(joy.id!==null)return;
  joy.id=e.pointerId;joyEl.setPointerCapture?.(e.pointerId);moveJoy(e);
 },{passive:false});
 joyEl.addEventListener('pointermove',e=>{if(e.pointerId!==joy.id)return;e.preventDefault();moveJoy(e)},{passive:false});
 const endJoy=e=>{if(e.pointerId===joy.id)resetJoy()};
 joyEl.addEventListener('pointerup',endJoy,{passive:true});
 joyEl.addEventListener('pointercancel',endJoy,{passive:true});
 joyEl.addEventListener('lostpointercapture',endJoy,{passive:true});
}

// Look input — mobile only, and never from the joystick area.
canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse')return;
  if(e.clientX<W*.43)return;
  look.ids.add(e.pointerId);
  look.lastX=e.clientX;
  canvas.setPointerCapture?.(e.pointerId);
},{passive:false});
canvas.addEventListener('pointermove',e=>{
  if(!look.ids.has(e.pointerId))return;
  e.preventDefault();
  const dx=e.clientX-look.lastX;
  look.lastX=e.clientX;
  player.dir+=dx*.008;
},{passive:false});
['pointerup','pointercancel'].forEach(ev=>canvas.addEventListener(ev,e=>look.ids.delete(e.pointerId),{passive:false}));

document.querySelectorAll('.action').forEach(btn=>{
  const a=btn.dataset.act;
  if(a==='block'){
    let blockPointer=null;
    btn.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse')return;
      e.preventDefault();e.stopPropagation();
      blockPointer=e.pointerId;player.blocking=true;
      btn.setPointerCapture?.(e.pointerId);
    },{passive:false});
    const release=e=>{
      if(blockPointer===null||e.pointerId===blockPointer){
        blockPointer=null;player.blocking=false;
      }
    };
    ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,release,{passive:false}));
    return;
  }
  bindTap(btn,()=>{
    if(a==='attack')attack();
    else if(a==='dodge')dodge();
    else if(a==='skill1')skill(1);
    else if(a==='skill2')skill(2);
    else if(a==='skill3')skill(3);
    else if(a==='use')interact();
  });
});
bindTap(ui.prompt,interact);
bindTap($('inventoryBtn'),openInventory);
bindTap($('menuBtn'),openMenu);
bindTap($('modalClose'),closeModal);

['gesturestart','gesturechange','gestureend'].forEach(ev=>document.addEventListener(ev,e=>e.preventDefault(),{passive:false}));let lastTouchEnd=0;document.addEventListener('touchend',e=>{const now=Date.now();if(now-lastTouchEnd<320)e.preventDefault();lastTouchEnd=now},{passive:false});document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault()},{passive:false});

function updateEnemyPatrol(dt){
 for(const e of entities){
  if(e.kind!=='enemy'||e.hp<=0)continue;
  if(!Number.isFinite(e.patrolT))e.patrolT=0;
  if(!Number.isFinite(e.dir))e.dir=e.seed*6.283185;
  const d=dist(player,e);
  if(d>=620){
   e.patrolT+=dt;
   if(e.patrolT>=1.1){
    e.patrolT=0;
    e.dir+=(rng(Math.floor(time*3)+Math.floor(e.x)+Math.floor(e.y))-.5)*0.9;
   }
   const speed=e.type==='guardian'?12:18;
   e.x=clamp(e.x+Math.cos(e.dir)*speed*dt,45,WORLD.w-45);
   e.y=clamp(e.y+Math.sin(e.dir)*speed*dt,45,WORLD.h-45);
  }
 }
}

function update(dt){
 entities=entities.filter(e=>e.kind!=='enemy'||e.hp>0||e._corpseUntil>time);time+=dt;player.attackCd=Math.max(0,player.attackCd-dt);player.comboTimer=Math.max(0,player.comboTimer-dt);if(player.comboTimer===0)player.combo=0;player.stamina=clamp(player.stamina+(player.blocking?12:24)*dt,0,player.maxStamina);const moving=Math.hypot(joy.x,joy.y)>.06;const dodgeUntil=Number.isFinite(player.dodgeUntil)?player.dodgeUntil:0;player.dodgeUntil=dodgeUntil;
 // ИСПРАВЛЕНИЕ 2: Заменил несуществующий player.dodging на player.dodgeUntil
 const speed=player.speed*(player.blocking?.58:1)*(player.dodgeUntil>time?.9:1);
 if(moving&&time>=dodgeUntil){player.x=clamp(player.x+joy.x*speed*dt,70,WORLD.w-70);player.y=clamp(player.y+joy.y*speed*dt,70,WORLD.h-70);player.dir=Math.atan2(joy.y,joy.x)}for(const e of entities){if(e.hp<=0||e.kind!=='enemy')continue;e.cd=Math.max(0,e.cd-dt);e.hit=Math.max(0,e.hit-dt);const d=dist(player,e);if(d<620){const a=Math.atan2(player.y-e.y,player.x-e.x);if(d>e.r+player.r+8){e.x=clamp(e.x+Math.cos(a)*e.speed*dt,40,WORLD.w-40);e.y=clamp(e.y+Math.sin(a)*e.speed*dt,40,WORLD.h-40)}else if(e.cd<=0){e.cd=e.type==='guardian'?1.05:1.35;if(time>=player.dodgeUntil){const dmg=player.blocking?Math.ceil(e.damage*.26):e.damage;player.hp=Math.max(0,player.hp-dmg);burst(player.x,player.y,'#e06d68',7,80);if(player.hp<=0){player.hp=player.maxHp;player.x=zones[zoneId].camp.x;player.y=zones[zoneId].camp.y;toast('Вы возвращены к лагерю')}}}}}
updateEnemyPatrol(dt);
for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;let hit=false;for(const e of entities){if(e.hp>0&&e.kind==='enemy'&&dist(p,e)<e.r+7){hitTarget(e,p.damage);hit=true;break}}if(hit||p.life<=0)projectiles.splice(i,1)}for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.94;p.vy*=.94;p.life-=dt;if(p.life<=0)particles.splice(i,1)}for(let i=lootDrops.length-1;i>=0;i--){lootDrops[i].life-=dt;if(lootDrops[i].life<=0)lootDrops.splice(i,1)}for(let i=floatingTexts.length-1;i>=0;i--){floatingTexts[i].y-=28*dt;floatingTexts[i].life-=dt;if(floatingTexts[i].life<=0)floatingTexts.splice(i,1)}
 if(entities.length>90)entities=entities.filter(e=>e.kind==='resource'||e.hp>0);
uiAccumulator+=dt;
 if(uiAccumulator>=.10){uiAccumulator=0;updateUI()}
}
function isoY(v){return v*.82}function shadowColor(alpha){return `rgba(0,0,0,${Math.max(.02,alpha*(.25+profile.shadow*1.45)).toFixed(3)})`}function screenPos(x,y){return{x:x-player.x+W/2,y:isoY(y-player.y)+H/2}}
function texturedRect(pattern,base,x,y,w,h,alpha=1){ctx.fillStyle=base;ctx.fillRect(x,y,w,h);if(pattern){ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=pattern;ctx.fillRect(x,y,w,h);ctx.restore()}}
function drawGround(z){ctx.fillStyle=z.base;ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(W/2-player.x,H/2-player.y*.82);const basePattern=zoneId==='mistwood'?patterns.grass:zoneId==='stonevale'?patterns.stone:patterns.dirt;texturedRect(basePattern,z.ground,-160,-160,WORLD.w+320,WORLD.h*.82+320,.42+profile.textureScale*.3);ctx.globalAlpha=.2+profile.detail*.06;for(let i=0;i<24+profile.detail*10;i++){const x=rng(i+30)*WORLD.w,y=rng(i+90)*WORLD.h*.82,r=24+rng(i+120)*42;ctx.fillStyle=z.accent;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}ctx.restore();if(profile.fog>0){const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,`rgba(210,235,225,${profile.fog*.15})`);g.addColorStop(.55,'rgba(255,255,255,0)');g.addColorStop(1,`rgba(0,0,0,${profile.fog*.45})`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}}
function drawAmbient(){for(const a of ambient){if(Math.abs(a.x-player.x)>W+180||Math.abs(a.y-player.y)>H+260)continue;const s=screenPos(a.x,a.y);ctx.save();ctx.translate(s.x,s.y);ctx.scale(1,.82);const shade=profile.detail===0?.65:1;if(zoneId==='mistwood'){ctx.fillStyle=shadowColor(.22);ctx.beginPath();ctx.ellipse(0,18,28*a.scale,9*a.scale,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=`rgba(44,78,46,${.78*shade})`;ctx.beginPath();ctx.arc(0,-14,18*a.scale,0,Math.PI*2);ctx.fill();ctx.fillStyle=`rgba(77,117,60,${.72*shade})`;ctx.beginPath();ctx.arc(-15,-6,12*a.scale,0,Math.PI*2);ctx.arc(14,-7,13*a.scale,0,Math.PI*2);ctx.fill();if(patterns.foliage&&profile.detail>=2){ctx.save();ctx.globalAlpha=.18;ctx.fillStyle=patterns.foliage;ctx.beginPath();ctx.arc(-15,-6,12*a.scale,0,Math.PI*2);ctx.arc(14,-7,13*a.scale,0,Math.PI*2);ctx.fill();ctx.restore()}ctx.fillStyle='#60452e';ctx.fillRect(-3,4,6,20*a.scale)}else if(zoneId==='stonevale'){ctx.fillStyle=shadowColor(.25);ctx.beginPath();ctx.ellipse(0,14,25*a.scale,8*a.scale,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#77766d';ctx.beginPath();ctx.moveTo(-18,11);ctx.lineTo(-8,-17);ctx.lineTo(14,-9);ctx.lineTo(19,11);ctx.closePath();ctx.fill();if(profile.detail>1){ctx.strokeStyle='#aaa79b';ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(-5,-7);ctx.lineTo(6,-1);ctx.lineTo(1,8);ctx.stroke()}}else{ctx.fillStyle=shadowColor(.25);ctx.beginPath();ctx.ellipse(0,14,24*a.scale,8*a.scale,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#553a31';ctx.beginPath();ctx.moveTo(-20,10);ctx.lineTo(-3,-16);ctx.lineTo(18,10);ctx.closePath();ctx.fill();ctx.strokeStyle='#bd805a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-9,4);ctx.lineTo(2,-9);ctx.lineTo(10,6);ctx.stroke()}ctx.restore()}}
function drawCamp(z){const s=screenPos(z.camp.x,z.camp.y);ctx.save();ctx.translate(s.x,s.y);ctx.scale(1,.82);ctx.fillStyle=shadowColor(.30);ctx.beginPath();ctx.ellipse(0,18,62,18,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#543b2a';ctx.beginPath();ctx.moveTo(-50,16);ctx.lineTo(0,-29);ctx.lineTo(50,16);ctx.closePath();ctx.fill();if(patterns.wood){ctx.globalAlpha=.25;ctx.fillStyle=patterns.wood;ctx.fill();ctx.globalAlpha=1}ctx.strokeStyle='#a07852';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-43,13);ctx.lineTo(0,-22);ctx.lineTo(43,13);ctx.stroke();ctx.fillStyle='#ffcf77';ctx.shadowColor='#e7a158';ctx.shadowBlur=profile.detail>=2?8:0;ctx.beginPath();ctx.arc(17,8,9+Math.sin(time*7)*2,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawScout(z){const s=screenPos(z.scout.x,z.scout.y);ctx.save();ctx.translate(s.x,s.y);ctx.scale(1,.82);ctx.fillStyle=shadowColor(.25);ctx.beginPath();ctx.ellipse(0,17,25,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=zoneId==='ashfield'?'#70423a':'#2d4650';ctx.beginPath();ctx.moveTo(-15,15);ctx.lineTo(-12,-12);ctx.lineTo(0,-21);ctx.lineTo(14,-11);ctx.lineTo(17,15);ctx.closePath();ctx.fill();ctx.fillStyle='#d6b891';ctx.beginPath();ctx.arc(0,-21,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d8dde0';ctx.beginPath();ctx.moveTo(-12,-27);ctx.quadraticCurveTo(0,-44,14,-28);ctx.lineTo(11,-21);ctx.lineTo(-12,-21);ctx.closePath();ctx.fill();ctx.restore()}
function drawPortal(z){const s=screenPos(z.portal.x,z.portal.y);ctx.save();ctx.translate(s.x,s.y);ctx.scale(1,.82);const pulse=1+Math.sin(time*3)*.07,col=zoneId==='mistwood'?'#76c2ce':zoneId==='stonevale'?'#d9ad6d':'#cf745c';ctx.scale(pulse,pulse);ctx.strokeStyle=col;ctx.lineWidth=7;ctx.shadowColor=col;ctx.shadowBlur=profile.detail>=2?10:0;ctx.beginPath();ctx.ellipse(0,0,38,53,0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=col;ctx.globalAlpha=.16;ctx.beginPath();ctx.ellipse(0,0,29,43,0,0,Math.PI*2);ctx.fill();if(patterns.rune&&profile.detail>=2){ctx.globalAlpha=.22;ctx.fillStyle=patterns.rune;ctx.beginPath();ctx.ellipse(0,0,27,41,0,0,Math.PI*2);ctx.fill()}ctx.restore()}
function drawResource(e){const s=screenPos(e.x,e.y);ctx.save();ctx.translate(s.x,s.y);ctx.scale(1,.82);ctx.fillStyle=shadowColor(.22);ctx.beginPath();ctx.ellipse(0,16,18,7,0,0,Math.PI*2);ctx.fill();if(e.type==='ore'){ctx.fillStyle='#8e959d';ctx.beginPath();ctx.moveTo(-13,9);ctx.lineTo(-4,-17);ctx.lineTo(15,-7);ctx.lineTo(8,11);ctx.closePath();ctx.fill();ctx.fillStyle='#dbe2e5';ctx.beginPath();ctx.arc(4,-3,3,0,Math.PI*2);ctx.fill()}else if(e.type==='wood'){ctx.fillStyle='#6f5135';ctx.fillRect(-5,-3,10,23);ctx.fillStyle='#6da360';ctx.beginPath();ctx.arc(-9,-8,12,0,Math.PI*2);ctx.arc(8,-6,11,0,Math.PI*2);ctx.fill()}else{ctx.fillStyle='#86b36a';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc((i-2)*6,-7+(i%2)*5,6,0,Math.PI*2);ctx.fill()}}ctx.restore()}
function drawEntity(e){const s=screenPos(e.x,e.y);ctx.save();ctx.translate(s.x,s.y);ctx.scale(1,.82);ctx.fillStyle=shadowColor(.26);ctx.beginPath();ctx.ellipse(0,16,e.r*1.35,8,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=e.hit>0?.5:1;ctx.fillStyle=e.type==='guardian'?'#76588a':e.type==='raider'?'#9c4d56':'#6b4d38';ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d6b891';ctx.beginPath();ctx.arc(0,-e.r*.82,e.r*.45,0,Math.PI*2);ctx.fill();if(e.type==='guardian'){ctx.strokeStyle='#d7b56b';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-e.r*.65,-e.r*.15);ctx.lineTo(e.r*.7,-e.r*.7);ctx.stroke()}else{ctx.fillStyle='#161d1b';ctx.fillRect(-e.r*.45,-e.r*.92,e.r*.9,4)}const hpw=e.r*2.1;ctx.fillStyle='rgba(0,0,0,.48)';ctx.fillRect(-hpw/2,-e.r-15,hpw,4);ctx.fillStyle=e.type==='guardian'?'#d8a1e8':'#df6f73';ctx.fillRect(-hpw/2,-e.r-15,hpw*(e.hp/e.maxHp),4);ctx.restore()}
function drawPlayer(){const s=screenPos(player.x,player.y);ctx.save();ctx.translate(s.x,s.y);ctx.scale(1,.82);ctx.fillStyle=shadowColor(.30);ctx.beginPath();ctx.ellipse(0,18,30,10,0,0,Math.PI*2);ctx.fill();if(time<player.dodgeUntil)ctx.globalAlpha=.72;ctx.fillStyle='#2f505c';ctx.beginPath();ctx.moveTo(-18,14);ctx.lineTo(-14,-13);ctx.lineTo(0,-24);ctx.lineTo(15,-13);ctx.lineTo(18,14);ctx.closePath();ctx.fill();ctx.fillStyle='#e0c7a0';ctx.beginPath();ctx.arc(0,-21,11,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d8dde0';ctx.beginPath();ctx.moveTo(-13,-28);ctx.quadraticCurveTo(0,-47,15,-28);ctx.lineTo(11,-20);ctx.lineTo(-13,-20);ctx.closePath();ctx.fill();ctx.save();ctx.rotate(player.dir);ctx.strokeStyle='#dfbc67';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(5,-3);ctx.lineTo(38,-11);ctx.stroke();ctx.restore();if(player.blocking){ctx.strokeStyle='#b8d9dc';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,37,-.95,.95);ctx.stroke()}ctx.restore()}
function drawProjectiles(){for(const p of projectiles){const s=screenPos(p.x,p.y);ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=profile.detail>=2?6:0;ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.restore()}}
function drawParticles(){for(const p of particles){const s=screenPos(p.x,p.y);ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(s.x,s.y,p.size,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}

function drawLandmarks(z){
  ctx.save();
  // Major road/path
  const sx=screenPos(WORLD.w*.5,WORLD.h*.55);
  ctx.translate(W/2-player.x,H/2-player.y*.82);
  ctx.globalAlpha=.42;
  ctx.fillStyle=zoneId==='mistwood'?'#7d7657':zoneId==='stonevale'?'#928875':'#8d6656';
  ctx.beginPath();
  ctx.moveTo(-180, WORLD.h*.18);
  ctx.quadraticCurveTo(WORLD.w*.42, WORLD.h*.46, WORLD.w*.50, WORLD.h*.74);
  ctx.quadraticCurveTo(WORLD.w*.58, WORLD.h*.98, WORLD.w+180, WORLD.h*.82);
  ctx.lineTo(WORLD.w+180, WORLD.h*.95);
  ctx.quadraticCurveTo(WORLD.w*.57, WORLD.h*1.08, WORLD.w*.45, WORLD.h*.80);
  ctx.quadraticCurveTo(WORLD.w*.34, WORLD.h*.54,-180,WORLD.h*.30);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha=.95;
  // Zone landmark cluster
  const lx=zoneId==='mistwood'?1180:zoneId==='stonevale'?1220:1520;
  const ly=zoneId==='mistwood'?420:zoneId==='stonevale'?520:900;
  ctx.save();ctx.translate(lx,ly);ctx.scale(1,.82);
  ctx.fillStyle=shadowColor(.18);ctx.beginPath();ctx.ellipse(0,30,150,36,0,0,Math.PI*2);ctx.fill();
  if(zoneId==='mistwood'){
    ctx.fillStyle='#5d4a39';for(let i=-1;i<=1;i++){ctx.fillRect(i*58-11,-62,22,110)}
    ctx.fillStyle='#7b6651';ctx.beginPath();ctx.moveTo(-115,-54);ctx.lineTo(0,-112);ctx.lineTo(115,-54);ctx.closePath();ctx.fill();
    ctx.fillStyle='#8aac72';ctx.beginPath();ctx.arc(-75,-90,35,0,Math.PI*2);ctx.arc(10,-108,40,0,Math.PI*2);ctx.arc(78,-90,32,0,Math.PI*2);ctx.fill();
  } else if(zoneId==='stonevale'){
    ctx.fillStyle='#6f6a60';for(let i=0;i<4;i++){ctx.fillRect(-100+i*55,-80,34,110)}
    ctx.fillStyle='#827b6c';ctx.beginPath();ctx.moveTo(-118,-80);ctx.lineTo(-102,-125);ctx.lineTo(-66,-100);ctx.lineTo(-42,-142);ctx.lineTo(-2,-105);ctx.lineTo(26,-132);ctx.lineTo(56,-96);ctx.lineTo(105,-118);ctx.lineTo(118,-80);ctx.closePath();ctx.fill();
  } else {
    ctx.fillStyle='#543830';ctx.fillRect(-90,-74,180,110);
    ctx.fillStyle='#7b4b3e';ctx.fillRect(-66,-96,132,22);
    ctx.fillStyle='#c47f59';ctx.fillRect(-22,-52,44,52);
    ctx.strokeStyle='#e4a06f';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-62,-65);ctx.lineTo(-32,-28);ctx.lineTo(0,-65);ctx.lineTo(34,-26);ctx.lineTo(64,-64);ctx.stroke();
  }
  ctx.restore();
  if(zoneId==='mistwood'&&patterns.water&&profile.detail>=1){
    const wx=screenPos(1780,620), ww=screenPos(2100,620);
    ctx.save();ctx.globalAlpha=.28;ctx.fillStyle=patterns.water;ctx.fillRect(wx.x,wx.y,Math.max(1,ww.x-wx.x),34);ctx.restore();
  }
  ctx.restore();
}

function drawLoot(){
 for(const l of lootDrops){
  const s=screenPos(l.x,l.y);
  ctx.save();ctx.translate(s.x,s.y+Math.sin(time*4+l.x)*3);
  ctx.shadowColor=l.id==='coin'?'rgba(230,194,92,.85)':'rgba(190,220,216,.65)';ctx.shadowBlur=profile.detail>=2?10:0;
  ctx.fillStyle=l.id==='coin'?'#e6c25e':l.id==='guardianToken'?'#b79be8':'#bdd2cc';
  ctx.beginPath();ctx.arc(0,-12,8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='rgba(255,255,255,.35)';ctx.beginPath();ctx.arc(-2,-14,2.2,0,Math.PI*2);ctx.fill();
  ctx.restore();
 }
}


function drawWorldLandmarkOverlay(){
 const z=zones[zoneId];
 const list=zoneId==='mistwood'?[[940,440,'FOREST'] ,[1540,1030,'RUIN'],[2150,540,'SHRINE']]
 :zoneId==='stonevale'?[[820,480,'VILLAGE'],[1500,840,'MINE'],[2180,520,'RUIN']]
 :[[940,500,'OUTPOST'],[1760,1240,'BOSS'],[1260,930,'SHRINE']];
 for(const [x,y,k] of list){
  const s=screenPos(x,y);if(s.x<-140||s.x>W+140||s.y<-140||s.y>H+140)continue;
  ctx.save();ctx.translate(s.x,s.y);
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(0,22,62,16,0,0,Math.PI*2);ctx.fill();
  if(k==='FOREST'||k==='VILLAGE'){
   ctx.fillStyle='#755640';ctx.fillRect(-42,-52,84,60);ctx.fillStyle='#a27a51';ctx.beginPath();ctx.moveTo(-52,-52);ctx.lineTo(0,-84);ctx.lineTo(52,-52);ctx.closePath();ctx.fill();
  }else if(k==='MINE'){
   ctx.strokeStyle='#7d654f';ctx.lineWidth=10;ctx.strokeRect(-48,-50,96,55);ctx.strokeStyle='#b48a60';ctx.lineWidth=3;ctx.strokeRect(-35,-38,70,42);
  }else if(k==='SHRINE'){
   ctx.fillStyle='#77766d';ctx.fillRect(-8,-62,16,62);ctx.fillStyle=z.accent;ctx.beginPath();ctx.arc(0,-62,17,0,Math.PI*2);ctx.fill();
  }else if(k==='OUTPOST'){
   ctx.fillStyle='#684737';ctx.fillRect(-48,-58,96,64);ctx.fillStyle='#996549';ctx.fillRect(-60,-72,14,25);ctx.fillRect(46,-72,14,25);
  }else if(k==='BOSS'){
   ctx.strokeStyle='rgba(210,84,67,.6)';ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,-6,52,0,Math.PI*2);ctx.stroke();
  }else{
   ctx.fillStyle='#6b6963';for(let i=-2;i<3;i++)ctx.fillRect(i*22-8,-56+(i%2)*8,16,70-(i%2)*8);
  }
  ctx.restore();
 }
}

function drawFloatingTexts(){for(const f of floatingTexts){const s=screenPos(f.x,f.y);ctx.globalAlpha=Math.max(0,f.life/f.max);ctx.font='700 13px system-ui';ctx.textAlign='center';ctx.fillStyle=f.color;ctx.fillText(f.text,s.x,s.y);ctx.globalAlpha=1}}


function drawV27Labels(){
 const z=zones[zoneId], s=screenPos(z.scout.x,z.scout.y);
 if(s.x>-120&&s.x<W+120&&s.y>-120&&s.y<H+120){
  ctx.save();ctx.font='700 11px system-ui';ctx.textAlign='center';
  const active=dist(player,z.scout)<130;
  ctx.fillStyle='rgba(8,14,12,.76)';const label=active?'✦  Разведчик': 'Разведчик';
  const w=ctx.measureText(label).width+18;ctx.fillRect(s.x-w/2,s.y-58,w,20);
  ctx.fillStyle=active?'#f0d58e':'#d3ddd8';ctx.fillText(label,s.x,s.y-43);ctx.restore();
 }
}


function drawV30Atmosphere(){
 const z=zones[zoneId];
 ctx.save();
 const horizon=H*.18+(player.y%180)*.015;
 const grad=ctx.createLinearGradient(0,0,0,H);
 grad.addColorStop(0,'rgba(223,224,205,.06)');
 grad.addColorStop(.38,'rgba(20,28,23,0)');
 grad.addColorStop(1,'rgba(7,11,9,.16)');
 ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);

 ctx.globalAlpha=.12;
 ctx.strokeStyle=z.accent;ctx.lineWidth=12;ctx.lineCap='round';
 ctx.beginPath();ctx.moveTo(-60,H*.80);ctx.quadraticCurveTo(W*.36,H*.58,W+60,H*.46);ctx.stroke();
 ctx.globalAlpha=.08;ctx.lineWidth=42;ctx.strokeStyle='#0b100d';
 ctx.beginPath();ctx.moveTo(-100,H*.88);ctx.quadraticCurveTo(W*.40,H*.68,W+100,H*.55);ctx.stroke();

 ctx.globalAlpha=.18;
 for(let i=0;i<18;i++){
   const x=((i*173+Math.floor(player.x*.15))% (W+120))-60;
   const y=((i*97+Math.floor(player.y*.06))%(H+90))-40;
   ctx.fillStyle=i%3===0?'#d7c991':'#93a383';
   ctx.beginPath();ctx.ellipse(x,y,1.5,8+(i%4)*3,0,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}


function drawCombatTelegraphs(){
 for(const e of entities){
   if(e.kind!=='enemy'||e.hp<=0||e.attackCd<=0||e.attackCd>0.35)continue;
   const s=screenPos(e.x,e.y);
   ctx.save();ctx.strokeStyle='rgba(232,111,96,.62)';ctx.lineWidth=3;
   ctx.beginPath();ctx.arc(s.x,s.y,28,0,Math.PI*2);ctx.stroke();
   ctx.restore();
 }
}

function drawWorld(){
 const z=zones[zoneId];
 ctx.clearRect(0,0,W,H);drawGround(z);drawV30Atmosphere();drawLandmarks(z);drawWorldLandmarkOverlay();drawAmbient();
 drawables.length=0;
 drawCampMarker.y=z.camp.y;drawScoutMarker.y=z.scout.y;drawPortalMarker.y=z.portal.y;drawPlayerMarker.y=player.y;
 drawables.push(drawCampMarker,drawScoutMarker,drawPortalMarker,drawPlayerMarker);
 for(const e of entities){if(e.hp>0&&Math.abs(e.x-player.x)<W+240&&Math.abs(e.y-player.y)<H*1.2)drawables.push(e)}
 drawables.sort((a,b)=>a.y-b.y);
 for(const d of drawables){
  if(d===drawCampMarker)drawCamp(z);
  else if(d===drawScoutMarker)drawScout(z);
  else if(d===drawPortalMarker)drawPortal(z);
  else if(d===drawPlayerMarker)drawPlayer();
  else if(d.kind==='resource')drawResource(d);
  else drawEntity(d);
 }
 drawLoot();drawProjectiles();drawParticles();drawFloatingTexts();drawV27Labels();
}

function refreshPerformanceMonitorVisibility(){
  if (!ui.perf) return;
  ui.perf.classList.toggle('hidden', !perfMonitorEnabled);
  if (!perfMonitorEnabled) return;
  ui.perfFps.textContent = `${perfActualFps.toFixed(0)} FPS`;
  ui.perfTarget.textContent = ` target ${settings.fps} · RAF ${rafCallbackRate.toFixed(0)}`;
  ui.perfFrame.textContent = `${perfAvgFrameMs.toFixed(1)} ms frame`;
  ui.perfRender.textContent = ` · ${perfAvgRenderMs.toFixed(1)} ms render`;
  ui.perfScale.textContent = `Scale ${effectiveRenderScale().toFixed(2)} · ${settings.quality}`;
  ui.perfDevice.textContent = ` · ${device.ios?'iOS':device.android?'Android':'Mobile'} · v${BUILD_VERSION}`;if(ui.perfPill){ui.perfPill.classList.toggle('hidden',!perfMonitorEnabled);ui.perfPillFps.textContent=perfActualFps.toFixed(0);ui.perfPillMs.textContent=perfAvgFrameMs.toFixed(1)}
}

function renderFrame(nowTime){
 rafId=requestAnimationFrame(renderFrame);
 rafCallbackCount++;
 const rafGap=rafLastNow?nowTime-rafLastNow:0;rafLastNow=nowTime;
 if(rafCallbackWindow<=0)rafCallbackWindow=nowTime;
 const rafElapsed=nowTime-rafCallbackWindow;
 if(rafElapsed>=500){rafCallbackRate=rafCallbackCount*1000/rafElapsed;rafCallbackCount=0;rafCallbackWindow=nowTime}
 if(lastFrame===0){lastFrame=nowTime;return}
 const elapsed=Math.min(250,Math.max(0,nowTime-lastFrame));
 lastFrame=nowTime;
 frameAccumulator+=elapsed;
 const fpsTarget=clamp(Number(settings.fps)||60,30,120);
 const interval=1000/fpsTarget;
 if(frameAccumulator+0.05<interval)return;
 const frameTimeMs=frameAccumulator;
 frameAccumulator=frameAccumulator%interval;
 const dt=Math.min(.05,Math.max(.001,frameTimeMs/1000));
 const t0=performance.now();
 update(dt);drawWorld();
 mapAccumulator+=frameTimeMs;
 if(mapAccumulator>=66.67){mapAccumulator%=66.67;drawMap()}
 const renderMs=performance.now()-t0;
 updatePerformanceMonitor(nowTime,renderMs,frameTimeMs);
}
function hideLoading(){if(ui.loading&&!ui.loading.classList.contains('hidden'))ui.loading.classList.add('hidden')}
function firstPaint(){updateNetworkStatus();applyGraphics();resetZone();update(0);updateUI();drawWorld();drawMap();resetFrameLimiter();if(!rafId)rafId=requestAnimationFrame(renderFrame)}
async function boot(){
  ui.loadFill.style.width='5%';
  // Never block the playable build on texture/network decoding. This is especially
  // important for iOS standalone web apps where an image request may remain pending.
  const hardFailSafe=setTimeout(()=>{firstPaint();hideLoading()},1600);
  try{
    firstPaint();
    ui.loadFill.style.width='15%';
    setTimeout(hideLoading,220);
    await loadTextures();
    applyGraphics();drawWorld();drawMap();ui.loadFill.style.width='100%';
  }catch(err){
    console.error('Aethernfall boot recovery',err);
    try{firstPaint()}catch(_){ }
  }finally{clearTimeout(hardFailSafe);hideLoading()}
}
refreshPerformanceMonitorVisibility();if(globalThis.__AETHER_TEST__){globalThis.__AETHER_TEST_API__={state:()=>({zoneId,player,settings,quest:questState(),objective:currentObjective(),entities,lootDrops,perf:{fps:perfActualFps,frameMs:perfAvgFrameMs,renderMs:perfAvgRenderMs}}),resetZone,interact,skill,attack,transitionZone,advanceQuest,renderFrame,applyGraphics,update,nearbyInteraction,zones,player,setFps:f=>{settings.fps=Number(f);resetFrameLimiter()},setQuality:q=>{settings.quality=q;applyGraphics()},getPerf:()=>({fps:perfActualFps,frameMs:perfAvgFrameMs,renderMs:perfAvgRenderMs})};}else boot();
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js?v=3200',{scope:'./'}).catch(()=>{})}
})();