(() => {
'use strict';

const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const ui={hp:document.getElementById('hpFill'),xp:document.getElementById('xpFill'),level:document.getElementById('levelText'),zone:document.getElementById('zoneText'),objective:document.getElementById('objectiveText'),toast:document.getElementById('toast'),modal:document.getElementById('modal'),modalTitle:document.getElementById('modalTitle'),modalBody:document.getElementById('modalBody')};
let W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,2);
let joystickHandler;
function resize(){W=innerWidth;H=innerHeight;canvas.width=W*DPR;canvas.height=H*DPR;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0)} addEventListener('resize',resize);resize();

const SAVE='aethernfall_save_v1';
const zones={
 mistwood:{name:'Туманный лес',bg:'#38543a',ground:'#526e48',next:'stonevale',objective:'Соберите древесину и победите падшего охотника'},
 stonevale:{name:'Каменная долина',bg:'#4d4b42',ground:'#696452',next:'mistwood',objective:'Добудьте руду и победите стража руин'}
};
const player={x:420,y:320,r:18,hp:220,maxHp:220,level:1,xp:0,xpNeed:100,stamina:100,maxStamina:100,gold:80,dir:0,speed:165,blocking:false,dodgeUntil:0,dodgeCd:0,attackCd:0,weapon:'Железный меч',damage:28,inventory:{wood:0,ore:0,herb:0},equipment:{weapon:'Железный меч',armor:'Кожаный панцирь'},quest:{wood:0,ore:0,raider:0,guardian:0}};
let zoneId='mistwood',entities=[],projectiles=[],particles=[],messageTimer=0,last=performance.now(),time=0,keys={},mouse={x:0,y:0,down:false},joystick={active:false,id:null,x:0,y:0};

function save(){localStorage.setItem(SAVE,JSON.stringify({player,zoneId}))}
function load(){try{const s=JSON.parse(localStorage.getItem(SAVE));if(s){Object.assign(player,s.player);zoneId=s.zoneId||zoneId}}catch{}}
load();
function toast(t){ui.toast.textContent=t;ui.toast.style.opacity=1;messageTimer=2.3}
function gainXP(n){player.xp+=n;while(player.xp>=player.xpNeed){player.xp-=player.xpNeed;player.level++;player.xpNeed=Math.round(player.xpNeed*1.28);player.maxHp+=24;player.hp=player.maxHp;player.damage+=4;toast('Новый уровень: '+player.level)}}
function spawn(type,x,y){const base={type,x,y,hp:100,maxHp:100,r:17,speed:70,cd:0,hit:0};if(type==='raider'){base.hp=120;base.maxHp=120;base.speed=72;base.damage=10} if(type==='guardian'){base.hp=300;base.maxHp=300;base.r=27;base.speed=44;base.damage=18} if(type==='boar'){base.hp=80;base.maxHp=80;base.r=15;base.speed=95;base.damage=8} if(type==='resource'){base.r=15;base.node=Math.random()<.5?'wood':'ore';base.hp=1} entities.push(base)}
function resetZone(){entities=[];projectiles=[];particles=[];player.x=430;player.y=340; if(zoneId==='mistwood'){for(let i=0;i<90;i++)spawn(Math.random()<.65?'boar':'raider',Math.random()*1800+100,Math.random()*1100+100);for(let i=0;i<34;i++)spawn('resource',Math.random()*1800+100,Math.random()*1100+100)}else{for(let i=0;i<60;i++)spawn(Math.random()<.75?'raider':'boar',Math.random()*1800+100,Math.random()*1100+100);for(let i=0;i<30;i++)spawn('resource',Math.random()*1800+100,Math.random()*1100+100);spawn('guardian',1500,700)}}
resetZone();

function worldToScreen(x,y){return{x:x-player.x+W/2,y:y-player.y+H/2}}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function nearestEnemy(){let best=null,bd=1e9;for(const e of entities)if((e.type==='raider'||e.type==='boar'||e.type==='guardian')&&e.hp>0){const d=dist(player,e);if(d<bd){bd=d;best=e}}return best}
function attack(){if(player.attackCd>0)return;player.attackCd=.44;const target=nearestEnemy();const dir=target?Math.atan2(target.y-player.y,target.x-player.x):player.dir;player.dir=dir;const range=62;const tx=player.x+Math.cos(dir)*range,ty=player.y+Math.sin(dir)*range;for(const e of entities){if(e.hp<=0||!(e.type==='raider'||e.type==='boar'||e.type==='guardian'))continue;if(Math.hypot(e.x-tx,e.y-ty)<e.r+30){e.hp-=player.damage;e.hit=.12;burst(e.x,e.y,'#e5c66b',7);gainXP(8);if(e.hp<=0){burst(e.x,e.y,'#d7dfdf',16);gainXP(e.type==='guardian'?60:15);if(e.type==='raider'&&zoneId==='mistwood')player.quest.raider++ ;if(e.type==='guardian')player.quest.guardian++;if(Math.random()<.55){player.gold+=Math.round(4+Math.random()*9)}}}}}
function skill(n){if(n===1){if(player.stamina<18)return toast('Недостаточно выносливости');player.stamina-=18;attack();player.damage+=0;}
if(n===2){if(player.stamina<25)return toast('Недостаточно выносливости');player.stamina-=25;const target=nearestEnemy();if(target){const a=Math.atan2(target.y-player.y,target.x-player.x);player.dir=a;for(const e of entities){if(Math.hypot(e.x-(player.x+Math.cos(a)*95),e.y-(player.y+Math.sin(a)*95))<70&&e.hp>0&&['raider','boar','guardian'].includes(e.type)){e.hp-=player.damage*1.7;burst(e.x,e.y,'#96bde0',12)}}}}
if(n===3){if(player.stamina<30)return toast('Недостаточно выносливости');player.stamina-=30;const target=nearestEnemy();if(target){const a=Math.atan2(target.y-player.y,target.x-player.x);projectiles.push({x:player.x,y:player.y,vx:Math.cos(a)*430,vy:Math.sin(a)*430,life:1.0,damage:player.damage*1.25})}}
}
function dodge(){if(player.stamina<28||performance.now()/1000<player.dodgeCd)return;const now=performance.now()/1000;player.stamina-=28;player.dodgeUntil=now+.22;player.dodgeCd=now+.65;burst(player.x,player.y,'#9ab6c9',8)}
function gather(){for(let i=entities.length-1;i>=0;i--){const e=entities[i];if(e.type==='resource'&&dist(player,e)<48){if(e.node==='wood'){player.inventory.wood++;player.quest.wood++}else{player.inventory.ore++;player.quest.ore++}entities.splice(i,1);gainXP(6);toast('Ресурс добыт');return true}}return false}
function craft(){if(player.inventory.wood>=3&&player.inventory.ore>=2){player.inventory.wood-=3;player.inventory.ore-=2;player.gold+=24;player.damage+=3;toast('Создано улучшение оружия: +3 урона');save();return}toast('Нужно 3 древесины и 2 руды')}
function interact(){if(gather())return;const npc={x:260,y:270};if(Math.hypot(player.x-npc.x,player.y-npc.y)<70){const done=(zoneId==='mistwood'&&player.quest.raider>=8&&player.quest.wood>=5)||(zoneId==='stonevale'&&player.quest.guardian>=1&&player.quest.ore>=5);if(done){player.gold+=120;gainXP(90);toast('Задание выполнено: +120 золота');player.quest.wood=0;player.quest.ore=0;player.quest.raider=0;player.quest.guardian=0;save()}else toast('Квест: '+zones[zoneId].objective);return}const gate=zoneId==='mistwood'?{x:1780,y:720}:{x:100,y:720};if(Math.hypot(player.x-gate.x,player.y-gate.y)<90){zoneId=zones[zoneId].next;resetZone();toast('Переход в '+zones[zoneId].name);save()}}
function burst(x,y,c,n){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*150,vy:(Math.random()-.5)*150,life:.5+Math.random()*.4,c})}

function inputVector(){let x=0,y=0;if(keys.w||keys.ArrowUp)y--;if(keys.s||keys.ArrowDown)y++;if(keys.a||keys.ArrowLeft)x--;if(keys.d||keys.ArrowRight)x++;if(joystick.active){x=joystick.x;y=joystick.y}const m=Math.hypot(x,y);return m>1?{x:x/m,y:y/m}:{x,y}}
addEventListener('keydown',e=>{keys[e.key]=true; if(e.key===' '){e.preventDefault();dodge()} if(e.key.toLowerCase()==='q')skill(1);if(e.key.toLowerCase()==='e')skill(2);if(e.key.toLowerCase()==='r')skill(3);if(e.key.toLowerCase()==='f')interact();if(e.key.toLowerCase()==='c')craft();if(e.key.toLowerCase()==='i')openInventory()});
addEventListener('keyup',e=>keys[e.key]=false);canvas.addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY});canvas.addEventListener('mousedown',e=>{if(e.button===0)attack();mouse.down=true});canvas.addEventListener('mouseup',()=>mouse.down=false);
const joyEl=document.getElementById('joystick'),stick=document.getElementById('stick');
function joyUpdate(t){const r=joyEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=t.clientX-cx,dy=t.clientY-cy;const max=r.width*.37,len=Math.hypot(dx,dy),s=Math.min(1,max/Math.max(len,1));dx*=s;dy*=s;stick.style.transform=`translate(${dx}px,${dy}px)`;joystick.x=dx/max;joystick.y=dy/max}
joystickHandler=(ev)=>{const t=ev.changedTouches[0];if(joystick.id!==null&&t.identifier!==joystick.id)return;if(ev.type==='touchstart'){joystick.active=true;joystick.id=t.identifier} if(ev.type==='touchend'||ev.type==='touchcancel'){joystick.active=false;joystick.id=null;joystick.x=joystick.y=0;stick.style.transform='translate(0,0)'} else joyUpdate(t)};
joyEl.addEventListener('touchstart',joystickHandler,{passive:false});joyEl.addEventListener('touchmove',joystickHandler,{passive:false});joyEl.addEventListener('touchend',joystickHandler,{passive:false});joyEl.addEventListener('touchcancel',joystickHandler,{passive:false});
document.querySelectorAll('.action').forEach(b=>{const act=b.dataset.act;b.addEventListener('touchstart',e=>{e.preventDefault();if(act==='attack')attack();if(act==='dodge')dodge();if(act==='block')player.blocking=true;if(act==='skill1')skill(1);if(act==='skill2')skill(2);if(act==='skill3')skill(3)},{passive:false});b.addEventListener('touchend',e=>{if(act==='block')player.blocking=false},{passive:false});b.addEventListener('mousedown',()=>{if(act==='attack')attack();if(act==='dodge')dodge();if(act==='block')player.blocking=true;if(act==='skill1')skill(1);if(act==='skill2')skill(2);if(act==='skill3')skill(3);if(act==='use')interact()});b.addEventListener('mouseup',()=>{if(act==='block')player.blocking=false})});

document.getElementById('inventoryBtn').onclick=openInventory;document.getElementById('menuBtn').onclick=openMenu;document.getElementById('modalClose').onclick=closeModal;
function showModal(title,body){ui.modalTitle.textContent=title;ui.modalBody.innerHTML=body;ui.modal.classList.remove('hidden')}function closeModal(){ui.modal.classList.add('hidden')}
function openInventory(){showModal('Сумка',`<div class="grid"><div class="card"><h3>Оружие</h3><p>${player.equipment.weapon}</p><p>Урон: <span class="gold">${player.damage}</span></p></div><div class="card"><h3>Броня</h3><p>${player.equipment.armor}</p></div><div class="card"><h3>Древесина</h3><p>${player.inventory.wood}</p></div><div class="card"><h3>Руда</h3><p>${player.inventory.ore}</p></div><div class="card"><h3>Травы</h3><p>${player.inventory.herb}</p></div><div class="card"><h3>Золото</h3><p class="gold">${player.gold}</p></div></div><hr><button class="btn" id="craftBtn">Создать улучшение оружия (3 дерева + 2 руды)</button>`);document.getElementById('craftBtn').onclick=craft}
function openMenu(){showModal('Aethernfall — релизная версия',`<p>Зона: <b>${zones[zoneId].name}</b></p><p>Уровень: <b>${player.level}</b></p><p>Управление: ручной бой, блок, уклонение и три активных навыка. Автобоя и автопути нет.</p><p>Переходы между крупными зонами выполняются загрузкой отдельной зоны.</p><div class="grid"><div class="card"><h3>Сохранение</h3><p>Локальное сохранение автоматически.</p></div><div class="card"><h3>Сброс</h3><p>Удаляет локальный прогресс.</p><button class="btn" id="resetBtn">Сбросить</button></div></div>`);document.getElementById('resetBtn').onclick=()=>{localStorage.removeItem(SAVE);location.reload()}}

function update(dt){time+=dt;const v=inputVector();const now=performance.now()/1000;player.blocking=player.blocking||keys.Shift;player.attackCd=Math.max(0,player.attackCd-dt);player.stamina=Math.min(player.maxStamina,player.stamina+(player.blocking?8:20)*dt);if(v.x||v.y){player.dir=Math.atan2(v.y,v.x);let speed=player.speed;if(player.blocking)speed*=.45;if(now<player.dodgeUntil)speed*=2.8;player.x+=v.x*speed*dt;player.y+=v.y*speed*dt}player.x=clamp(player.x,80,1840);player.y=clamp(player.y,80,1240);
for(const e of entities){if(e.hp<=0)continue;if(e.type==='resource')continue;e.hit=Math.max(0,e.hit-dt);e.cd=Math.max(0,e.cd-dt);const d=dist(player,e);if(d<460){const a=Math.atan2(player.y-e.y,player.x-e.x);if(d>(e.r+player.r+8)){e.x+=Math.cos(a)*e.speed*dt;e.y+=Math.sin(a)*e.speed*dt}else if(e.cd<=0){e.cd=1.35;if(now>=player.dodgeUntil){const dmg=player.blocking?Math.ceil(e.damage*.3):e.damage;player.hp=Math.max(0,player.hp-dmg);burst(player.x,player.y,'#c85761',4);if(player.hp<=0){player.hp=player.maxHp;player.x=430;player.y=340;toast('Вы были повержены и вернулись в лагерь')}}}}}
for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;let hit=false;for(const e of entities){if(hit||e.hp<=0)continue;if(['raider','boar','guardian'].includes(e.type)&&Math.hypot(e.x-p.x,e.y-p.y)<e.r+10){e.hp-=p.damage;burst(e.x,e.y,'#96bde0',8);if(e.hp<=0){gainXP(e.type==='guardian'?60:15);if(e.type==='guardian')player.quest.guardian++}hit=true}}if(p.life<=0||hit)projectiles.splice(i,1)}
for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1)}
if(messageTimer>0){messageTimer-=dt;if(messageTimer<=0)ui.toast.style.opacity=0}if(Math.random()<dt*.04)save();
ui.hp.style.width=(player.hp/player.maxHp*100)+'%';ui.xp.style.width=(player.xp/player.xpNeed*100)+'%';ui.level.textContent='Lv '+player.level;ui.zone.textContent=zones[zoneId].name;ui.objective.textContent=zones[zoneId].objective}

function draw(){ctx.clearRect(0,0,W,H);ctx.fillStyle=zones[zoneId].bg;ctx.fillRect(0,0,W,H);const ox=W/2-player.x,oy=H/2-player.y;ctx.save();ctx.translate(ox,oy);
// stylized environment
ctx.fillStyle=zones[zoneId].ground;ctx.fillRect(80,80,1760,1160);for(let x=120;x<1840;x+=90){for(let y=120;y<1240;y+=90){if(((x+y)/90)%2<1){ctx.fillStyle='rgba(255,255,255,.02)';ctx.fillRect(x,y,40,40)}}}
// structures
ctx.fillStyle=zoneId==='mistwood'?'#34422d':'#454038';ctx.fillRect(190,200,150,110);ctx.fillRect(1660,610,110,160);ctx.fillStyle='#8b6a46';ctx.fillRect(235,250,60,35);
// quest NPC
ctx.fillStyle='#e2c16f';ctx.fillRect(244,238,32,48);ctx.fillStyle='#1d2730';ctx.beginPath();ctx.arc(260,228,16,0,Math.PI*2);ctx.fill();
// gate
const gate=zoneId==='mistwood'?{x:1780,y:720}:{x:100,y:720};ctx.strokeStyle='#79a8d5';ctx.lineWidth=7;ctx.beginPath();ctx.arc(gate.x,gate.y,42,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(70,120,190,.18)';ctx.beginPath();ctx.arc(gate.x,gate.y,34,0,Math.PI*2);ctx.fill();
for(const e of entities){if(e.hp<=0)continue;if(e.type==='resource'){drawResource(e);continue}drawEnemy(e)}
// projectiles
for(const p of projectiles){ctx.fillStyle='#cfe8ff';ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill()}
// player
ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.dir);ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(0,10,24,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d4d9de';ctx.beginPath();ctx.arc(0,-3,17,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3e5d76';ctx.fillRect(-13,2,26,23);ctx.strokeStyle='#e3c77b';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(2,-2);ctx.lineTo(29,-2);ctx.stroke();if(player.blocking){ctx.strokeStyle='#b7cfe3';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,29,-.9,.9);ctx.stroke()}ctx.restore();
for(const p of particles){ctx.globalAlpha=Math.max(0,p.life*1.8);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,3+p.life*3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
ctx.restore();
// minimap
ctx.fillStyle='rgba(10,16,22,.72)';ctx.fillRect(W-128,76,112,112);ctx.strokeStyle='rgba(255,255,255,.12)';ctx.strokeRect(W-128,76,112,112);ctx.fillStyle='#9bb47e';ctx.fillRect(W-122,82,100,100);ctx.fillStyle='#d9dfe3';ctx.beginPath();ctx.arc(W-122+(player.x/1840)*100,82+(player.y/1240)*100,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#78a6d1';ctx.beginPath();const g=zoneId==='mistwood'?{x:1780,y:720}:{x:100,y:720};ctx.arc(W-122+(g.x/1840)*100,82+(g.y/1240)*100,3,0,Math.PI*2);ctx.fill();}
function drawEnemy(e){ctx.save();ctx.translate(e.x,e.y);const c=e.type==='guardian'?'#8d6bba':e.type==='boar'?'#9d7152':'#8e3f45';ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(0,e.r*.7,e.r*1.2,e.r*.45,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=c;ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#1d2730';ctx.fillRect(-e.r*.7,-e.r*.3,e.r*1.4,5);ctx.fillStyle='#d95f69';ctx.fillRect(-e.r*.7,-e.r*.3,e.r*1.4*(e.hp/e.maxHp),5);ctx.restore()}
function drawResource(e){ctx.save();ctx.translate(e.x,e.y);if(e.node==='wood'){ctx.fillStyle='#745038';ctx.fillRect(-6,-12,12,24);ctx.fillStyle='#547949';ctx.beginPath();ctx.arc(-5,-12,12,0,Math.PI*2);ctx.arc(7,-7,12,0,Math.PI*2);ctx.fill()}else{ctx.fillStyle='#68737e';ctx.beginPath();ctx.moveTo(-15,10);ctx.lineTo(-9,-12);ctx.lineTo(7,-17);ctx.lineTo(17,5);ctx.lineTo(7,16);ctx.closePath();ctx.fill();ctx.fillStyle='#a2c0d4';ctx.beginPath();ctx.arc(3,-2,4,0,Math.PI*2);ctx.fill()}ctx.restore()}
function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();