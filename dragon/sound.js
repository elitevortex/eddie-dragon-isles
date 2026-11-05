// The main theme is "Imperial China Cinematic" by Shane Ivers (silvermansound.com, CC BY 4.0),
// looped with a crossfade. Everything else is synthesised with Web Audio: wind, the scroll
// unrolling, the surge whoosh, and an original D-pentatonic score kept as a fallback.
const TRACK = new URL("./music/imperial-china-cinematic.m4a", import.meta.url).href;
const XFADE = 6;
const SCORE_LEVEL = 0.4; // the theme sits under the effects
// music and sound effects switch independently, and the fire voice is a saved choice
const KEY = "eddie-isles-sound";
const pref = { music: true, sfx: true, voice: "recorded" };
try { Object.assign(pref, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
// the recorded breath became the default after the synthesised voices; move earlier picks onto it once
// one fire voice: the recorded breath (the synthesised voices remain only as a fallback)
pref.voice = "recorded";
// "Dragon Breathing Fire" sound effect from tunetank.com
const BREATH_URL = new URL("./sfx/dragon-breathing-fire.m4a", import.meta.url).href;
let breathBuf = null, lastBreath = null;
let weatherKind = null, weatherBus = null, dropTimer = null;
const savePref = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) {} };

let ac, master, music, score, sfx, wet, noiseBuf, wind, windWhistle, scheduler, gates;
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

// two copies of the track so the end can fade under the next start
function startTrack() {
  const els = [new Audio(TRACK), new Audio(TRACK)];
  const gains = els.map((el) => {
    el.preload = "auto";
    const g = ac.createGain();
    g.gain.value = 0;
    ac.createMediaElementSource(el).connect(g).connect(score);
    return g;
  });
  let cur = 0, failed = false;
  const play = (i, fade) => {
    els[i].currentTime = 0;
    els[i].play().catch(() => {});
    gains[i].gain.cancelScheduledValues(T());
    gains[i].gain.setValueAtTime(0.0001, T());
    gains[i].gain.exponentialRampToValueAtTime(1, T() + fade);
  };
  els[0].addEventListener("error", () => { if (!failed) { failed = true; startMusic(); } });
  play(0, 2.5);
  scheduler = setInterval(() => {
    const el = els[cur];
    if (!el.duration || el.paused) return;
    if (el.duration - el.currentTime < XFADE) {
      gains[cur].gain.setTargetAtTime(0.0001, T(), XFADE / 4);
      const old = el;
      setTimeout(() => old.pause(), XFADE * 1000 + 200);
      cur = 1 - cur;
      play(cur, XFADE);
    }
  }, 250);
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

// one raindrop: mostly a water "plip" (a sine that sweeps up fast, how a drop sounds hitting
// water), sometimes a crisp tick on a leaf, now and then a heavier tap on a roof tile
const poisson = (l) => { let k = 0, p = Math.exp(-l), s = p, u = Math.random(); while (u > s) { k++; p *= l / k; s += p; } return k; };
function drop(at) {
  const pan = ac.createStereoPanner();
  pan.pan.value = rnd(-0.9, 0.9);
  pan.connect(sfx);
  const r = Math.random(), near = rnd(0.35, 1);
  if (r < 0.55) {
    const f0 = rnd(700, 1400), o = osc("sine", f0, at, at + 0.08);
    o.frequency.exponentialRampToValueAtTime(f0 * rnd(2, 3.2), at + rnd(0.012, 0.025));
    gainAt(o, at, 0.14 * near, 0.001, rnd(0.03, 0.06), pan);
  } else if (r < 0.92) {
    const c = noiseSrc(at, at + 0.02), hp = filt("bandpass", rnd(3500, 7500), rnd(3, 6));
    c.connect(hp);
    gainAt(hp, at, 0.18 * near, 0.0005, rnd(0.004, 0.01), pan);
  } else {
    const c = noiseSrc(at, at + 0.1), lp = filt("lowpass", rnd(500, 900), 1.5);
    c.connect(lp);
    gainAt(lp, at, 0.3 * near, 0.001, rnd(0.03, 0.06), pan);
  }
}

// one boulder landing: a deep knock that drops in pitch, a dull body thump and a stony crunch
function boulder(at, size, g) {
  const pan = ac.createStereoPanner();
  pan.pan.value = rnd(-0.8, 0.8);
  pan.connect(sfx);
  const f0 = rnd(70, 120) / size, o = osc("sine", f0, at, at + 0.5);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.55, at + 0.25);
  gainAt(o, at, 0.5 * g, 0.003, 0.3 * size, pan);
  const n = noiseSrc(at, at + 0.2), lp = filt("lowpass", rnd(350, 700) / size, 1.2);
  n.connect(lp);
  gainAt(lp, at, 0.4 * g, 0.002, 0.12 * size, pan);
  const c = noiseSrc(at, at + 0.1), bp = filt("bandpass", rnd(900, 1800), 2.5);
  c.connect(bp);
  gainAt(bp, at, 0.14 * g, 0.001, 0.05, pan);
}

// granular texture: many short noise grains played back slowed down, which drops their
// spectrum into a low, gravelly rumble; shape(u) sets the swell over the burst
function grains(at, dur, n, { rate, f, q = 1.2, g, len, type = "lowpass", shape = () => 1 }) {
  for (let i = 0; i < n; i++) {
    const u = i / n, t = at + dur * u + rnd(-0.5, 0.5) * (dur / n);
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rnd(rate[0], rate[1]);
    const l = rnd(len[0], len[1]);
    src.start(Math.max(T(), t), Math.random() * 2, l + 0.05);
    const fl = filt(type, rnd(f[0], f[1]), q);
    src.connect(fl);
    gainAt(fl, Math.max(T(), t), rnd(g[0], g[1]) * shape(u), 0.004, l, sfx);
  }
}
function drive(amount) {
  const w = ac.createWaveShaper(), c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
  w.curve = c;
  return w;
}
function voiceEnv(node, at, peak, attack, hold, release) {
  const v = ac.createGain();
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(peak, at + attack);
  v.gain.setValueAtTime(peak, at + attack + hold);
  v.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  node.connect(v).connect(sfx);
  return v;
}
const swell = (u) => Math.sin(Math.min(1, u * 1.4) * Math.PI) ** 0.6;
// random curve for flicker and jitter: n points between lo and hi, smoothed a little
const wobble = (n, lo, hi) => { const c = new Float32Array(n); let v = (lo + hi) / 2; for (let i = 0; i < n; i++) { v += (rnd(lo, hi) - v) * 0.55; c[i] = v; } return c; };

// the moment of ignition: a soft low "whump" as the gas catches and the flame front opens up
function ignite(at, g) {
  const n = noiseSrc(at, at + 0.6), lp = filt("lowpass", 140, 0.9);
  lp.frequency.setValueAtTime(140, at);
  lp.frequency.exponentialRampToValueAtTime(2600, at + 0.14);
  lp.frequency.exponentialRampToValueAtTime(900, at + 0.45);
  n.connect(lp);
  gainAt(lp, at, 0.55 * g, 0.025, 0.4, sfx);
  const thump = osc("sine", 70, at, at + 0.4);
  thump.frequency.exponentialRampToValueAtTime(38, at + 0.25);
  gainAt(thump, at, 0.6 * g, 0.01, 0.3, sfx);
}
// a sustained roar of flame: broadband noise whose brightness and loudness flicker unevenly,
// with a thin hiss on top, the way a real torch or burner sounds
function flameRoar(at, dur, g, bright = 1) {
  const n = noiseSrc(at, at + dur + 0.6), lp = filt("lowpass", 900 * bright, 0.6);
  lp.frequency.setValueCurveAtTime(wobble(48, 600 * bright, 2000 * bright), at, dur);
  const flick = ac.createGain();
  flick.gain.setValueCurveAtTime(wobble(64, 0.45, 1), at, dur);
  n.connect(lp).connect(flick);
  voiceEnv(flick, at, 0.5 * g, 0.12, dur * 0.55, dur * 0.45);
  const h = noiseSrc(at, at + dur + 0.6), hp = filt("highpass", 3500, 0.7);
  h.connect(hp);
  voiceEnv(hp, at, 0.05 * g * bright, 0.1, dur * 0.5, dur * 0.4);
  const rum = noiseSrc(at, at + dur + 0.6), rl = filt("lowpass", 160, 0.7);
  rum.connect(rl);
  voiceEnv(rl, at, 0.45 * g, 0.15, dur * 0.5, dur * 0.5);
}
// crackle: sharp sparse clicks and the odd lower pop of burning matter
function crackle(at, dur, n, g) {
  for (let i = 0; i < n; i++) {
    const t = at + rnd(0, dur) ** 1.2, pop = Math.random() < 0.2;
    const c = noiseSrc(t, t + 0.03), f = pop ? filt("bandpass", rnd(350, 900), 3) : filt("highpass", rnd(1800, 5000), 0.8);
    c.connect(f);
    gainAt(f, t, rnd(0.05, 0.2) * g * (pop ? 1.6 : 1), 0.0008, pop ? rnd(0.01, 0.025) : rnd(0.003, 0.009), sfx);
  }
}
// a throat growl: an irregular low pulse (vocal fry) gating breath noise, shaped by three
// formants like a big animal's vocal tract, sliding down as the breath runs out
function growl(at, dur, f0, g, open = 1) {
  const pulse = osc("sawtooth", f0, at, at + dur + 0.5);
  pulse.frequency.setValueCurveAtTime(wobble(40, f0 * 0.82, f0 * 1.18).map((v, i) => v * (1 - (i / 40) * 0.35)), at, dur);
  const shaped = drive(40);
  pulse.connect(shaped);
  // breath noise gated by the pulse gives the rough, wet texture of a real growl
  const breath = noiseSrc(at, at + dur + 0.5), gate = ac.createGain();
  gate.gain.value = 0;
  shaped.connect(gate.gain);
  breath.connect(gate);
  const mix = ac.createGain();
  const body = ac.createGain();
  body.gain.value = 0.35;
  shaped.connect(body).connect(mix);
  gate.connect(mix);
  const out = ac.createGain();
  for (const [f, q, a] of [[300 * open, 4, 1], [720 * open, 5, 0.7], [2300, 6, 0.25]]) {
    const bp = filt("bandpass", f, q);
    bp.frequency.exponentialRampToValueAtTime(f * 0.7, at + dur);
    const lv = ac.createGain();
    lv.gain.value = a;
    mix.connect(bp).connect(lv).connect(out);
  }
  const lp = filt("lowpass", 3000, 0.7);
  out.connect(lp);
  voiceEnv(lp, at, 0.55 * g, 0.12, dur * 0.5, dur * 0.5);
  const sub = osc("sine", f0, at, at + dur + 0.5);
  sub.frequency.exponentialRampToValueAtTime(f0 * 0.65, at + dur);
  voiceEnv(sub, at, 0.35 * g, 0.1, dur * 0.5, dur * 0.5);
}
const FIRE = {
  // balanced: the flame catches, roars, and a deep growl rides underneath
  ignite(at) {
    ignite(at, 1);
    flameRoar(at + 0.05, 1.3, 1, 1);
    crackle(at + 0.1, 1.3, 26, 1);
    growl(at, 1.5, 38, 0.8, 1);
  },
  // heavier and longer: a furnace blast with a big breath behind it
  furnace(at) {
    ignite(at, 1.2);
    flameRoar(at + 0.03, 1.8, 1.25, 1.35);
    crackle(at + 0.1, 1.8, 45, 1.2);
    growl(at + 0.1, 1.6, 34, 0.55, 0.9);
  },
  // the beast first: a long low growl that bursts into flame
  beast(at) {
    growl(at, 1.9, 30, 1.1, 0.85);
    ignite(at + 0.35, 0.9);
    flameRoar(at + 0.4, 1.3, 0.85, 0.9);
    crackle(at + 0.45, 1.3, 20, 0.9);
  },
};

// the recorded breath, pitched a touch differently each time; a quick second breath fades the
// first out rather than stacking full-length copies
function breath() {
  const at = T();
  if (lastBreath) { lastBreath.gain.cancelScheduledValues(at); lastBreath.gain.setTargetAtTime(0.0001, at, 0.08); }
  const src = ac.createBufferSource();
  src.buffer = breathBuf;
  src.playbackRate.value = rnd(0.94, 1.04);
  const g = ac.createGain();
  g.gain.value = 0.9;
  src.connect(g).connect(sfx);
  src.start(at);
  lastBreath = g;
  src.onended = () => { if (lastBreath === g) lastBreath = null; };
}

export const Sound = {
  init() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.85;
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
    // each family goes through a dry gate and a reverb-send gate, so one switch silences both paths
    const gate = (on) => { const g = ac.createGain(); g.gain.value = on ? 1 : 0; return g; };
    gates = { music: [gate(pref.music), gate(pref.music)], sfx: [gate(pref.sfx), gate(pref.sfx)] };
    music.connect(gates.music[0]).connect(comp);
    music.connect(gates.music[1]).connect(verb);
    sfx.connect(gates.sfx[0]).connect(comp);
    sfx.connect(gates.sfx[1]).connect(verb);
    // the recorded score skips the reverb: it has its own hall
    score = ac.createGain();
    score.gain.value = SCORE_LEVEL;
    score.connect(gates.music[0]);
    verb.connect(wet).connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // wind: two looped noise layers whose level and colour follow the dragon's speed
    const n1 = noiseSrc(T()), n2 = noiseSrc(T());
    const bp = filt("bandpass", 500, 0.6), hp = filt("bandpass", 2400, 3);
    wind = ac.createGain(); wind.gain.value = 0;
    windWhistle = ac.createGain(); windWhistle.gain.value = 0;
    n1.connect(bp).connect(wind).connect(gates.sfx[0]);
    n2.connect(hp).connect(windWhistle).connect(gates.sfx[0]);
    wind.f = bp.frequency; windWhistle.f = hp.frequency;
    // weather beds: rain hiss, a soft snowy hush, and a breeze for petals and leaves
    weatherBus = {};
    for (const [k, type, f, q] of [["rain", "bandpass", 2600, 0.5], ["rainLow", "lowpass", 500, 0.7], ["hush", "lowpass", 420, 0.6], ["breeze", "bandpass", 700, 0.8]]) {
      const src = noiseSrc(T()), fl = filt(type, f, q), g = ac.createGain();
      g.gain.value = 0;
      src.connect(fl).connect(g).connect(gates.sfx[0]);
      weatherBus[k] = g;
    }
    this.weather(weatherKind);
    fetch(BREATH_URL).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => { breathBuf = buf; }).catch(() => {});
    startTrack();
  },
  wake() {
    if (!ac) this.init();
    else if (ac.state !== "running") ac.resume().catch(() => {});
  },
  // kind: "rain" | "snow" | "petals" | "leaves" | null
  weather(kind) {
    weatherKind = kind;
    if (!ac || !weatherBus) return;
    // rain is mostly individual drops now; the noise bed underneath is kept faint so it never reads as static
    const lv = { rain: kind === "rain" ? 0.03 : 0, rainLow: kind === "rain" ? 0.045 : 0, hush: kind === "snow" ? 0.08 : 0, breeze: kind === "petals" || kind === "leaves" ? 0.035 : 0 };
    for (const [k, v] of Object.entries(lv)) weatherBus[k].gain.setTargetAtTime(v, T(), 1.2);
    clearInterval(dropTimer);
    // rain: separate drops landing at random moments, spread across left and right
    if (kind === "rain") dropTimer = setInterval(() => {
      const n = poisson(1.8); // about 36 drops a second
      for (let i = 0; i < n; i++) drop(T() + Math.random() * 0.05);
    }, 50);
  },
  get pref() { return pref; },
  get debug() { return ac && { state: ac.state, breath: !!breathBuf, sfxGate: gates.sfx[0].gain.value }; },
  // peak output level over the next ms milliseconds, for testing without speakers
  async meter(ms = 600, node) {
    const an = ac.createAnalyser();
    (node === "sfx" ? sfx : master).connect(an);
    const buf = new Float32Array(an.fftSize);
    let peak = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) { an.getFloatTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v)); await new Promise((r) => setTimeout(r, 20)); }
    return +peak.toFixed(3);
  },
  // which: "music" | "sfx"
  toggle(which) {
    pref[which] = !pref[which];
    savePref();
    if (ac) for (const g of gates[which]) g.gain.setTargetAtTime(pref[which] ? 1 : 0, T(), 0.08);
    return pref[which];
  },
  VOICES: { recorded: "Dragon breath", ignite: "Ignite + growl", furnace: "Furnace roar", beast: "Beast bellow" },
  setVoice(v) { pref.voice = v; savePref(); },
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
    score.gain.setTargetAtTime(SCORE_LEVEL * 0.5, at, 0.4);
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
    score.gain.setTargetAtTime(SCORE_LEVEL, at, 0.6);
  },
  // dragon fire, in the voice picked in the controls panel
  fire() {
    if (!ac) return;
    if (pref.voice === "recorded" && breathBuf) return breath();
    (FIRE[pref.voice] || FIRE.ignite)(T());
  },
  // near is 1 right next to the blast, falling toward 0 far away
  boom(near = 1) {
    if (!ac) return;
    const at = T(), g = 0.25 + near * 0.75;
    const o = osc("sine", 75, at, at + 2);
    o.frequency.exponentialRampToValueAtTime(26, at + 1.4);
    gainAt(o, at, 0.9 * g, 0.005, 1.6, sfx);
    const n = noiseSrc(at, at + 2.4), lp = filt("lowpass", 300 + near * 1500, 0.7);
    lp.frequency.exponentialRampToValueAtTime(140, at + 2);
    n.connect(lp);
    gainAt(lp, at, 0.75 * g, 0.004, 2.0, sfx);
    for (let i = 0; i < 40; i++) {
      const t = at + 0.05 + rnd(0, 1.3) ** 1.6, c = noiseSrc(t, t + 0.06), bp = filt("bandpass", rnd(600, 3200), 1.5);
      c.connect(bp);
      gainAt(bp, t, rnd(0.04, 0.14) * g, 0.001, rnd(0.02, 0.06), sfx);
    }
  },
  // a fireball striking stone: the crack of the rock splitting, gravel crumbling away, boulders
  // knocking down the face one after another, and a trickle of pebbles behind them
  rockHit(near = 1, big = false) {
    if (!ac) return;
    const at = T(), g = 0.3 + near * 0.7;
    const crack = noiseSrc(at, at + 0.15), hp = filt("highpass", 1400, 0.8);
    crack.connect(hp);
    gainAt(hp, at, 0.45 * g, 0.0008, 0.07, sfx);
    const snap = noiseSrc(at, at + 0.1), bp = filt("bandpass", 3200, 3);
    snap.connect(bp);
    gainAt(bp, at, 0.3 * g, 0.0005, 0.03, sfx);
    grains(at + 0.02, big ? 1.8 : 0.9, big ? 140 : 60, { rate: [0.3, 0.9], f: [250, 1400], q: 1.6, type: "bandpass", g: [0.06 * g, 0.18 * g], len: [0.02, 0.07], shape: (u) => (1 - u) ** 1.4 });
    const n = big ? 7 : 3;
    for (let k = 0; k < n; k++) boulder(at + 0.12 + k * rnd(0.14, 0.3) + k * k * 0.03, rnd(0.8, 1.5), g * (1 - k / (n + 1)));
    for (let k = 0; k < (big ? 40 : 18); k++) {
      const t = at + 0.2 + rnd(0, big ? 2.2 : 1.2) ** 1.3, c = noiseSrc(t, t + 0.03), f = filt("bandpass", rnd(2000, 5500), 3);
      c.connect(f);
      gainAt(f, t, rnd(0.02, 0.07) * g, 0.0005, rnd(0.005, 0.015), sfx);
    }
  },
  // a pillar toppling: a long low rumble with rock clattering down
  rumble(near = 1) {
    if (!ac) return;
    const at = T() + 0.25, g = 0.3 + near * 0.7;
    const n = noiseSrc(at, at + 5), lp = filt("lowpass", 160, 0.6);
    n.connect(lp);
    const v = ac.createGain();
    v.gain.setValueAtTime(0.0001, at);
    v.gain.exponentialRampToValueAtTime(0.55 * g, at + 1.2);
    v.gain.exponentialRampToValueAtTime(0.0001, at + 4.8);
    lp.connect(v).connect(sfx);
    for (let i = 0; i < 34; i++) {
      const t = at + rnd(0.3, 4), c = noiseSrc(t, t + 0.1), bp = filt("bandpass", rnd(500, 2400), 2);
      c.connect(bp);
      gainAt(bp, t, rnd(0.04, 0.12) * g, 0.002, rnd(0.04, 0.1), sfx);
    }
    // whole boulders breaking off and bouncing down the slope as it falls
    for (let i = 0; i < 9; i++) boulder(at + 0.4 + rnd(0, 3.6), rnd(1, 1.8), g * rnd(0.5, 0.9));
  },
  // a fireball splashing harmlessly off an island
  fizzle() {
    if (!ac) return;
    const at = T(), n = noiseSrc(at, at + 0.6), hp = filt("highpass", 2600);
    n.connect(hp);
    gainAt(hp, at, 0.14, 0.005, 0.45, sfx);
    pluck(deg(17), at, 0.04, 1.2);
  },
  // a jingle of coins: three or four brass cash coins clinking together in a quick, uneven
  // burst. Each clink is a few bright, inharmonic partials that die almost at once.
  chime(i = 0) {
    if (!ac) return;
    const at = T(), tint = 1 + (((i % 10) + 10) % 10) * 0.035, n = 3 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const t = at + k * rnd(0.018, 0.04) + rnd(0, 0.01), f = rnd(2600, 3900) * tint, g = rnd(0.02, 0.04) * (1 - k * 0.15);
      const pan = ac.createStereoPanner();
      pan.pan.value = rnd(-0.4, 0.4);
      pan.connect(sfx);
      for (const [r, a] of [[1, 1], [1.59, 0.6], [2.43, 0.4], [3.31, 0.25]]) {
        const o = osc("sine", f * r * rnd(0.99, 1.01), t, t + 0.12);
        gainAt(o, t, g * a, 0.0006, rnd(0.03, 0.07), pan);
      }
      const c = noiseSrc(t, t + 0.02), bp = filt("bandpass", rnd(6000, 9000), 4);
      c.connect(bp);
      gainAt(bp, t, g * 0.8, 0.0004, 0.006, pan);
    }
  },
  // a wooden temple block: a hollow knock
  block() {
    if (!ac) return;
    const at = T(), o = osc("sine", 620, at, at + 0.15);
    o.frequency.exponentialRampToValueAtTime(480, at + 0.06);
    gainAt(o, at, 0.12, 0.001, 0.07, sfx);
    const n = noiseSrc(at, at + 0.03), bp = filt("bandpass", 1500, 3);
    n.connect(bp);
    gainAt(bp, at, 0.06, 0.0005, 0.015, sfx);
  },
  land() { if (ac) { pluck(deg(12), T(), 0.07); pluck(deg(15), T() + 0.08, 0.06); } },
};
