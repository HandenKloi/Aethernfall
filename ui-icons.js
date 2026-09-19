'use strict';

(() => {
  const SHEETS = Object.freeze({
    actions: Object.freeze(['attack','block','perfect-block','dodge','interact','supply','wind-slash','triple-pulse','second-wind']),
    navigation: Object.freeze(['inventory','quests','shop','menu','close','back','travel','map','game','graphics','audio','controls','accessibility','system','reset']),
    camp: Object.freeze(['rest','contracts','craft','merchant','equipment','runes','training','lore','gold','wood','ore','herb','token','shard']),
    map: Object.freeze(['camp','npc','portal','boss','shrine','mine','ruin','outpost','undiscovered']),
    status: Object.freeze(['health','stamina','xp','cooldown','locked','available','warning','boss','autosave','offline','update'])
  });
  const PATHS = Object.freeze(Object.fromEntries(Object.keys(SHEETS).map(sheet => [sheet, `assets/ui/${sheet}.svg`])));
  const DEFAULT_SHEET = new Map();
  for (const [sheet, ids] of Object.entries(SHEETS)) for (const id of ids) if (!DEFAULT_SHEET.has(id)) DEFAULT_SHEET.set(id, sheet);
  for (const [id, sheet] of [['boss','status'],['camp','map'],['portal','map']]) DEFAULT_SHEET.set(id, sheet);

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
  }

  function assertIcon(sheet, id) {
    if (!Object.hasOwn(SHEETS, sheet)) throw new TypeError(`Unknown UI icon sheet: ${sheet}`);
    if (!SHEETS[sheet].includes(id)) throw new TypeError(`Unknown UI icon: ${sheet}:${id}`);
  }

  function sheets() { return Object.keys(SHEETS); }
  function sheetFor(id) { return DEFAULT_SHEET.get(id) || null; }

  function use(sheet, id, label = '') {
    assertIcon(sheet, id);
    const href = `${PATHS[sheet]}#${id}`;
    return `<svg class="uiIcon" aria-hidden="true" focusable="false"><use href="${href}"></use></svg>` +
      (label ? `<span class="uiIconLabel">${escapeHTML(label)}</span>` : '');
  }

  function parseBinding(value) {
    const [sheet, id, extra] = String(value || '').split(':');
    if (extra !== undefined) return null;
    try { assertIcon(sheet, id); return { sheet, id }; } catch (_) { return null; }
  }

  async function sheetAvailable(sheet, baseURI) {
    const url = new URL(PATHS[sheet], baseURI);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
      const response = await fetch(url, { cache:'force-cache', credentials:'same-origin', signal: controller?.signal });
      return response.ok;
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function mount(root = document) {
    if (!root?.querySelectorAll || typeof fetch !== 'function') return { mounted:0, failed:sheets() };
    const hosts = [...root.querySelectorAll('[data-ui-icon]')];
    const baseURI = root.baseURI || globalThis.document?.baseURI || globalThis.location?.href || './';
    const required = [...new Set(hosts.map(host => parseBinding(host.dataset.uiIcon)?.sheet).filter(Boolean))];
    const states = await Promise.all(required.map(async sheet => [sheet, await sheetAvailable(sheet, baseURI)]));
    const available = new Map(states);
    let mounted = 0;
    for (const host of hosts) {
      const binding = parseBinding(host.dataset.uiIcon);
      if (!binding || !available.get(binding.sheet)) {
        host.classList?.add('uiIconMissing');
        host.querySelector?.('.uiIconFallback')?.removeAttribute?.('aria-hidden');
        continue;
      }
      host.innerHTML = use(binding.sheet, binding.id);
      host.dataset.iconMounted = 'true';
      mounted++;
    }
    return { mounted, failed:required.filter(sheet => !available.get(sheet)) };
  }

  function set(target, sheet, id) {
    assertIcon(sheet, id);
    const host = target?.matches?.('[data-ui-icon]') ? target : target?.querySelector?.('[data-ui-icon]');
    if (!host) return false;
    const binding = `${sheet}:${id}`;
    if (host.dataset.uiIcon === binding) return true;
    host.dataset.uiIcon = binding;
    const useNode = host.querySelector?.('use');
    if (useNode) useNode.setAttribute('href', `${PATHS[sheet]}#${id}`);
    return true;
  }

  function drawMarker(ctx, id, x, y, size = 10, options = {}) {
    if (!ctx || !SHEETS.map.includes(id)) return false;
    const scale = size / 24;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(scale, scale);
    ctx.lineWidth = Math.max(1.6, 2 / Math.max(scale, .5));
    ctx.strokeStyle = options.color || '#f5e5a4';
    ctx.fillStyle = options.fill || 'rgba(9,18,17,.84)';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (id === 'camp') {
      ctx.moveTo(3,20); ctx.lineTo(12,3); ctx.lineTo(21,20); ctx.closePath();
    } else if (id === 'npc') {
      ctx.arc(12,7,3.5,0,Math.PI*2); ctx.moveTo(5,21); ctx.quadraticCurveTo(12,10,19,21);
    } else if (id === 'portal') {
      ctx.ellipse(12,12,7,10,0,0,Math.PI*2); ctx.moveTo(15,12); ctx.ellipse(12,12,3,6,0,0,Math.PI*2);
    } else if (id === 'boss') {
      ctx.moveTo(3,8); ctx.lineTo(8,11); ctx.lineTo(12,3); ctx.lineTo(16,11); ctx.lineTo(21,8); ctx.lineTo(18,20); ctx.lineTo(6,20); ctx.closePath();
    } else if (id === 'shrine') {
      ctx.moveTo(5,21); ctx.lineTo(19,21); ctx.moveTo(8,21); ctx.lineTo(8,9); ctx.lineTo(16,9); ctx.lineTo(16,21); ctx.moveTo(6,9); ctx.lineTo(12,3); ctx.lineTo(18,9); ctx.closePath();
    } else if (id === 'mine') {
      ctx.moveTo(3,21); ctx.lineTo(7,8); ctx.quadraticCurveTo(12,2,17,8); ctx.lineTo(21,21); ctx.closePath(); ctx.moveTo(8,21); ctx.lineTo(8,14); ctx.lineTo(16,14); ctx.lineTo(16,21);
    } else if (id === 'ruin') {
      ctx.moveTo(4,21); ctx.lineTo(4,7); ctx.lineTo(8,7); ctx.lineTo(8,12); ctx.lineTo(12,12); ctx.lineTo(12,4); ctx.lineTo(16,4); ctx.lineTo(16,12); ctx.lineTo(20,12); ctx.lineTo(20,21); ctx.closePath();
    } else if (id === 'outpost') {
      ctx.rect(5,8,14,13); ctx.moveTo(5,8); ctx.lineTo(9,5); ctx.lineTo(12,8); ctx.lineTo(16,5); ctx.lineTo(19,8); ctx.moveTo(9,21); ctx.lineTo(9,15); ctx.lineTo(15,15); ctx.lineTo(15,21);
    } else {
      ctx.arc(12,12,9,0,Math.PI*2); ctx.moveTo(9,9); ctx.quadraticCurveTo(12,5,15,9); ctx.quadraticCurveTo(15,12,12,14); ctx.lineTo(12,17);
    }
    if (options.fill !== false) ctx.fill();
    ctx.stroke();
    ctx.restore();
    return true;
  }

  const api = Object.freeze({ sheets, sheetFor, use, mount, set, drawMarker });
  globalThis.AetherUIIcons = api;
  if (globalThis.document?.addEventListener) globalThis.document.addEventListener('DOMContentLoaded', () => { mount().catch(() => {}); }, { once:true });
})();
