"use strict";
/* Aethernfall debug overlay — catches JS errors, unhandled promise rejections,
   game console.warn/console.error calls, and frame-time gaps (freeze detector),
   and shows them in an on-screen panel. Built for iPhone play, where desktop
   DevTools aren't available: persists the last entries to localStorage so that
   even after a hard freeze forces the tab closed, the details survive for the
   next launch. Tap the 🐞 badge in the bottom-right corner to view/copy the log. */
(() => {
  'use strict';

  const MAX_ENTRIES = 80;
  const STORE_KEY = 'aef_debug_log';
  const FREEZE_THRESHOLD_MS = 700;

  function loadLog() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  function saveLog() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(log.slice(-MAX_ENTRIES))); } catch (_) {}
  }

  // Значок считает только реальные проблемы текущего запуска (ошибки, отклонённые промисы, зависания,
  // console.error), а не накопленный за все сессии лог и не информационные записи.
  const SESSION_START = new Date().toISOString();
  const COUNTED_TYPES = new Set(['error', 'promise', 'freeze', 'console.error']);
  const sessionProblems = () => log.filter(e => e.t >= SESSION_START && COUNTED_TYPES.has(e.type)).length;
  let log = loadLog();
  let panelOpen = false;

  function timeLabel(iso) {
    const match = /T(\d\d:\d\d:\d\d)/.exec(iso || '');
    return match ? match[1] : '--:--:--';
  }

  function push(entry) {
    entry.t = new Date().toISOString();
    log.push(entry);
    if (log.length > MAX_ENTRIES) log.shift();
    saveLog();
    render();
  }

  window.addEventListener('error', event => {
    push({
      type: 'error',
      message: String(event.message || 'Unknown error'),
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '',
      stack: event.error?.stack || ''
    });
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    push({
      type: 'promise',
      message: String(reason?.message || reason || 'Unhandled promise rejection'),
      stack: reason?.stack || ''
    });
  });

  // JSON.stringify бросает на циклических объектах; логгер не должен ломать вызывающий код.
  function describe(a) {
    try {
      if (a instanceof Error) return a.stack || a.message;
      return a !== null && typeof a === 'object' ? JSON.stringify(a) : String(a);
    } catch (_) {
      return Object.prototype.toString.call(a);
    }
  }
  // Mirror the game's own warnings/errors (e.g. asset pack failures) into the same log,
  // so a silent console.warn about a missing model shows up right next to any freeze.
  for (const level of ['warn', 'error']) {
    const original = console[level]?.bind(console);
    if (!original) continue;
    console[level] = (...args) => {
      original(...args);
      push({
        type: 'console.' + level,
        message: args.map(describe).join(' ')
      });
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenSinceLastTick = true;
    push({ type: 'state', message: document.hidden ? 'Вкладка свёрнута/скрыта' : 'Вкладка снова видима' });
  });

  // Freeze detector: a long gap between animation frames means the main thread was
  // blocked — but only if the page stayed visible the whole time. rAF simply pauses
  // while backgrounded, so a gap that includes hidden time is not a freeze and would
  // otherwise be reported as a false alarm every time the tab is minimized for a while.
  let lastTick = performance.now();
  let hiddenSinceLastTick = document.hidden;
  function tick(now) {
    const gap = now - lastTick;
    lastTick = now;
    if (gap > FREEZE_THRESHOLD_MS && document.visibilityState === 'visible' && !hiddenSinceLastTick) {
      push({ type: 'freeze', message: `Кадр задержан на ${Math.round(gap)} мс` });
    }
    // iOS Safari doesn't always fully suspend rAF in the background — it can keep
    // firing at a throttled rate. Track "hidden right now", not "hidden at some
    // point", so a throttled tick while still hidden doesn't clear the flag before
    // the real post-resume tick (with the huge accumulated gap) gets to see it.
    hiddenSinceLastTick = document.hidden;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // --- Minimal on-screen UI, self-contained, no external CSS needed ---
  function mount() {
    if (!document.body) { requestAnimationFrame(mount); return; }
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.setAttribute('aria-label', 'Debug log');
    badge.style.cssText = 'position:fixed;left:50%;bottom:calc(8px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483647;width:36px;height:36px;border-radius:50%;background:rgba(20,24,22,.62);color:#fff;border:1px solid rgba(255,255,255,.28);font:12px/1 -apple-system,system-ui;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;';
    document.body.appendChild(badge);

    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:8px;right:8px;bottom:52px;max-height:62vh;overflow:auto;background:rgba(8,10,9,.94);color:#dff2ea;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:10px;border-radius:10px;z-index:2147483647;display:none;white-space:pre-wrap;-webkit-user-select:text;user-select:text;border:1px solid rgba(255,255,255,.15);';
    document.body.appendChild(panel);

    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;display:none;gap:8px;';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Скопировать';
    copyBtn.style.cssText = 'flex:2;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(20,40,32,.7);color:#fff;font:12px -apple-system,system-ui;';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Очистить';
    clearBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(40,20,20,.7);color:#fff;font:12px -apple-system,system-ui;';
    bar.appendChild(copyBtn);
    bar.appendChild(clearBtn);
    document.body.appendChild(bar);

    function render() {
      const problems = sessionProblems();
      badge.textContent = problems ? '🐞' + problems : '🐞';
      if (!panelOpen) return;
      panel.textContent = log.length
        ? log.slice().reverse().map(e => `[${timeLabel(e.t)}] ${e.type.toUpperCase()}: ${e.message}${e.source ? '\n  ' + e.source : ''}${e.stack ? '\n' + e.stack : ''}`).join('\n\n')
        : 'Ошибок и зависаний пока не зафиксировано. Лог сохраняется даже после жёсткого закрытия вкладки.';
    }
    render.self = true;
    globalThis.__AETHER_DEBUG_RENDER__ = render;

    badge.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'block' : 'none';
      bar.style.display = panelOpen ? 'flex' : 'none';
      render();
    });
    copyBtn.addEventListener('click', async () => {
      const text = panel.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Скопировано ✓';
      } catch (_) {
        copyBtn.textContent = 'Не удалось — выделите текст вручную';
      }
      setTimeout(() => { copyBtn.textContent = 'Скопировать'; }, 1600);
    });
    clearBtn.addEventListener('click', () => {
      log = [];
      saveLog();
      render();
    });
  }
  mount();

  function render() {
    if (globalThis.__AETHER_DEBUG_RENDER__) globalThis.__AETHER_DEBUG_RENDER__();
  }

  globalThis.__AETHER_DEBUG__ = Object.freeze({
    log: () => log.slice(),
    clear: () => { log = []; saveLog(); render(); }
  });
})();
