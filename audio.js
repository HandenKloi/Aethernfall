"use strict";

/* Aethernfall 4.0.0 — local procedural audio mixer, no network assets. */
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
  let musicNodes = [], ambientNodes = [], unlocked = false;

  function gain(value, destination) {
    const node = ctx.createGain();
    node.gain.value = value;
    node.connect(destination);
    return node;
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
      return true;
    } catch { return false; }
  }
  async function unlock() {
    if (!ensure()) return false;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      unlocked = ctx.state === 'running';
      if (unlocked && !musicNodes.length) rebuildBed();
      return unlocked;
    } catch { return false; }
  }
  function stopNodes(nodes) {
    for (const node of nodes) {
      try { node.stop?.(); } catch {}
      try { node.disconnect?.(); } catch {}
    }
    nodes.length = 0;
  }
  function zoneTone() {
    if (state.zone === 'stonevale') return { root: 92.5, fifth: 138.6, filter: 520, type: 'triangle' };
    if (state.zone === 'ashfield') return { root: 82.4, fifth: 123.5, filter: 760, type: 'sawtooth' };
    return { root: 110, fifth: 164.8, filter: 430, type: 'sine' };
  }
  function makeNoiseBuffer(seconds = 2) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 9137;
    for (let i = 0; i < len; i++) {
      seed = seed * 16807 % 2147483647;
      data[i] = (seed / 1073741823.5 - 1) * .7;
    }
    return buffer;
  }
  function rebuildBed() {
    if (!ctx || !unlocked) return;
    stopNodes(musicNodes); stopNodes(ambientNodes);
    const tone = zoneTone(), now = ctx.currentTime;
    const musicBus = gain(.06, musicGain), ambienceBus = gain(.035, ambientGain);
    musicNodes.push(musicBus); ambientNodes.push(ambienceBus);
    for (const [freq, detune, level] of [[tone.root, -4, .58], [tone.fifth, 4, .34]]) {
      const osc = ctx.createOscillator(), g = gain(level, musicBus);
      osc.type = tone.type; osc.frequency.value = freq; osc.detune.value = detune;
      osc.start(now); musicNodes.push(osc, g);
    }
    const noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    noise.buffer = makeNoiseBuffer(2); noise.loop = true;
    filter.type = state.zone === 'ashfield' ? 'bandpass' : 'lowpass';
    filter.frequency.value = tone.filter; filter.Q.value = state.zone === 'ashfield' ? .8 : .3;
    noise.connect(filter); filter.connect(ambienceBus); noise.start(now);
    ambientNodes.push(noise, filter);
  }
  function configure(next = {}) {
    for (const key of ['master', 'music', 'ambient', 'sfx']) if (key in next) state[key] = clamp(next[key]);
    if ('musicEnabled' in next) state.musicEnabled = next.musicEnabled !== false;
    if (masterGain) masterGain.gain.setTargetAtTime(state.master, ctx.currentTime, .025);
    if (musicGain) musicGain.gain.setTargetAtTime(state.music * (state.musicEnabled ? 1 : 0), ctx.currentTime, .025);
    if (ambientGain) ambientGain.gain.setTargetAtTime(state.ambient, ctx.currentTime, .025);
    if (sfxGain) sfxGain.gain.setTargetAtTime(state.sfx, ctx.currentTime, .025);
  }
  function setZone(zone) {
    if (!['mistwood', 'stonevale', 'ashfield'].includes(zone) || zone === state.zone) return;
    state.zone = zone;
    rebuildBed();
  }
  function tone(freq, duration, level = .08, type = 'sine', slide = 1) {
    if (!ctx || !unlocked || !sfxGain) return;
    const now = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, now); osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), now + duration);
    g.gain.setValueAtTime(Math.max(.0001, level), now); g.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(g); g.connect(sfxGain);
    osc.onended = () => { try { osc.disconnect(); } catch {} try { g.disconnect(); } catch {} };
    osc.start(now); osc.stop(now + duration + .02);
  }
  function sfx(name) {
    if (!unlocked) return;
    const map = {
      attack: [190, .09, .07, 'triangle', .72], hit: [120, .08, .09, 'square', .65], kill: [95, .22, .08, 'sawtooth', .45],
      dodge: [260, .12, .05, 'sine', 1.5], drink: [430, .18, .055, 'sine', 1.35], pickup: [560, .11, .045, 'sine', 1.25],
      quest: [392, .24, .055, 'triangle', 1.5], portal: [220, .34, .055, 'sine', 2], discovery: [523, .3, .05, 'sine', 1.5],
      block: [145, .11, .055, 'triangle', .85], ui: [330, .045, .025, 'sine', 1.05]
    };
    const p = map[name]; if (p) tone(...p);
  }
  function suspend() { try { ctx?.suspend?.(); } catch {} }
  function resume() { unlock(); }
  function snapshot() { return { ...state, available: !!AudioCtor, unlocked }; }

  window.AetherAudio = { unlock, configure, setZone, sfx, suspend, resume, snapshot };
})();
