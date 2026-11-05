// All sound is synthesised with Web Audio, no files. An original score in D pentatonic for
// guzheng-like plucks, an erhu-like lead, taiko and gong, plus wind and the scroll unrolling.
const KEY = "eddie-isles-sound";
let muted = false;
try { muted = localStorage.getItem(KEY) === "off"; } catch (e) {}

let ac, master, music, sfx, wet, noiseBuf, wind, windWhistle, scheduler;
const T = () => ac.currentTime;
const rnd = (a, b) => a + Math.random() * (b - a);

// D gong mode across three octaves: D E F# A B
const SCALE = [];
for (const oct of [2, 3, 4, 5]) for (const st of [0, 2, 4, 7, 9]) SCALE.push(36.71 * 2 ** (oct - 1) * 2 ** (st / 12));
const deg = (d) => SCALE[Math.max(0, Math.min(SCALE.length - 1, d))];

function impulse(secs, decay) {
  const len = ac.sampleRate * secs, b = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay; }
  return b;
}
function gainAt(g, at, peak, attack, decay, to) {
  const n = ac.createGain();
  n.gain.setValueAtTime(0.0001, at);
  n.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  n.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(n);
  n.connect(to);
  return n;
}
function osc(type, f, at, stop) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at); o.start(at); o.stop(stop); return o; }
function noiseSrc(at, stop) { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(at, Math.random() * 2); if (stop) s.stop(stop); return s; }
function filt(type, f, q = 0.7) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

// guzheng: bright pluck that bends down onto the note, with a pick click
function pluck(f, at, g = 0.12, len = 2.4) {
  for (const [m, a, type] of [[1, 1, "triangle"], [2, 0.35, "sine"], [3, 0.18, "sine"], [4.02, 0.08, "sine"]]) {
    const o = osc(type, f * m * 1.012, at, at + len + 0.1);
    o.frequency.exponentialRampToValueAtTime(f * m, at + 0.06);
    gainAt(o, at, g * a, 0.004, len / m ** 0.5, music);
  }
  const n = noiseSrc(at, at + 0.05);
  const bp = filt("bandpass", f * 6, 2);
  n.connect(bp);
  gainAt(bp, at, g * 0.4, 0.001, 0.03, music);
}
// erhu: bowed saw through a body formant with vibrato that blooms
function erhu(f, at, dur, g = 0.07, from) {
  const o = osc("sawtooth", from || f, at, at + dur + 0.3);
  if (from) o.frequency.exponentialRampToValueAtTime(f, at + 0.12);
  const lfo = osc("sine", 5.6, at, at + dur + 0.3);
  const depth = ac.createGain();
  depth.gain.setValueAtTime(0, at);
  depth.gain.linearRampToValueAtTime(f * 0.012, at + Math.min(dur, 0.6));
  lfo.connect(depth).connect(o.frequency);
  const lp = filt("lowpass", 2400, 0.5), form = filt("peaking", 950, 1.4);
  form.gain.value = 8;
  o.connect(lp).connect(form);
  const v = ac.createGain();
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(g, at + 0.14);
  v.gain.setValueAtTime(g, at + dur - 0.1);
  v.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.25);
  form.connect(v).connect(music);
}
function taiko(at, g = 0.5) {
  const o = osc("sine", 95, at, at + 0.8);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.35);
  gainAt(o, at, g, 0.003, 0.6, music);
  const n = noiseSrc(at, at + 0.2);
  const lp = filt("lowpass", 420);
  n.connect(lp);
  gainAt(lp, at, g * 0.5, 0.002, 0.12, music);
}
function gong(at, g = 0.22, base = 98) {
  for (const [r, a] of [[1, 1], [1.47, 0.6], [2.09, 0.5], [2.76, 0.35], [3.32, 0.25], [4.18, 0.15], [5.4, 0.1]]) {
    const o = osc("sine", base * r, at, at + 7);
    o.frequency.setValueAtTime(base * r * 0.985, at);
    o.frequency.linearRampToValueAtTime(base * r, at + 1.5);
    const n = ac.createGain();
    n.gain.setValueAtTime(0.0001, at);
    n.gain.exponentialRampToValueAtTime(g * a, at + 0.02 + r * 0.05);
    n.gain.exponentialRampToValueAtTime(0.0001, at + 6.5 / r ** 0.3);
    o.connect(n).connect(music);
  }
  const n = noiseSrc(at, at + 0.4);
  const bp = filt("bandpass", 1800, 0.8);
  n.connect(bp);
  gainAt(bp, at, g * 0.3, 0.002, 0.3, music);
}
function drone(at) {
  for (const [f, g] of [[deg(0) * 2, 0.05], [deg(3) * 2, 0.03], [deg(5), 0.025]]) {
    const o = osc("sawtooth", f, at, at + 1e5);
    const lp = filt("lowpass", 340, 0.4);
    const v = ac.createGain();
    v.gain.setValueAtTime(0.0001, at);
    v.gain.exponentialRampToValueAtTime(g, at + 6);
    o.connect(lp).connect(v).connect(music);
  }
}

// the score: 16 bars of 4 beats. Roots move D, B, G, A; the lead is an original phrase.
const BPM = 68, BEAT = 60 / BPM;
const ROOTS = [5, 9, 7, 8, 5, 9, 7, 6, 5, 9, 7, 8, 9, 7, 6, 5]; // scale degree of each bar's arpeggio base
const LEAD = [ // [degree, beats], null degree is a rest
  [14, 2], [15, 1], [17, 1], [15, 3], [14, 1], [12, 2], [14, 2], [11, 4],
  [12, 1], [14, 1], [15, 2], [14, 1], [12, 1], [11, 2], [10, 6], [null, 2],
  [15, 2], [17, 1], [18, 1], [17, 2], [15, 2], [14, 3], [15, 1], [12, 4],
  [14, 1], [12, 1], [11, 2], [12, 1], [11, 1], [10, 1], [9, 1], [10, 8],
];
let bar = 0, nextBar = 0, leadQ = [];
function scheduleBar(at) {
  const r = ROOTS[bar % ROOTS.length];
  const big = bar % 8 === 0;
  if (big) gong(at, 0.2);
  // guzheng: a rolling glissando up the scale on beat 1, then broken patterns
  for (let i = 0; i < 6; i++) pluck(deg(r + i), at + i * 0.045, 0.06 + i * 0.012, 2.8);
  [[1, 3], [1.5, 5], [2, 2], [2.5, 4], [3, 6], [3.5, 5]].forEach(([b, d]) => pluck(deg(r + d), at + b * BEAT, 0.07));
  pluck(deg(r - 5), at, 0.14, 3.5);
  // taiko: heavy downbeat, answers on 3, a roll into every fourth bar
  taiko(at, big ? 0.7 : 0.5);
  taiko(at + 2 * BEAT, 0.32);
  if (bar % 4 === 3) for (let k = 0; k < 4; k++) taiko(at + (3 + k * 0.25) * BEAT, 0.18 + k * 0.08);
  // lead enters after the first 4 bars
  if (bar >= 4) {
    if (!leadQ.length) leadQ = LEAD.slice();
    let b = 0, prev = null;
    while (b < 4 && leadQ.length) {
      const [d, len] = leadQ[0];
      const use = Math.min(len, 4 - b);
      if (d !== null) erhu(deg(d), at + b * BEAT, use * BEAT * 0.96, 0.06, prev && Math.random() < 0.5 ? prev : undefined);
      prev = d !== null ? deg(d) : null;
      if (use < len) leadQ[0] = [d, len - use]; else leadQ.shift();
      b += use;
    }
  }
  bar++;
}

function startMusic() {
  const at = T() + 0.1;
  gong(at, 0.3, 82);
  for (let k = 0; k < 8; k++) taiko(at + 0.5 + k * 0.18, 0.15 + k * 0.06);
  taiko(at + 2.1, 0.8);
  drone(at);
  nextBar = at + 2.1;
  bar = 0;
  scheduler = setInterval(() => {
    while (nextBar < T() + 0.6) { scheduleBar(nextBar); nextBar += 4 * BEAT; }
  }, 120);
}

export const Sound = {
  init() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor();
    comp.connect(master);
    music = ac.createGain();
    music.gain.value = 0.55;
    sfx = ac.createGain();
    sfx.gain.value = 0.9;
    const verb = ac.createConvolver();
    verb.buffer = impulse(3.8, 2.6);
    wet = ac.createGain();
    wet.gain.value = 0.45;
    for (const b of [music, sfx]) { b.connect(comp); b.connect(verb); }
    verb.connect(wet).connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // wind: two looped noise layers whose level and colour follow the dragon's speed
    const n1 = noiseSrc(T()), n2 = noiseSrc(T());
    const bp = filt("bandpass", 500, 0.6), hp = filt("bandpass", 2400, 3);
    wind = ac.createGain(); wind.gain.value = 0;
    windWhistle = ac.createGain(); windWhistle.gain.value = 0;
    n1.connect(bp).connect(wind).connect(comp);
    n2.connect(hp).connect(windWhistle).connect(comp);
    wind.f = bp.frequency; windWhistle.f = hp.frequency;
    startMusic();
  },
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? "off" : "on"); } catch (e) {}
    if (ac) master.gain.setTargetAtTime(muted ? 0 : 0.85, T(), 0.1);
    return muted;
  },
  // speed 0..1 of top surge speed
  wind(speed, surge) {
    if (!ac) return;
    const s = Math.max(0, Math.min(1, speed));
    wind.gain.setTargetAtTime(0.02 + s * s * 0.32, T(), 0.25);
    wind.f.setTargetAtTime(300 + s * 900, T(), 0.3);
    windWhistle.gain.setTargetAtTime(surge ? 0.035 + s * 0.05 : 0, T(), 0.3);
    windWhistle.f.setTargetAtTime(1800 + s * 1800 + Math.sin(T() * 0.7) * 300, T(), 0.4);
  },
  whoosh() {
    if (!ac) return;
    const at = T(), n = noiseSrc(at, at + 1.2), bp = filt("bandpass", 300, 1.2);
    bp.frequency.exponentialRampToValueAtTime(2600, at + 0.5);
    bp.frequency.exponentialRampToValueAtTime(700, at + 1.1);
    n.connect(bp);
    gainAt(bp, at, 0.35, 0.25, 0.8, sfx);
  },
  // a paper scroll unrolling: the rod knock, a rising rustle of paper grains, then it settles
  unroll() {
    if (!ac) return;
    const at = T() + 0.02;
    const knock = osc("sine", 190, at, at + 0.3);
    knock.frequency.exponentialRampToValueAtTime(120, at + 0.15);
    gainAt(knock, at, 0.25, 0.002, 0.18, sfx);
    const dur = 1.1;
    for (let i = 0; i < 70; i++) {
      const t = at + 0.04 + dur * (i / 70) ** 0.8 + rnd(-0.01, 0.01);
      const n = noiseSrc(t, t + 0.08), bp = filt("bandpass", rnd(1800, 5200), rnd(0.8, 2.5));
      n.connect(bp);
      gainAt(bp, t, rnd(0.04, 0.13) * (1 - (i / 70) * 0.5), 0.002, rnd(0.015, 0.05), sfx);
    }
    const s = noiseSrc(at, at + dur + 0.4), sw = filt("bandpass", 700, 0.9);
    sw.frequency.exponentialRampToValueAtTime(3200, at + dur);
    s.connect(sw);
    gainAt(sw, at, 0.12, 0.3, dur, sfx);
    const flap = noiseSrc(at + dur, at + dur + 0.2), lp = filt("lowpass", 900);
    flap.connect(lp);
    gainAt(lp, at + dur, 0.22, 0.004, 0.1, sfx);
    pluck(deg(10), at + dur + 0.05, 0.08, 2);
    pluck(deg(14), at + dur + 0.12, 0.06, 2);
    music.gain.setTargetAtTime(0.3, at, 0.4);
  },
  rollup() {
    if (!ac) return;
    const at = T();
    for (let i = 0; i < 26; i++) {
      const t = at + 0.45 * (i / 26) ** 1.2, n = noiseSrc(t, t + 0.06), bp = filt("bandpass", rnd(2000, 5000), 1.5);
      n.connect(bp);
      gainAt(bp, t, rnd(0.03, 0.08), 0.002, 0.03, sfx);
    }
    const knock = osc("sine", 160, at + 0.48, at + 0.7);
    gainAt(knock, at + 0.48, 0.2, 0.002, 0.12, sfx);
    music.gain.setTargetAtTime(0.55, at, 0.6);
  },
  land() { if (ac) { pluck(deg(12), T(), 0.07); pluck(deg(15), T() + 0.08, 0.06); } },
};
