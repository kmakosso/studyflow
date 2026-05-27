/**
 * Ambient sound generator using Web Audio API (100% offline, no files).
 * Generates white noise, brown noise, or synthesized rain sound.
 */

let audioCtx  = null;
let gainNode  = null;
let source    = null;
let currentType = null;

function getCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function buildBuffer(ctx, type) {
  const sampleRate = ctx.sampleRate;
  const len        = sampleRate * 4; // 4-second loop
  const buffer     = ctx.createBuffer(2, len, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    if (type === 'white') {
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w  = Math.random() * 2 - 1;
        data[i]  = (last + 0.02 * w) / 1.02;
        last     = data[i];
        data[i] *= 3.5 * 0.1;
      }
    } else if (type === 'rain') {
      // Dense filtered noise simulating rain
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w   = Math.random() * 2 - 1;
        data[i]   = (last + 0.04 * w) / 1.04;
        last      = data[i];
        // Add occasional drip impulses
        if (Math.random() < 0.001) data[i] += (Math.random() - 0.5) * 0.3;
        data[i]  *= 2.5 * 0.12;
      }
    }
  }
  return buffer;
}

export const ambient = {
  play(type = 'brown', volume = 0.4) {
    this.stop();
    currentType = type;
    const ctx   = getCtx();

    gainNode = ctx.createGain();
    gainNode.gain.value = volume;

    source        = ctx.createBufferSource();
    source.buffer = buildBuffer(ctx, type);
    source.loop   = true;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start();
  },

  stop() {
    try { if (source) { source.stop(); source.disconnect(); } } catch (_) {}
    try { if (gainNode) gainNode.disconnect(); } catch (_) {}
    source = gainNode = null;
    currentType = null;
  },

  setVolume(v) {
    if (gainNode) gainNode.gain.setTargetAtTime(v, getCtx().currentTime, 0.1);
  },

  isPlaying()   { return source !== null; },
  currentType() { return currentType; },
};

export const AMBIENT_SOUNDS = [
  { id: 'white', label: 'Bruit blanc',   icon: '🌬️' },
  { id: 'brown', label: 'Bruit brun',    icon: '🌊' },
  { id: 'rain',  label: 'Pluie douce',   icon: '🌧️' },
];
