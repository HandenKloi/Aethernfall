"use strict";

/* Aethernfall 4.0.2 — local procedural audio mixer, no network assets. */
(() => {
  'use strict';

  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));
  const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  const state = {
    master: .8,
    music: .55,
    ambient: .65,
    sfx: .8,
    musicEnabled: true,
    zone: 'mistwood'
  };

  let ctx = null, masterGain = null, musicGain = null, ambientGain = null, sfxGain = null;
  let musicNodes = [], ambientNodes = [], unlocked = false, lastError = '';

  function gain(value, destination) {
    const node = ctx.createGain();
    node.gain.value = value;
    node.connect(destination);
    return node;
  }

  function contextState() {
    return ctx?.state || (AudioCtor ? 'not-created' : 'unavailable');
  }

  function noteContextState() {
    unlocked = !!ctx && ctx.state === 'running';
    if (unlocked && !musicNodes.length) rebuildBed();
  }

  function ensure() {
    if (ctx || !AudioCtor) return !!ctx;
    try {
      try { ctx = new AudioCtor({ latencyHint: 'interactive' }); }
      catch { ctx = new AudioCtor(); }
      masterGain = gain(state.master, ctx.destination);
      musicGain = gain(state.music * (state.musicEnabled ? 1 : 0), masterGain);
      ambientGain = gain(state.ambient, masterGain);
      sfxGain = gain(state.sfx, masterGain);
      if (typeof ctx.addEventListener === 'function') ctx.addEventListener('statechange', noteContextState);
      else if ('onstatechange' in ctx) ctx.onstatechange = noteContextState;
      noteContextState();
      return true;
    } catch (err) {
      lastError = err?.message || String(err || 'AudioContext creation failed');
      return false;
    }
  }

  // Safari/iOS has historically needed an actual source node to be started from
  // a user gesture before the output path becomes reliably audible.
  function primeOutput() {
    if (!ctx || !masterGain) return false;
    try {
      const buffer = ctx.createBuffer(1, 1, Math.max(8000, ctx.sampleRate || 44100));
      const source = ctx.createBufferSource();
      const g = ctx.createGain();
      source.buffer = buffer;
      g.gain.value = .000001;
      source.connect(g);
      g.connect(masterGain);
      source.onended = () => {
        try { source.disconnect(); } catch {}
        try { g.disconnect(); } catch {}
      };
      source.start(0);
      source.stop?.(0.01);
      return true;
    } catch (err) {
      lastError = err?.message || String(err || 'Audio priming failed');
      return false;
    }
  }

  async function unlock() {
    if (!ensure()) return false;
    try {
      // Prime synchronously while the browser still considers this call part of
      // the user's gesture. This is harmless on Chromium and important on WebKit.
      primeOutput();
      if (ctx.state !== 'running' && typeof ctx.resume === 'function') await ctx.resume();
      noteContextState();
      if (unlocked) {
        primeOutput();
        if (!musicNodes.length) rebuildBed();
        lastError = '';
      }
      return unlocked;
    } catch (err) {
      unlocked = false;
      lastError = err?.message || String(err || 'AudioContext resume failed');
      return false;
    }
  }

  function stopNodes(nodes) {
    for (const node of nodes) {
      try { node.stop?.(); } catch {}
      try { node.disconnect?.(); } catch {}
    }
    nodes.length = 0;
  }

  function zoneTone() {
    if (state.zone === 'stonevale') return { root: 92.5, fifth: 138.6, third: 184.8, filter: 340, rustle: 960, type: 'triangle' };
    if (state.zone === 'ashfield') return { root: 82.4, fifth: 123.5, third: 164.8, filter: 270, rustle: 1450, type: 'sawtooth' };
    return { root: 110, fifth: 164.8, third: 220, filter: 420, rustle: 1180, type: 'sine' };
  }

  function makeNoiseBuffer(seconds = 2, color = 'brown') {
    const len = Math.max(1, Math.floor((ctx.sampleRate || 44100) * seconds));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate || 44100);
    const data = buffer.getChannelData(0);
    let seed = 9137, brown = 0;
    for (let i = 0; i < len; i++) {
      seed = seed * 16807 % 2147483647;
      const white = seed / 1073741823.5 - 1;
      if (color === 'brown') {
        brown = (brown + white * .14) / 1.02;
        data[i] = Math.max(-1, Math.min(1, brown * 3.2));
      } else if (color === 'pink') {
        brown = brown * .96 + white * .04;
        data[i] = Math.max(-1, Math.min(1, white * .25 + brown * .95));
      } else data[i] = white * .4;
    }
    return buffer;
  }

  function rebuildBed() {
    if (!ctx || !unlocked || ctx.state !== 'running') return;
    stopNodes(musicNodes); stopNodes(ambientNodes);
    const tone = zoneTone(), now = ctx.currentTime;
    // 4.0.2 raises the default clarity on phone speakers and replaces the raw
    // white-noise ambience bed with shaped, filtered environmental layers.
    const musicBus = gain(.22, musicGain), ambienceBus = gain(.12, ambientGain);
    musicNodes.push(musicBus); ambientNodes.push(ambienceBus);
    for (const [freq, detune, level, wave] of [[tone.root, -5, .55, tone.type], [tone.fifth, 3, .26, tone.type], [tone.third, 7, .15, 'triangle']]) {
      const osc = ctx.createOscillator(), g = gain(level, musicBus);
      osc.type = wave; osc.frequency.value = freq; osc.detune.value = detune;
      osc.connect(g);
      g.gain.setValueAtTime(Math.max(.0001, level * .75), now);
      g.gain.setTargetAtTime(level, now + .2, 1.6);
      osc.start(now);
      musicNodes.push(osc, g);
    }
    const wind = ctx.createBufferSource(), windHP = ctx.createBiquadFilter(), windLP = ctx.createBiquadFilter(), windGain = gain(.95, ambienceBus);
    wind.buffer = makeNoiseBuffer(4, 'brown'); wind.loop = true;
    windHP.type = 'highpass'; windHP.frequency.value = 34;
    windLP.type = 'lowpass'; windLP.frequency.value = tone.filter; windLP.Q.value = .35;
    wind.connect(windHP); windHP.connect(windLP); windLP.connect(windGain); wind.start(now);
    ambientNodes.push(wind, windHP, windLP, windGain);
    const rustle = ctx.createBufferSource(), rustleFilter = ctx.createBiquadFilter(), rustleGain = gain(state.zone === 'ashfield' ? .18 : .14, ambienceBus);
    rustle.buffer = makeNoiseBuffer(2.5, state.zone === 'ashfield' ? 'pink' : 'brown'); rustle.loop = true;
    rustleFilter.type = state.zone === 'ashfield' ? 'bandpass' : 'highpass';
    rustleFilter.frequency.value = tone.rustle; rustleFilter.Q.value = state.zone === 'ashfield' ? .7 : .25;
    rustle.connect(rustleFilter); rustleFilter.connect(rustleGain); rustle.start(now);
    ambientNodes.push(rustle, rustleFilter, rustleGain);
  }

  function configure(next = {}) {
    for (const key of ['master', 'music', 'ambient', 'sfx']) if (key in next) state[key] = clamp(next[key]);
    if ('musicEnabled' in next) state.musicEnabled = next.musicEnabled !== false;
    if (masterGain) masterGain.gain.setTargetAtTime(state.master, ctx.currentTime, .025);
    if (musicGain) musicGain.gain.setTargetAtTime(state.music * (state.musicEnabled ? 1 : 0), ctx.currentTime, .025);
    if (ambientGain) ambientGain.gain.setTargetAtTime(state.ambient, ctx.currentTime, .025);
    if (sfxGain) sfxGain.gain.setTargetAtTime(state.sfx, ctx.currentTime, .025);
    if (unlocked && ctx?.state === 'running' && !musicNodes.length) rebuildBed();
  }

  function setZone(zone) {
    if (!['mistwood', 'stonevale', 'ashfield'].includes(zone) || zone === state.zone) return;
    state.zone = zone;
    rebuildBed();
  }

  function tone(freq, duration, level = .10, type = 'sine', slide = 1) {
    if (!ctx || !unlocked || ctx.state !== 'running' || !sfxGain) return false;
    const now = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), now + duration);
    g.gain.setValueAtTime(Math.max(.0001, level), now);
    g.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(g); g.connect(sfxGain);
    osc.onended = () => {
      try { osc.disconnect(); } catch {}
      try { g.disconnect(); } catch {}
    };
    osc.start(now); osc.stop(now + duration + .02);
    return true;
  }

  const SFX = {
    attack: [190, .09, .12, 'triangle', .72],
    hit: [120, .08, .14, 'square', .65],
    kill: [95, .22, .13, 'sawtooth', .45],
    dodge: [260, .12, .09, 'sine', 1.5],
    drink: [430, .18, .10, 'sine', 1.35],
    pickup: [560, .11, .08, 'sine', 1.25],
    quest: [392, .24, .09, 'triangle', 1.5],
    portal: [220, .34, .09, 'sine', 2],
    discovery: [523, .30, .09, 'sine', 1.5],
    block: [145, .11, .10, 'triangle', .85],
    ui: [330, .05, .06, 'sine', 1.05],
    test: [660, .18, .12, 'sine', 1.18]
  };

  function playSfx(name) {
    const p = SFX[name];
    return p ? tone(...p) : false;
  }

  function sfx(name) {
    if (unlocked && ctx?.state === 'running') return playSfx(name);
    // If feedback itself happens during a gesture, use that gesture to unlock.
    unlock().then(ok => { if (ok) playSfx(name); });
    return false;
  }

  function suspend() {
    unlocked = false;
    try { return ctx?.suspend?.(); } catch { return undefined; }
  }

  function resume() { return unlock(); }

  function snapshot() {
    return {
      ...state,
      available: !!AudioCtor,
      unlocked,
      contextState: contextState(),
      lastError
    };
  }

  window.AetherAudio = { unlock, configure, setZone, sfx, suspend, resume, snapshot };
})();
