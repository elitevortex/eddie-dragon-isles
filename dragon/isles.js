// Eddie's story as floating islands over a sea of cloud. You fly a long Chinese dragon in
// third person; each island holds one pillar of the story from data.js. Land on an island's
// gold ring and press E (or hold an open palm with the camera on) to unroll its scroll.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { initStage, flash } from "../ar/hands.js";
import { Sound } from "./sound.js";
import { connect } from "./net.js";

const $ = (s) => document.querySelector(s);
const ROOT = document.documentElement.dataset.root ?? "../";
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CH = Object.fromEntries((window.CHAPTERS || []).map((c) => [c.id, c]));
// wording fixes on top of the generated story data (data.js is rebuilt from the story pack)
const CHAPTER_EDITS = {
  "first-internships": { when: "Jan 2024", title: "Deloitte", org: "Enterprise Technology", role: "Vacationer", summary: "A vacationer internship in Deloitte's Enterprise Technology team." },
  "atlassian": { summary: "Broke into big tech with a summer in Sydney at Atlassian, building filters in Compass end to end. Still one of the best experiences of my life." },
  "culture-amp": { summary: "A summer seeing how a scale-up ships, as a software engineering intern at Culture Amp." },
  "leading-mac": { stats: [["141k", "combined social followers"], ["60+", "events hosted"], ["2y 8m", "on the committee"]] },
};
for (const [id, edit] of Object.entries(CHAPTER_EDITS)) if (CH[id]) Object.assign(CH[id], edit);
// the Monash internship gets its own section, split out of the generated "first internships"
CH["monash-intern"] = { id: "monash-intern", pillar: "career", when: "Jan – Jun 2024", title: "Monash University", org: "Software Engineer intern", role: "", summary: "Six months as a software engineering intern at Monash University.", stats: [], photos: [] };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- the islands ----------
const ISLES = [
  { id: "home", zh: "陈", zh2: "关于我", en: "About me", sub: "eddie chan", pos: [0, 200, 0], r: 86, kind: "hall" },
  { id: "career", zh: "业", zh2: "事业", en: "Career", sub: "internships to lyra", pos: [480, 250, -230], r: 74, kind: "pagoda",
    chapters: ["first-internships", "monash-intern", "atlassian", "culture-amp", "lyra"],
    lede: "The experiences that shaped me." },
  { id: "community", zh: "群", zh2: "社群", en: "Community", sub: "mac and hosting", pos: [-465, 215, -280], r: 77, kind: "pavilion",
    chapters: ["monash-mac", "leading-mac", "hosting"],
    lede: "You're the product of the five people you surround yourself with, something I've been trying to live by." },
  { id: "content", zh: "影", zh2: "影像", en: "Content", sub: "skits, ugc, my story", pos: [-370, 270, 400], r: 67, kind: "teahouse",
    chapters: ["content"],
    lede: "I've always loved being in front of a camera, and I've taken to social media in a few different ways." },
  { id: "life", zh: "旅", zh2: "人生", en: "Life", sub: "shanghai, grad, sf", pos: [420, 190, 420], r: 74, kind: "gate",
    chapters: ["shanghai", "graduation", "sf"],
    lede: "Mandarin in Shanghai with trips out to the Great Wall, graduating with Mum and Dad there, and a first flight to San Francisco." },
];

// ---------- renderer ----------
const canvas = $("#world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
// pixel density starts capped at 1.5x and adapts: it steps down while frames are slow and
// back up when there's headroom (see adaptResolution)
const MAX_PR = Math.min(devicePixelRatio || 1, 1.5), MIN_PR = Math.min(MAX_PR, 0.75);
let pixelRatio = MAX_PR;
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#eab3a2", 500, 2500);
const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 5000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
let frameAvg = 1 / 60, slowT = 0, fastT = 0;
function adaptResolution(dt) {
  frameAvg += (dt - frameAvg) * 0.05;
  if (frameAvg > 1 / 45) { slowT += dt; fastT = 0; } else if (frameAvg < 1 / 57) { fastT += dt; slowT = 0; } else slowT = fastT = 0;
  let next = pixelRatio;
  if (slowT > 1.5 && pixelRatio > MIN_PR) { next = Math.max(MIN_PR, pixelRatio - 0.25); slowT = 0; }
  if (fastT > 6 && pixelRatio < MAX_PR) { next = Math.min(MAX_PR, pixelRatio + 0.25); fastT = 0; }
  if (next !== pixelRatio) { pixelRatio = next; renderer.setPixelRatio(next); composer.setPixelRatio(next); resize(); }
}
resize();

// ---------- helpers ----------
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rr = (a, b) => a + rand() * (b - a);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
const M = {
  grass: std("#7aa257"), grass2: std("#8fb465"), earth: std("#7b5a3e"), rock: std("#9a8a76", { vertexColors: true }),
  stone: std("#b3aa9b"), stoneDark: std("#7f786e"), red: std("#b8322a"), redDeep: std("#8c1f19"),
  wall: std("#efe0c0"), tile: std("#3c4250", { side: THREE.DoubleSide }), tileJade: std("#2f6b5b", { side: THREE.DoubleSide }),
  gold: std("#d9a441", { metalness: 0.4, roughness: 0.45 }), wood: std("#6b4126"), pine: std("#2f5a45"), pine2: std("#3c6e52"),
  blossom: std("#f2a7bb"), blossom2: std("#f7c6d3"), bamboo: std("#6f9b45"), water: new THREE.MeshStandardMaterial({ color: "#bfe3f0", transparent: true, opacity: 0.7, roughness: 0.1 }),
  glow: new THREE.MeshBasicMaterial({ color: "#ffd27a" }), lantern: new THREE.MeshStandardMaterial({ color: "#ff6a2a", emissive: "#ff5a1a", emissiveIntensity: 2.2 }),
  dark: std("#2a1a14"),
};
// lattice windows over a red wainscot, drawn once and shared by every wall
{
  const c = document.createElement("canvas");
  c.width = 384; c.height = 192;
  const g = c.getContext("2d");
  g.fillStyle = "#f1e3c3"; g.fillRect(0, 0, 384, 192);
  for (let k = 0; k < 3; k++) {
    const x0 = k * 128;
    g.fillStyle = "#9e2a20"; g.fillRect(x0, 0, 128, 192);
    g.fillStyle = "#f6ead0"; g.fillRect(x0 + 12, 14, 104, 104);
    g.strokeStyle = "#7d1f18"; g.lineWidth = 3;
    for (let i = 1; i < 7; i++) { g.beginPath(); g.moveTo(x0 + 12 + i * 104 / 7, 14); g.lineTo(x0 + 12 + i * 104 / 7, 118); g.stroke(); g.beginPath(); g.moveTo(x0 + 12, 14 + i * 104 / 7); g.lineTo(x0 + 116, 14 + i * 104 / 7); g.stroke(); }
    g.strokeStyle = "#d9a441"; g.lineWidth = 4; g.strokeRect(x0 + 12, 14, 104, 104);
    g.fillStyle = "#7d1f18"; g.fillRect(x0 + 12, 130, 104, 50);
    g.strokeStyle = "#d9a441"; g.lineWidth = 2; g.strokeRect(x0 + 20, 138, 88, 34);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  M.wall = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  M.plain = std("#efe0c0");
  M.teal = std("#2f8a83");
}
const box = (w, h, d, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = o.receiveShadow = true; return o; };
const cyl = (rt, rb, h, m, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.castShadow = o.receiveShadow = true; return o; };
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

// Performance: merges every static mesh under root into one mesh per material, so a temple of
// hundreds of brackets, pillars and tiles becomes a handful of draw calls. Subtrees in keep (or
// marked userData.keep) stay as they are because they move on their own.
function bake(root, keep = []) {
  const skip = new Set(keep);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m = new THREE.Matrix4();
  const groups = new Map();
  const walk = (o) => {
    for (const c of [...o.children]) {
      if (skip.has(c) || c.userData.keep || c.isInstancedMesh || c.isSprite || c.isLight) continue;
      if (c.isMesh && !(c.material && c.material.isShaderMaterial)) {
        const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        g.applyMatrix4(m.multiplyMatrices(inv, c.matrixWorld));
        for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (c.material.vertexColors) { if (!g.attributes.color) continue; } else if (g.attributes.color) g.deleteAttribute("color");
        if (!groups.has(c.material)) groups.set(c.material, { geos: [], cast: false });
        const e = groups.get(c.material);
        e.geos.push(g);
        e.cast ||= c.castShadow;
        c.parent.remove(c);
        walk(c); // a mesh's own children (already detached with it) are visited too
      } else walk(c);
    }
  };
  walk(root);
  const out = [];
  for (const [mat, e] of groups) {
    const geo = mergeGeometries(e.geos);
    e.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = e.cast;
    mesh.receiveShadow = true;
    root.add(mesh);
    out.push(mesh);
  }
  return out;
}

// value noise for island rims and rocks
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Curved Chinese hip roof: a cone squared off, with a concave profile and lifted corners.
const ROOF = (() => {
  const g = new THREE.ConeGeometry(0.5, 1, 160, 14, true);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = 0.5 - v.y;
    const a = Math.atan2(v.z, v.x);
    const s = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const c = (s - 1) / (Math.SQRT2 - 1);
    const r = 0.5 * t * s * (1 + 0.1 * t);
    // tile rows: shallow ridges running down each face of the roof
    const along = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? Math.sin(a) * s : Math.cos(a) * s;
    const tiles = t > 0.12 ? 0.016 * Math.abs(Math.sin(along * Math.PI * 13)) * t : 0;
    const y = Math.pow(1 - t, 1.9) + 0.42 * c * c * Math.pow(t, 4) + tiles;
    p.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
  }
  g.computeVertexNormals();
  return g;
})();
const BRACKET = new THREE.BoxGeometry(1.1, 0.8, 1.1);
function roof(w, d, h, m = M.tile) {
  const g = new THREE.Group();
  const r = new THREE.Mesh(ROOF, m);
  r.scale.set(w, h, d);
  r.castShadow = true;
  g.add(r, at(new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), M.gold), 0, h + 0.3, 0));
  // gold finial and curling ornaments on each upturned corner
  g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 6), M.gold), 0, h + 1.6, 0));
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const orn = new THREE.Group();
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.16, 6, 12, Math.PI * 1.4), M.gold);
    curl.rotation.y = Math.atan2(sx, sz);
    orn.add(at(curl, 0, 0.5, 0), at(new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 5), M.gold), 0, 0.9, 0));
    orn.position.set(sx * w * 0.55, h * 0.42 + 0.3, sz * d * 0.55);
    g.add(orn);
  }
  // painted bracket sets (dougong) under the eaves, teal and gold
  const bw = w * 0.6, bd = d * 0.6;
  for (const [len, axis] of [[bw, "x"], [bd, "z"]]) {
    const n = Math.max(3, Math.round(len / 2.6));
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + (len * (i + 0.5)) / n;
      for (const side of [-1, 1]) {
        const b = new THREE.Mesh(BRACKET, i % 2 ? M.teal : M.gold);
        if (axis === "x") b.position.set(u, -0.4, side * bd / 2); else b.position.set(side * bw / 2, -0.4, u);
        g.add(b);
      }
    }
  }
  return g;
}

// ---------- sky, clouds, mountains ----------
const sunDir = new THREE.Vector3(-0.55, 0.22, -0.8).normalize();
const SKY = {};
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: sunDir }, top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, low: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, disc: { value: new THREE.Color() } },
    vertexShader: "varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: `uniform vec3 sun, top, mid, hor, low, glow, disc; varying vec3 vd;
      void main(){
        float h = vd.y;
        vec3 c = h > 0. ? mix(hor, mix(mid, top, smoothstep(0.15, 0.7, h)), smoothstep(0.0, 0.18, h)) : mix(hor, low, smoothstep(0., -0.2, h));
        float s = max(dot(vd, sun), 0.);
        c += glow * pow(s, 18.) * 0.6 + disc * smoothstep(0.9985, 0.9993, s);
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  scene.add(sky);
  SKY.uniforms = sky.material.uniforms;
}
const hemi = new THREE.HemisphereLight("#ffd9b8", "#5a4466", 0.9);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight("#ffd2a0", 2.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 10, far: 900 });
sunLight.shadow.bias = -0.0005;
scene.add(sunLight, sunLight.target);

function cloudTexture(size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0, amp = 0.55, f = 4 / size;
    for (let o = 0; o < 5; o++) {
      // tileable: sample on a torus-ish wrap
      const nx = x * f, ny = y * f, P = size * f;
      n += amp * (noise(nx, ny) * (P - nx) * (P - ny) + noise(nx - P, ny) * nx * (P - ny) + noise(nx, ny - P) * (P - nx) * ny + noise(nx - P, ny - P) * nx * ny) / (P * P);
      amp *= 0.5; f *= 2;
    }
    const a = Math.max(0, Math.min(1, (n - 0.32) * 2.4));
    const i = (y * size + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 244 - a * 20; img.data[i + 2] = 236 - a * 30; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const cloudTex = cloudTexture();
const seaLayers = [];
{
  const base = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: "#f6d9cf" }));
  SKY.sea = base.material;
  base.rotation.x = -Math.PI / 2;
  base.position.y = -175;
  scene.add(base);
  for (let k = 0; k < 3; k++) {
    const t = cloudTex.clone();
    t.needsUpdate = true;
    t.repeat.set(9 + k * 4, 9 + k * 4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.95 - k * 0.2, color: k ? "#ffffff" : "#e9c3c8" }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = -160 + k * 14;
    scene.add(m);
    seaLayers.push({ t, s: 0.0025 + k * 0.0018, mat: m.material });
  }
}
// waterfalls: ribbons of water that stream down in uneven threads, widen and thin out as they
// drop, and vanish into the cloud sea. One shared material, so they all flow off one clock.
const ribbonMat = new THREE.ShaderMaterial({
  uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: { value: 0 } },
  fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv;
    #include <fog_pars_vertex>
    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `uniform float time; varying vec2 vUv;
    #include <fog_pars_fragment>
    float h(float n) { return fract(sin(n * 91.7) * 437.5); }
    void main() {
      float col = floor(vUv.x * 26.), r = h(col);
      float s = fract(vUv.y * (2.5 + r * 2.) + time * (0.8 + r * 0.7) + r);
      float streak = smoothstep(0., 0.2, s) * smoothstep(1., 0.55, s);
      float edge = smoothstep(0., 0.22, vUv.x) * smoothstep(1., 0.78, vUv.x);
      float a = (0.3 + 0.55 * streak) * edge * smoothstep(0., 0.45, vUv.y) * smoothstep(1., 0.97, vUv.y);
      gl_FragColor = vec4(mix(vec3(0.72, 0.86, 0.94), vec3(1.), streak), min(1., a * 1.15));
      #include <fog_fragment>
    }`,
});
// a ribbon hanging down from its top edge at the origin, bowing outward (+z) as it falls
function ribbonGeo(w, h, out) {
  const g = new THREE.PlaneGeometry(w, h, 1, 24);
  g.translate(0, -h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const d = Math.max(0, -p.getY(i) / h); p.setX(i, p.getX(i) * (1 + d * 0.8)); p.setZ(i, out * Math.sqrt(d)); }
  return g;
}
// the falls draw from their own seed so the rest of the world keeps its layout
let waterSeed = 777;
const waterRand = () => ((waterSeed = (waterSeed * 16807) % 2147483647) - 1) / 2147483646;
// Zhangjiajie-style sandstone pillars rising out of the cloud sea: slender spires to massive
// fused towers, banded with strata, split by vertical fissures, ledged and mossy, crowned with
// pines. Each pillar is one merged mesh (rock and pines) with its base at the origin, so a
// fireball can topple the whole thing.
const PILLARS = [];
const MASSIFS = [];
{
  const rock = new THREE.Color("#b7a58f"), band = new THREE.Color("#8a786b"), dark = new THREE.Color("#57505c"),
    moss = new THREE.Color("#4d6e45"), mossLight = new THREE.Color("#6f8f4a"), lichen = new THREE.Color("#d2c6ae"), pineA = new THREE.Color("#2f5a45"), pineB = new THREE.Color("#3e6a4c");
  const mat = std("#ffffff", { vertexColors: true });
  const PINE = new THREE.ConeGeometry(3.2, 9, 7);
  PINE.translate(0, 4.5, 0);
  const tint = (g, fn) => {
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const c = fn(i, p); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  };
  // detail: 1 for the pillars near the islands, less for the ones only seen far off in the haze
  let detail = 1;
  function column(h, r, ox, oz) {
    const rings = Math.max(8, Math.round(h / (6 / detail)));
    const g = new THREE.CylinderGeometry(r * rr(0.72, 0.92), r, h, Math.round(8 + 10 * detail), rings);
    const p = g.attributes.position, ph = rand() * 50, fissures = 2 + Math.floor(rand() * 3), ledge = 5 + Math.floor(rand() * 4);
    const cols = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      const t = y / h + 0.5, ring = Math.round(t * rings), a = Math.atan2(z, x);
      let k = 0.8 + 0.34 * noise(ring * 0.32 + ph, a * 1.3 + ph) + 0.1 * noise(ring * 1.6 + ph * 2, a * 4.2);
      const fis = Math.pow(Math.max(0, Math.sin(a * fissures + ph + noise(t * 3, ph) * 2.2)), 12);
      k *= 1 - 0.16 * fis;
      if (ring % ledge === 0) k *= 1.07; else if (ring % ledge === 1) k *= 0.95;
      if (t > 0.95) k *= 1 - (t - 0.95) * 3; // rounded shoulders
      // moss: thick on every ledge, in patches across the faces, in streaks running down from
      // the ledges and over the shoulders, and it swells the surface a little where it grows
      const patch = noise(a * 2.2 + ph, t * 5), streak = noise(a * 5 + ph, t * 1.4);
      let mossy = ring % ledge === 0 ? 0.8 : patch > 0.6 ? 0.45 + (patch - 0.6) * 1.5 : 0;
      if ((ring % ledge === 1 || ring % ledge === 2) && streak > 0.5) mossy = Math.max(mossy, 0.55);
      if (t > 0.86) mossy = Math.max(mossy, Math.min(1, (t - 0.86) * 8));
      k *= 1 + mossy * 0.045 * (0.6 + noise(a * 9, t * 20) * 0.8);
      p.setX(i, x * k); p.setZ(i, z * k);
      const c = rock.clone().lerp(band, 0.5 + 0.5 * Math.sin(ring * 0.9 + ph)).lerp(dark, (1 - t) * 0.55 + fis * 0.45);
      if (noise(a * 3 + ph, t * 9) > 0.72) c.lerp(lichen, 0.35);
      if (mossy > 0) c.lerp(noise(a * 7 + ph, t * 11) > 0.5 ? mossLight : moss, Math.min(1, mossy));
      cols.push(c);
    }
    tint(g, (i) => cols[i]);
    g.translate(ox, h / 2, oz);
    return g;
  }
  function pine(x, y, z, s, lean) {
    const g = PINE.clone();
    g.scale(s, s * rr(0.9, 1.4), s);
    if (lean) { g.rotateX(Math.cos(lean) * 0.55); g.rotateZ(-Math.sin(lean) * 0.55); }
    g.rotateY(rand() * 6);
    g.translate(x, y, z);
    const c = pineA.clone().lerp(pineB, rand());
    return tint(g, () => c);
  }
  function pillar(h, r) {
    const parts = [column(h, r, 0, 0)];
    const tops = [[0, 0, h, r]];
    // some pillars are fused towers: a few shorter columns grown into the main one
    const extra = rand() < 0.45 ? 1 + Math.floor(rand() * 2.5) : 0;
    for (let k = 0; k < extra; k++) {
      const a = rand() * Math.PI * 2, rs = r * rr(0.45, 0.75), hs = h * rr(0.45, 0.88);
      const ox = Math.cos(a) * r * 0.75, oz = Math.sin(a) * r * 0.75;
      parts.push(column(hs, rs, ox, oz));
      tops.push([ox, oz, hs, rs]);
    }
    for (const [ox, oz, th, tr] of tops) {
      for (let k = 0; k < Math.round(tr / 2.2); k++) { const a = rand() * Math.PI * 2, d = rand() * tr * 0.6; parts.push(pine(ox + Math.cos(a) * d, th - 1, oz + Math.sin(a) * d, rr(0.8, 1.7), 0)); }
      for (let k = 0; k < Math.round(tr / 9) + 2; k++) { const a = rand() * Math.PI * 2; parts.push(pine(ox + Math.cos(a) * tr * 0.86, th * rr(0.45, 0.88), oz + Math.sin(a) * tr * 0.86, rr(0.5, 1), a)); }
    }
    const geo = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.extra = extra;
    return mesh;
  }
  const clear = (x, z, pad) => ISLES.every((i) => Math.hypot(x - i.pos[0], z - i.pos[2]) > i.r + pad);
  const placeCluster = (cx, cz, n, hMin, hMax, rMin, rMax) => {
    for (let j = 0; j < n; j++) {
      const x = cx + rr(-1, 1) * 90, z = cz + rr(-1, 1) * 90;
      const r = rMin + (rMax - rMin) * Math.pow(rand(), 1.3), h = rr(hMin, hMax);
      if (!clear(x, z, r + 50) || PILLARS.some((q) => Math.hypot(q.x - x, q.z - z) < (q.r + r) * 0.8)) continue;
      const m = pillar(h, r);
      const base = -230;
      m.position.set(x, base, z);
      m.rotation.y = rand() * 6;
      scene.add(m);
      // toughness comes from the structure: girth, height and any fused columns
      const hp = Math.max(2, Math.round(r / 16 + h / 280 + m.userData.extra * 1.5));
      PILLARS.push({ x, z, r: r * 1.15, top: base + h + 8, base, h, mesh: m, alive: true, hp, maxHp: hp, wobble: 0 });
    }
  };
  detail = 0.45;
  for (let i = 0; i < 34; i++) { const a = (i / 34) * Math.PI * 2 + rr(-0.08, 0.08), d = rr(1150, 1900); placeCluster(Math.cos(a) * d, Math.sin(a) * d, 3 + Math.floor(rand() * 4), 420, 780, 26, 95); }
  detail = 0.7;
  for (let i = 0; i < 30; i++) { const a = rand() * Math.PI * 2, d = rr(700, 1100); placeCluster(Math.cos(a) * d, Math.sin(a) * d, 2 + Math.floor(rand() * 3), 260, 440, 16, 70); }
  detail = 1;
  for (let i = 0; i < 14; i++) { const a = rand() * Math.PI * 2, d = rr(200, 680); placeCluster(Math.cos(a) * d, Math.sin(a) * d, 1 + Math.floor(rand() * 2), 160, 320, 10, 42); }
  // whole mountains: broad massifs of many fused sandstone columns, tallest at the core and
  // stepping down to the cliff edges, like the Tianzi and Yuanjiajie ranges. They stand among
  // the slender pillars but are too big to topple, so fireballs just scorch them. They draw from
  // their own seed so the rest of the world keeps its layout.
  const keep = seed;
  seed = 4242;
  function massif(R, H) {
    const parts = [], cols = [];
    const add = (ox, oz, r, h) => {
      const g = column(h, r, ox, oz);
      parts.push(g);
      cols.push([ox, oz, r, h]);
    };
    add(0, 0, R * 0.92, H * rr(0.26, 0.34)); // the shared footing, mostly under the cloud sea
    const core = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < core; k++) { const a = rand() * Math.PI * 2, d = R * rr(0, 0.38); add(Math.cos(a) * d, Math.sin(a) * d, R * rr(0.3, 0.46), H * rr(0.78, 1)); }
    const rim = 10 + Math.floor(rand() * 9);
    for (let k = 0; k < rim; k++) {
      const a = (k / rim) * Math.PI * 2 + rr(-0.2, 0.2), d = R * rr(0.55, 0.92);
      add(Math.cos(a) * d, Math.sin(a) * d, R * rr(0.12, 0.26), H * rr(0.42, 0.86) * (1.25 - d / R * 0.5));
    }
    for (const [ox, oz, tr, th] of cols.slice(1)) {
      for (let k = 0; k < Math.round(tr / 4); k++) { const a = rand() * Math.PI * 2, d = rand() * tr * 0.65; parts.push(pine(ox + Math.cos(a) * d, th - 1, oz + Math.sin(a) * d, rr(1.2, 2.6), 0)); }
      for (let k = 0; k < Math.round(tr / 14) + 1; k++) { const a = rand() * Math.PI * 2; parts.push(pine(ox + Math.cos(a) * tr * 0.86, th * rr(0.5, 0.9), oz + Math.sin(a) * tr * 0.86, rr(0.8, 1.5), a)); }
    }
    const geo = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    return { mesh: new THREE.Mesh(geo, mat), cols };
  }
  const placeMassif = (a, d, R, H) => {
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!clear(x, z, R + 120) || MASSIFS.some((q) => Math.hypot(q.x - x, q.z - z) < (q.R + R) * 1.05)) return;
    const { mesh, cols } = massif(R, H), base = -230, rot = rand() * 6;
    mesh.position.set(x, base, z);
    mesh.rotation.y = rot;
    scene.add(mesh);
    // the columns are the collision shape, turned with the mesh
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const parts = cols.map(([ox, oz, r, h]) => ({ x: x + ox * cs + oz * sn, z: z - ox * sn + oz * cs, r: r * 1.05, top: base + h + 6 }));
    MASSIFS.push({ x, z, R, mesh, parts });
    // two or three falls pour off the outer cliffs, from just under the tops
    const rim = parts.filter((c) => Math.hypot(c.x - x, c.z - z) > R * 0.45);
    for (let k = 0; k < 2 + (waterRand() < 0.5 ? 1 : 0) && rim.length; k++) {
      const c = rim.splice(Math.floor(waterRand() * rim.length), 1)[0];
      const dx = c.x - x, dz = c.z - z, dl = Math.hypot(dx, dz), top = c.top - 10 - waterRand() * 40;
      const f = new THREE.Mesh(ribbonGeo(c.r * 0.55, top + 200, 8), ribbonMat);
      f.position.set(c.x + (dx / dl) * c.r * 0.9, top, c.z + (dz / dl) * c.r * 0.9);
      f.rotation.y = Math.atan2(dx, dz);
      scene.add(f);
    }
    // slender pillars swallowed by the mountain go
    for (let k = PILLARS.length - 1; k >= 0; k--) {
      const c = PILLARS[k];
      if (Math.hypot(c.x - x, c.z - z) < R + c.r * 0.5) { scene.remove(c.mesh); c.mesh.geometry.dispose(); PILLARS.splice(k, 1); }
    }
  };
  detail = 0.45;
  for (let i = 0; i < 9; i++) placeMassif((i / 9) * Math.PI * 2 + rr(-0.2, 0.2), rr(1450, 1850), rr(190, 300), rr(700, 900));
  detail = 0.7;
  for (let i = 0; i < 7; i++) placeMassif((i / 7) * Math.PI * 2 + rr(-0.3, 0.3) + 0.4, rr(880, 1180), rr(120, 190), rr(520, 720));
  seed = keep;
}
// puffy cloud clusters drifting between the islands
const puffs = [];
{
  const mat = new THREE.MeshStandardMaterial({ color: "#fff6f0", emissive: "#f4d9d2", emissiveIntensity: 0.55, roughness: 1, flatShading: true, transparent: true, opacity: 0.9 });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    const n = 5 + Math.floor(rand() * 5);
    for (let j = 0; j < n; j++) {
      const s = rr(9, 22);
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(s * 1.4, s * 0.8, s);
      m.position.set(rr(-30, 30), rr(-4, 6), rr(-14, 14));
      g.add(m);
    }
    const a = rand() * Math.PI * 2, d = rr(120, 700);
    g.position.set(Math.cos(a) * d, rr(-110, 120), Math.sin(a) * d);
    scene.add(g);
    bake(g);
    puffs.push({ g, v: rr(2, 6) });
  }
}
// (the drifting sky lanterns were removed: from afar they flickered as small red squares.
// Their random draws are still consumed so the rest of the world keeps the same layout.)
for (let i = 0; i < 70 * 6; i++) rand();

// wind streaks that rush past when the dragon picks up speed
// wind, only when surging: straight speed streaks in a wide tube around the dragon (about
// three-quarters of the screen), each lined up with the direction of travel and sweeping
// backward past you. Brightness peaks mid-streak and fades toward both ends, so they read as
// rushing air.
const STREAKS = 260, WISP = 4; // streaks, and points along each one
const streakPos = new Float32Array(STREAKS * (WISP - 1) * 6), streakCol = new Float32Array(STREAKS * (WISP - 1) * 6);
const streakGeo = new THREE.BufferGeometry();
streakGeo.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
streakGeo.setAttribute("color", new THREE.BufferAttribute(streakCol, 3));
const streakMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const streaks = new THREE.LineSegments(streakGeo, streakMat);
streaks.frustumCulled = false;
scene.add(streaks);
const AHEAD = 70, BEHIND = 150;
const newStreak = (z) => ({ z, a: rr(0, Math.PI * 2), r: Math.sqrt(rand()) * 62 + 6, len: rr(10, 26), b: rr(0.45, 1) });
const streakData = Array.from({ length: STREAKS }, () => newStreak(rr(-BEHIND, AHEAD)));
let windAmt = 0; // 0 calm .. 1 full surge, also drives the scale flutter
const wF = new THREE.Vector3(), wS = new THREE.Vector3(), wU = new THREE.Vector3(), wC = new THREE.Vector3(), wp = new THREE.Vector3(), wPrev = new THREE.Vector3();
function updateStreaks(dt) {
  // only a surge raises the wind; ordinary flight stays calm
  const surging = D.boost || (D.auto && D.autoSurge);
  const target = surging ? THREE.MathUtils.clamp((Math.abs(D.speed) - 90) / 70, 0, 1) : 0;
  windAmt += (target - windAmt) * (1 - Math.exp(-dt * 3));
  streakMat.opacity = windAmt * windAmt;
  if (windAmt < 0.01 || !render[0]) return;
  wF.set(Math.sin(D.yaw) * Math.cos(D.pitch), Math.sin(D.pitch), Math.cos(D.yaw) * Math.cos(D.pitch)).normalize();
  wS.crossVectors(wF, UP).normalize();
  wU.crossVectors(wS, wF).normalize();
  wC.copy(render[Math.floor(N / 3)]);
  const rush = (Math.abs(D.speed) * 1.8 + 60) * dt;
  let v = 0;
  for (const p of streakData) {
    p.z -= rush;
    if (p.z < -BEHIND) Object.assign(p, newStreak(AHEAD + rr(0, 20)));
    const life = THREE.MathUtils.smoothstep(p.z, -BEHIND, -BEHIND + 40) * (1 - THREE.MathUtils.smoothstep(p.z, AHEAD - 30, AHEAD));
    const len = p.len * (0.6 + windAmt * 0.8);
    let prevC = 0;
    for (let j = 0; j < WISP; j++) {
      const u = j / (WISP - 1);
      wp.copy(wC).addScaledVector(wS, Math.cos(p.a) * p.r).addScaledVector(wU, Math.sin(p.a) * p.r).addScaledVector(wF, p.z - u * len);
      const c = Math.sin(Math.PI * u) * life * p.b * 0.8;
      if (j > 0) {
        streakPos.set([wPrev.x, wPrev.y, wPrev.z, wp.x, wp.y, wp.z], v * 3);
        streakCol.set([prevC, prevC, prevC * 1.05, c, c, c * 1.05], v * 3);
        v += 2;
      }
      wPrev.copy(wp);
      prevC = c;
    }
  }
  streakGeo.setDrawRange(0, v);
  streakGeo.attributes.position.needsUpdate = true;
  streakGeo.attributes.color.needsUpdate = true;
}

// ---------- island pieces ----------
function islandBody(r) {
  const g = new THREE.Group();
  // grass cap with a wobbly rim
  const cap = new THREE.CylinderGeometry(r, r * 0.97, 3, 40, 1);
  const earth = new THREE.CylinderGeometry(r * 0.97, r * 0.9, 8, 40, 1);
  for (const geo of [cap, earth]) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + (noise(Math.cos(a) * 2 + r, Math.sin(a) * 2) - 0.5) * 0.18;
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    geo.computeVertexNormals();
  }
  const capM = new THREE.Mesh(cap, M.grass);
  capM.position.y = -1.5;
  capM.receiveShadow = true;
  const earthM = new THREE.Mesh(earth, M.earth);
  earthM.position.y = -7;
  earthM.receiveShadow = true;
  // hanging rock underneath, darker toward the tip
  const under = new THREE.ConeGeometry(r * 0.92, r * 1.55, 16, 7);
  under.rotateX(Math.PI);
  const p = under.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c0 = new THREE.Color("#a69079"), c1 = new THREE.Color("#4e4150");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = 0.5 - y / (r * 1.55);
    if (t > 0.02 && t < 0.98) { p.setX(i, p.getX(i) + rr(-1, 1) * r * 0.09); p.setZ(i, p.getZ(i) + rr(-1, 1) * r * 0.09); p.setY(i, y + rr(-1, 1) * r * 0.05); }
    const c = c0.clone().lerp(c1, t);
    col.set([c.r, c.g, c.b], i * 3);
  }
  under.setAttribute("color", new THREE.BufferAttribute(col, 3));
  under.computeVertexNormals();
  const underM = new THREE.Mesh(under, M.rock);
  underM.position.y = -11 - r * 0.775;
  g.add(capM, earthM, underM);
  // little rocks orbiting below
  for (let i = 0; i < 4; i++) {
    const s = rr(2, 5);
    const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M.rock);
    const a = rand() * Math.PI * 2;
    rk.position.set(Math.cos(a) * r * rr(1.05, 1.3), rr(-r * 0.9, -12), Math.sin(a) * r * rr(1.05, 1.3));
    rk.userData.spin = rr(-0.4, 0.4);
    rk.userData.keep = true;
    rk.userData.bob = rand() * 6;
    g.add(rk);
  }
  return g;
}
function pine(s = 1) {
  const g = new THREE.Group();
  const trunk = cyl(0.5 * s, 0.8 * s, 9 * s, M.wood, 6);
  trunk.position.y = 4.5 * s;
  trunk.rotation.z = rr(-0.25, 0.25);
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * s, (5.5 - i * 1.2) * s, 2.4 * s, 7), i % 2 ? M.pine2 : M.pine);
    c.position.set(rr(-1.2, 1.2) * s, (6.5 + i * 2.6) * s, rr(-1.2, 1.2) * s);
    c.castShadow = true;
    g.add(c);
  }
  return g;
}
function blossom(s = 1) {
  const g = new THREE.Group();
  const trunk = cyl(0.45 * s, 0.85 * s, 7 * s, M.wood, 6);
  trunk.position.y = 3.5 * s;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(2.2, 3.4) * s, 0), i % 2 ? M.blossom : M.blossom2);
    b.position.set(rr(-3.5, 3.5) * s, rr(7, 10.5) * s, rr(-3.5, 3.5) * s);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}
function bamboo() {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const h = rr(10, 18);
    const b = cyl(0.3, 0.35, h, M.bamboo, 5);
    b.position.set(rr(-2.5, 2.5), h / 2, rr(-2.5, 2.5));
    b.rotation.z = rr(-0.08, 0.08);
    g.add(b);
  }
  return g;
}
function stoneLantern() {
  const g = new THREE.Group();
  g.add(at(box(2.4, 0.8, 2.4, M.stone), 0, 0.4, 0), at(cyl(0.45, 0.55, 3, M.stone, 6), 0, 2.3, 0), at(box(2, 1.6, 2, M.stone), 0, 4.6, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 2.05), M.glow), 0, 4.6, 0));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2, 1.4, 4), M.stoneDark);
  cap.rotation.y = Math.PI / 4;
  g.add(at(cap, 0, 6.1, 0));
  return g;
}
function hangingLantern() {
  const g = new THREE.Group();
  const l = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), M.lantern);
  l.scale.set(1, 1.2, 1);
  g.add(l, at(cyl(0.6, 0.6, 0.4, M.gold, 8), 0, 1.25, 0), at(cyl(0.6, 0.6, 0.4, M.gold, 8), 0, -1.25, 0));
  return g;
}
function pillars(g, w, d, h, n, y0 = 0, m = M.red) {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * i) / (n - 1);
    for (const z of [d / 2, -d / 2]) {
      g.add(at(cyl(0.8, 0.9, h, m, 12), x, y0 + h / 2, z));
      g.add(at(cyl(1.25, 1.4, 0.7, M.stone, 10), x, y0 + 0.35, z)); // stone plinth
      g.add(at(cyl(1.05, 0.85, 0.6, M.gold, 12), x, y0 + h - 0.3, z)); // gilded capital
    }
  }
}
function plaque(text, w = 8, h = 3.2) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 100;
  const g = c.getContext("2d");
  g.fillStyle = "#1e2a4a"; g.fillRect(0, 0, 256, 100);
  g.strokeStyle = "#d9a441"; g.lineWidth = 8; g.strokeRect(4, 4, 248, 92);
  g.fillStyle = "#f2d38a"; g.font = "64px 'Ma Shan Zheng', KaiTi, serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 128, 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

// ---------- native Chinese flora ----------
// Huangshan pines with flat layered crowns, ginkgo, plum blossom (mei), weeping willow, red
// maple, osmanthus shrubs, bamboo with leaf sprays, Taihu scholar rocks, and swaying grass.
const F = {
  bark: std("#4a3324"), barkDark: std("#2f2119"), barkPale: std("#7a6a58"),
  pineA: std("#2c5440"), pineB: std("#3b6a4e"), ginkgoA: std("#e2c24a"), ginkgoB: std("#a9c255"),
  mei: std("#f4b6c8"), meiW: std("#fbe6ec"), willow: std("#9cc06a"), maple: std("#c8402a"), maple2: std("#e06a34"),
  osman: std("#2f5d3c"), osmanFlower: std("#f2c14e"), bambooLeaf: std("#79a84a"), taihu: std("#c9c4b8"),
};
// a bent trunk from a few cylinder links; returns the group and the tip position
function trunk(g, h, r, bends, m = F.bark) {
  let p = new THREE.Vector3(), dir = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < bends; k++) {
    const len = h / bends;
    dir.add(tmp.set(rr(-0.45, 0.45), 0, rr(-0.45, 0.45))).normalize();
    const c = cyl(r * (1 - k / bends) * 0.85 + 0.15, r * (1 - k / (bends + 1)), len, m, 7);
    c.position.copy(p).addScaledVector(dir, len / 2);
    c.quaternion.setFromUnitVectors(UP, dir);
    g.add(c);
    p = p.clone().addScaledVector(dir, len);
  }
  return p;
}
const blob = (r, m, sy = 1) => { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m); o.scale.y = sy; o.castShadow = true; return o; };
const TREES = {
  huangshan(s) {
    const g = new THREE.Group();
    const tip = trunk(g, 11 * s, 0.9 * s, 4);
    for (let k = 0; k < 5; k++) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(rr(3.5, 5.5) * s, rr(4, 6.5) * s, 1.3 * s, 9), k % 2 ? F.pineA : F.pineB);
      const a = rand() * 6, d = rr(1, 4) * s;
      pad.position.set(tip.x * (0.5 + k * 0.12) + Math.cos(a) * d, tip.y * (0.55 + k * 0.1), tip.z * (0.5 + k * 0.12) + Math.sin(a) * d);
      pad.castShadow = true;
      g.add(pad);
    }
    return g;
  },
  ginkgo(s) {
    const g = new THREE.Group();
    g.add(at(cyl(0.5 * s, 0.9 * s, 12 * s, F.bark, 7), 0, 6 * s, 0));
    const m = rand() < 0.6 ? F.ginkgoA : F.ginkgoB;
    for (let k = 0; k < 7; k++) { const y = (7 + k * 1.2) * s, w = (4.2 - k * 0.45) * s; g.add(at(blob(w, m, 0.7), rr(-1, 1) * s, y, rr(-1, 1) * s)); }
    return g;
  },
  mei(s) {
    const g = new THREE.Group();
    const tip = trunk(g, 8 * s, 0.7 * s, 3, F.barkDark);
    for (let k = 0; k < 4; k++) {
      const twig = new THREE.Group(), end = trunk(twig, 4 * s, 0.25 * s, 2, F.barkDark);
      twig.position.copy(tip).multiplyScalar(rr(0.6, 1));
      twig.rotation.z = rr(-1, 1); twig.rotation.x = rr(-1, 1);
      for (let j = 0; j < 4; j++) twig.add(at(blob(rr(0.9, 1.5) * s, j % 2 ? F.mei : F.meiW), end.x + rr(-1, 1) * s, end.y + rr(-1, 1) * s, end.z + rr(-1, 1) * s));
      g.add(twig);
    }
    return g;
  },
  willow(s) {
    const g = new THREE.Group();
    const tip = trunk(g, 9 * s, 0.9 * s, 3, F.barkPale);
    g.add(at(blob(4.5 * s, F.willow, 0.6), tip.x, tip.y + 1, tip.z));
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2, d = rr(2.5, 5) * s, len = rr(6, 10) * s;
      const strand = new THREE.Mesh(new THREE.ConeGeometry(0.35 * s, len, 4), F.willow);
      strand.rotation.x = Math.PI;
      strand.position.set(tip.x + Math.cos(a) * d, tip.y + 1 - len / 2, tip.z + Math.sin(a) * d);
      strand.userData.sway = rand() * 6;
      g.add(strand);
    }
    g.userData.willow = true;
    return g;
  },
  maple(s) {
    const g = new THREE.Group();
    const tip = trunk(g, 7 * s, 0.6 * s, 3, F.barkDark);
    for (let k = 0; k < 6; k++) g.add(at(blob(rr(2, 3.2) * s, k % 3 ? F.maple : F.maple2, 0.75), tip.x + rr(-3, 3) * s, tip.y + rr(-1, 2) * s, tip.z + rr(-3, 3) * s));
    return g;
  },
  osmanthus(s) {
    const g = new THREE.Group();
    g.add(at(blob(2.8 * s, F.osman, 0.85), 0, 2.2 * s, 0), at(blob(2 * s, F.osman, 0.8), 1.8 * s, 1.6 * s, 0.6 * s));
    for (let k = 0; k < 10; k++) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 5, 4), F.osmanFlower), rr(-2.5, 3) * s, rr(1, 4.2) * s, rr(-2.5, 2.5) * s));
    return g;
  },
  bamboo(s) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const h = rr(12, 22) * s, x = rr(-3, 3) * s, z = rr(-3, 3) * s;
      const c = cyl(0.3 * s, 0.36 * s, h, M.bamboo, 6);
      c.position.set(x, h / 2, z);
      c.rotation.z = rr(-0.07, 0.07);
      g.add(c);
      for (let j = 0; j < 3; j++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 3 * s, 3), F.bambooLeaf);
        leaf.position.set(x, h * rr(0.7, 1), z);
        leaf.rotation.set(rr(0.8, 1.6), rand() * 6, 0);
        g.add(leaf);
      }
    }
    return g;
  },
  taihu(s) {
    // a tall, eroded scholar rock: a stack of tilted lumps with a hole or two
    const g = new THREE.Group();
    let y = 0;
    for (let k = 0; k < 4; k++) { const r = rr(1.4, 2.4) * s * (1 - k * 0.12); const o = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), F.taihu); o.position.set(rr(-0.6, 0.6) * s, y + r * 0.8, rr(-0.6, 0.6) * s); o.rotation.set(rand() * 3, rand() * 3, rand() * 3); o.castShadow = true; g.add(o); y += r * 1.3; }
    const hole = new THREE.Mesh(new THREE.TorusGeometry(0.9 * s, 0.55 * s, 6, 10), F.taihu);
    hole.position.set(0, y * 0.55, 0); hole.rotation.y = rand() * 3;
    g.add(hole);
    return g;
  },
};
const TREE_MIX = [["huangshan", 0.24], ["mei", 0.16], ["ginkgo", 0.13], ["willow", 0.1], ["maple", 0.11], ["osmanthus", 0.12], ["bamboo", 0.09], ["taihu", 0.05]];
function pickTree() { let u = rand(); for (const [k, w] of TREE_MIX) { if ((u -= w) <= 0) return k; } return "huangshan"; }

// grass: instanced tapered blades that sway in a shared breeze
const grassTime = { value: 0 };
const grassMat = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
grassMat.onBeforeCompile = (sh) => {
  sh.uniforms.time = grassTime;
  sh.vertexShader = "uniform float time;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
    float h = max(position.y, 0.0);
    vec4 wp = instanceMatrix * vec4(0., 0., 0., 1.);
    transformed.x += sin(time * 1.8 + wp.x * 0.15 + wp.z * 0.1) * h * 0.18;
    transformed.z += cos(time * 1.4 + wp.z * 0.12) * h * 0.1;`);
};
const BLADE = (() => { const g = new THREE.ConeGeometry(0.28, 2.4, 3, 1); g.translate(0, 1.2, 0); return g; })();
function grass(isle, avoid) {
  const n = Math.round(isle.r * isle.r * 0.5);
  const im = new THREE.InstancedMesh(BLADE, grassMat, n);
  const c = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const greens = ["#6f9a4a", "#86ad55", "#5e8a43", "#9cbb5f", "#7fa64e"].map((h) => new THREE.Color(h));
  let k = 0;
  for (let i = 0; i < n * 2 && k < n; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * isle.r * 0.95;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid(x, z)) continue;
    const s = rr(0.6, 1.5);
    m.compose(tmp.set(x, 0, z), q.setFromEuler(e.set(rr(-0.25, 0.25), rand() * 6, rr(-0.25, 0.25))), new THREE.Vector3(s, s * rr(0.7, 1.5), s));
    im.setMatrixAt(k, m);
    im.setColorAt(k++, c.copy(greens[k % 5]).multiplyScalar(rr(0.85, 1.12)));
  }
  im.count = k;
  im.receiveShadow = true;
  return im;
}
// wildflowers: azalea pink, chrysanthemum gold and white, scattered in drifts
function flowers(isle, avoid) {
  const n = Math.round(isle.r * 3.5);
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.45, 0), std("#ffffff"), n);
  const cols = ["#ef7fa6", "#f2c14e", "#fff4e0", "#d65a8a"].map((h) => new THREE.Color(h));
  const m = new THREE.Matrix4();
  let k = 0;
  for (let d0 = 0; d0 < 12 && k < n; d0++) {
    const ca = rand() * Math.PI * 2, cd = rr(0.3, 0.85) * isle.r, col = cols[d0 % 4];
    for (let j = 0; j < n / 12 && k < n; j++) {
      const x = Math.cos(ca) * cd + rr(-8, 8), z = Math.sin(ca) * cd + rr(-8, 8);
      if (Math.hypot(x, z) > isle.r * 0.93 || avoid(x, z)) continue;
      m.makeTranslation(x, rr(0.8, 1.6), z);
      im.setMatrixAt(k, m);
      im.setColorAt(k++, col);
    }
  }
  im.count = k;
  return im;
}

// ---------- buildings, one style per island ----------
const BUILD = {
  hall(isle) {
    const g = new THREE.Group();
    g.add(at(box(40, 3, 28, M.stone), 0, 1.5, 0), at(box(14, 1.5, 6, M.stone), 0, 0.75, 16));
    g.add(at(box(32, 11, 18, M.wall), 0, 8.5, 0), at(box(7, 8, 0.6, M.dark), 0, 7, 9.05));
    // two studded door leaves at the jambs
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(side * 3.5, 3, 9.45);
      const leaf = at(box(3.5, 8, 0.25, M.redDeep), -side * 1.75, 4, 0);
      hinge.add(leaf);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) hinge.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), M.gold), -side * (0.9 + c * 1.5), 1.4 + r * 1.75, 0.15));
      const pull = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.07, 6, 14), M.gold);
      hinge.add(at(pull, -side * 3.1, 4, 0.2));
      g.add(hinge);
    }
    pillars(g, 32, 20, 11, 6, 3);
    g.add(at(box(36, 1.2, 22, M.red), 0, 14.4, 0));
    g.add(at(roof(46, 32, 8), 0, 15, 0));
    g.add(at(box(18, 5, 10, M.wall), 0, 20, 0), at(roof(26, 18, 7), 0, 22.5, 0));
    g.add(at(plaque(isle.zh2), 0, 17.5, 11.3));
    for (const x of [-9, 9]) { const l = hangingLantern(); l.position.set(x, 11.5, 11.3); g.add(l); }
    return { g, h: 30, br: 22 };
  },
  pagoda(isle) {
    const g = new THREE.Group();
    g.add(at(box(26, 3, 26, M.stone), 0, 1.5, 0));
    let y = 3;
    for (let k = 0; k < 5; k++) {
      const w = 17 * (1 - k * 0.13), h = 7.5 - k * 0.5;
      g.add(at(box(w, h, w, M.wall), 0, y + h / 2, 0));
      pillars(g, w + 1, w + 1, h, 2, y);
      g.add(at(box(w + 2, 0.8, w + 2, M.red), 0, y + h, 0));
      g.add(at(roof(w + 9, w + 9, 4.2, M.tileJade), 0, y + h + 0.3, 0));
      if (k < 4) for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const l = hangingLantern(); l.scale.setScalar(0.6); l.position.set(x * (w / 2 + 4), y + h - 0.5, z * (w / 2 + 4)); g.add(l); }
      y += h + 2.4;
    }
    g.add(at(cyl(0.35, 0.6, 11, M.gold, 8), 0, y + 4, 0));
    for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.4 - i * 0.18, 0.25, 6, 14), M.gold); t.rotation.x = Math.PI / 2; g.add(at(t, 0, y + 1.5 + i * 1.6, 0)); }
    g.add(at(plaque(isle.zh2, 6, 2.4), 0, 9.5, 9.2));
    return { g, h: y + 10, br: 14 };
  },
  pavilion(isle) {
    const g = new THREE.Group();
    g.add(at(cyl(17, 18, 3, M.stone, 8), 0, 1.5, 0));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; g.add(at(cyl(0.8, 0.9, 11, M.red), Math.cos(a) * 14, 8.5, Math.sin(a) * 14)); }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(14, 0.35, 6, 8), M.red);
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = Math.PI / 8;
    g.add(at(rail, 0, 6, 0));
    g.add(at(roof(36, 36, 9, M.tileJade), 0, 14, 0), at(cyl(5, 5, 3, M.red, 8), 0, 23, 0), at(roof(14, 14, 6, M.tileJade), 0, 24.5, 0));
    // the mahjong table, for the hosting nights
    g.add(at(box(6, 0.6, 6, M.jade ?? std("#2f6b5b")), 0, 6.2, 0), at(cyl(0.5, 0.5, 3, M.wood, 6), 0, 4.4, 0));
    const tile = std("#f6f0e2");
    for (let i = 0; i < 4; i++) for (let j = -3; j <= 3; j++) {
      const t = box(0.6, 0.8, 0.4, tile);
      const a = (i * Math.PI) / 2;
      t.position.set(Math.cos(a) * 2.2 - Math.sin(a) * j * 0.7, 6.9, Math.sin(a) * 2.2 + Math.cos(a) * j * 0.7);
      t.rotation.y = -a;
      g.add(t);
    }
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; g.add(at(cyl(1, 1, 3, M.stone, 8), Math.cos(a) * 5.5, 4.5, Math.sin(a) * 5.5)); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const l = hangingLantern(); l.scale.setScalar(0.7); l.position.set(Math.cos(a) * 16, 12, Math.sin(a) * 16); g.add(l); }
    return { g, h: 30, br: 18 };
  },
  teahouse(isle) {
    const g = new THREE.Group();
    g.add(at(box(30, 3, 22, M.stone), 0, 1.5, 0));
    g.add(at(box(24, 9, 14, M.wall), 0, 7.5, 0));
    pillars(g, 26, 18, 9, 5, 3);
    g.add(at(box(30, 1, 22, M.wood), 0, 12.5, 0), at(roof(34, 26, 4, M.tile), 0, 12.8, 0));
    g.add(at(box(18, 7, 10, M.wall), 0, 19, 0));
    pillars(g, 19, 11, 7, 4, 15.5);
    g.add(at(roof(28, 20, 8, M.tile), 0, 22.5, 0));
    // hanging scrolls with three reel thumbnails, one per era
    const loader = new THREE.TextureLoader();
    ["assets/reels/mac_C6Ag1u-JsaU.jpg", "assets/reels/clu_DOM-X2tE10p.jpg", "assets/reels/own_DT1J-Zmk0KF.jpg"].forEach((src, i) => {
      const t = loader.load(ROOT + src);
      t.colorSpace = THREE.SRGBColorSpace;
      const fr = box(4.6, 7.8, 0.3, M.redDeep);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(4, 7.1), new THREE.MeshBasicMaterial({ map: t }));
      pic.position.z = 0.2;
      fr.add(pic);
      fr.position.set(-7 + i * 7, 7.6, 7.3);
      g.add(fr);
    });
    g.add(at(plaque(isle.zh2, 6, 2.4), 0, 18.5, 5.3));
    for (const x of [-13, 13]) { const l = hangingLantern(); l.position.set(x, 10, 9.5); g.add(l); }
    return { g, h: 32, br: 17 };
  },
  gate(isle) {
    const g = new THREE.Group();
    // paifang gate
    for (const x of [-11, -4, 4, 11]) g.add(at(cyl(0.9, 1, x === -4 || x === 4 ? 15 : 11, M.red), x, x === -4 || x === 4 ? 7.5 : 5.5, 6), at(box(2.6, 2, 2.6, M.stone), x, 1, 6));
    g.add(at(box(25, 1.4, 1.8, M.red), 0, 10.5, 6), at(box(10, 1.6, 2, M.red), 0, 15, 6), at(box(9, 3, 0.6, M.gold), 0, 12.8, 6));
    g.add(at(roof(12, 4.5, 3.4), 0, 15.6, 6), at(roof(8, 4, 2.6), -7.5, 11, 6), at(roof(8, 4, 2.6), 7.5, 11, 6));
    g.add(at(plaque(isle.zh2, 5.5, 2.2), 0, 12.8, 6.4));
    // a stretch of the Great Wall with a watchtower
    const wall = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      wall.add(at(box(5, 6, 5, M.stoneDark), i * 5, 3 + i * 0.6, 0));
      for (const z of [-2.2, 2.2]) if (i % 1 === 0) wall.add(at(box(1.6, 1.4, 0.6, M.stone), i * 5 - 1.2, 6.7 + i * 0.6, z), at(box(1.6, 1.4, 0.6, M.stone), i * 5 + 1.3, 6.7 + i * 0.6, z));
    }
    wall.add(at(box(9, 11, 9, M.stone), 46, 6.5 + 5.4, 0), at(roof(12, 12, 4), 46, 17.4 + 0.4, 0));
    wall.position.set(-18, 0, -14);
    wall.rotation.y = 0.35;
    g.add(wall);
    // moon gate wall
    const moon = new THREE.Mesh(new THREE.TorusGeometry(5, 1.3, 8, 24), M.plain);
    g.add(at(moon, 16, 6, -6), at(box(3, 12, 2.2, M.plain), 22, 6, -6), at(box(3, 12, 2.2, M.plain), 10, 6, -6));
    moon.castShadow = true;
    return { g, h: 22, br: 13 };
  },
};

// ---------- labels ----------
function labelSprite(isle) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#b8322a";
  g.beginPath(); g.roundRect(28, 30, 150, 150, 18); g.fill();
  g.strokeStyle = "#d9a441"; g.lineWidth = 6; g.beginPath(); g.roundRect(38, 40, 130, 130, 12); g.stroke();
  g.fillStyle = "#f2d38a"; g.font = "118px 'Ma Shan Zheng', KaiTi, serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(isle.zh, 103, 110);
  g.textAlign = "left";
  g.fillStyle = "#fff6e6"; g.font = "700 78px 'Cormorant Garamond', Georgia, serif";
  g.shadowColor = "rgba(40,20,20,0.6)"; g.shadowBlur = 12;
  // shrink the title until it fits the sign, so long names like "community" aren't cut off
  let fs = 78;
  do { g.font = `700 ${fs}px 'Cormorant Garamond', Georgia, serif`; fs -= 2; } while (g.measureText(isle.en.toLowerCase()).width > 296 && fs > 30);
  g.fillText(isle.en.toLowerCase(), 200, 96);
  g.font = "500 34px 'IBM Plex Sans', sans-serif"; g.fillStyle = "#f6dcae";
  fs = 34;
  do { g.font = `500 ${fs}px 'IBM Plex Sans', sans-serif`; fs -= 1; } while (g.measureText(isle.sub).width > 292 && fs > 18);
  g.fillText(isle.sub, 204, 160);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, fog: false }));
  s.scale.set(64, 32, 1);
  return s;
}

// ---------- build every island ----------
const BEAM_H = 1600;
const beamMat = (k) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { time: { value: 0 }, power: { value: 1 }, k: { value: k } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
  fragmentShader: `uniform float time, power, k; varying vec2 vUv;
    void main(){
      float fade = pow(1. - vUv.y, 1.6);
      float ripple = 0.75 + 0.25 * sin(vUv.y * 40. - time * 3.);
      float edge = 0.55 + 0.45 * sin(vUv.x * 6.2832 * 3. + time);
      gl_FragColor = vec4(vec3(1.0, 0.8, 0.42) * fade * ripple * edge * power * k * 0.55, 1.);
    }`,
});
const clickables = [];
const TEMPLE = 1.9; // temples are built at a base size, then scaled up to suit the big islands
function makeIsle(isle) {
  const root = new THREE.Group();
  root.position.fromArray(isle.pos);
  root.add(islandBody(isle.r));
  // the building faces the home island (or +z for home)
  const face = isle.id === "home" ? 0 : Math.atan2(-isle.pos[0], -isle.pos[2]);
  const built = BUILD[isle.kind](isle), g = built.g, h = built.h * TEMPLE, br = built.br * TEMPLE;
  const holder = new THREE.Group();
  holder.rotation.y = face;
  holder.position.set(-Math.sin(face) * isle.r * 0.12, 0, -Math.cos(face) * isle.r * 0.12);
  holder.add(g);
  holder.scale.setScalar(TEMPLE);
  root.add(holder);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // landing ring in front of the door
  const fwd = new THREE.Vector3(Math.sin(face), 0, Math.cos(face));
  const ringPos = fwd.clone().multiplyScalar(isle.r * 0.55);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6, 8, 40), new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(ringPos).setY(0.15);
  // a column of light rising from the ridge of the temple roof into the sky, seen from across
  // the map and through the fog; it starts narrow at the roof and widens as it climbs
  const beam = new THREE.Group();
  for (const [w, k] of [[10, 0.5], [3.5, 1]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 0.3, BEAM_H, 32, 1, true), beamMat(k));
    m.position.y = BEAM_H / 2;
    beam.add(m);
  }
  beam.position.set(holder.position.x, h * 0.9, holder.position.z);
  root.add(ring, beam);
  // path stones from ring to door
  for (let i = 1; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.5, 7), M.stone);
    s.position.copy(fwd).multiplyScalar(isle.r * 0.55 - i * 3.6 - 3).setY(0.2);
    s.receiveShadow = true;
    root.add(s);
  }
  for (const side of [-1, 1]) {
    const l = stoneLantern();
    const p = ringPos.clone().add(new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(side * 12));
    l.position.copy(p);
    root.add(l);
  }
  // native trees around the rim, kept off the temple, the landing ring and the path between
  const hx = holder.position.x, hz = holder.position.z;
  const onPath = (x, z) => {
    const px = ringPos.x - hx, pz = ringPos.z - hz, L = Math.hypot(px, pz) || 1;
    const u = ((x - hx) * px + (z - hz) * pz) / (L * L);
    return u > 0 && u < 1.15 && Math.abs(((x - hx) * pz - (z - hz) * px) / L) < 9;
  };
  const blocked = (x, z, pad = 0) => Math.hypot(x - hx, z - hz) < br + pad || Math.hypot(x - ringPos.x, z - ringPos.z) < 12 + pad || onPath(x, z);
  const n = Math.round(isle.r / 2.3);
  for (let i = 0, placed = 0; i < n * 3 && placed < n; i++) {
    const a = rand() * Math.PI * 2, d = rr(0.25, 0.9) * isle.r;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (blocked(x, z, 8)) continue;
    const t = TREES[pickTree()](rr(0.9, 1.5));
    t.position.set(x, 0, z);
    t.rotation.y = rand() * 6;
    root.add(t);
    placed++;
  }
  root.add(grass(isle, (x, z) => blocked(x, z)), flowers(isle, (x, z) => blocked(x, z, 2)));
  // a paved courtyard under the temple
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(br + 6, br + 7, 0.6, 32), M.stone);
  yard.position.set(hx, 0.1, hz);
  yard.receiveShadow = true;
  root.add(yard);
  const label = labelSprite(isle);
  label.position.set(holder.position.x, h + 30, holder.position.z);
  label.userData.isle = isle;
  root.add(label);
  beam.userData.isle = holder.userData.isle = isle;
  ring.userData.keep = true;
  clickables.push(label, beam);
  scene.add(root);
  Object.assign(isle, { bld: g, root, ring, beam, label, face, br, bh: h, ringWorld: ringPos.clone().add(root.position), center: new THREE.Vector3().fromArray(isle.pos).add(holder.position) });
  // the temple, trees and props never move relative to the island: merge them, the temple on its
  // own so it can step aside while you're in its room; its pieces stay clickable to open the scroll
  for (const mesh of [...bake(root, [holder]), ...bake(g)]) { mesh.userData.isle = isle; clickables.push(mesh); }
}

// a pond on the grass feeds a stream to the edge, where it pours over and falls away into
// the clouds. Placed toward the back of each island, clear of the temple and its landing ring.
function islandFalls(isle) {
  const face = isle.id === "home" ? 0 : Math.atan2(-isle.pos[0], -isle.pos[2]);
  const sides = isle.r > 76 ? [-0.75, 0.75] : [waterRand() < 0.5 ? -0.75 : 0.75];
  for (const side of sides) {
    const a = face + Math.PI + side, dx = Math.sin(a), dz = Math.cos(a);
    // the grass cap's rim is wobbly; find where it actually ends in this direction
    const ga = Math.atan2(dz, dx), rim = isle.r * (1 + (noise(Math.cos(ga) * 2 + isle.r, Math.sin(ga) * 2) - 0.5) * 0.18);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(6.5, 20), M.water);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(dx * rim * 0.66, 0.2, dz * rim * 0.66);
    const len = rim * 0.34;
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(3.2, len), M.water);
    stream.rotation.set(-Math.PI / 2, 0, -a + Math.PI);
    stream.position.set(dx * (rim - len / 2), 0.18, dz * (rim - len / 2));
    const f = new THREE.Mesh(ribbonGeo(isle.r * 0.14, isle.pos[1] + 170, 12), ribbonMat);
    f.position.set(dx * rim, 0.1, dz * rim);
    f.rotation.y = a;
    isle.root.add(pond, stream, f);
  }
}

// ---------- the dragon ----------
const N = 40, SP = 2.05; // body segments; kept short enough that the tail stays in view
const dragon = new THREE.Group();
scene.add(dragon);
const RED = new THREE.Color("#c0221b"), RED2 = new THREE.Color("#8f1712"), BELLY = new THREE.Color("#f2d07e");
// the five elemental dragons. By default the season picks one (spring wood, summer fire,
// autumn metal, winter water); the settings panel can choose any of them instead.
const SKINS = {
  wood: { zh: "木", name: "Wood", main: "#2f8a52", dark: "#1d5c37", belly: "#e8de7a", belly2: "#c9b752", fin: "#d6ec7a", mane: "#d6ec7a", maneGlow: "#6a8a20", flame: "#f2a7bb", antler: "#9a8f7c", horn: "#f4efdc", scale: ["#236f42", "#3a9a5c", "#6cc184"], glow: "#9dffb0", whisker: "#f4f0d8", metal: 0.15 },
  fire: { zh: "火", name: "Fire", main: "#c0221b", dark: "#8f1712", belly: "#f6c51e", belly2: "#e3a10f", fin: "#f6c51e", mane: "#f6c51e", maneGlow: "#b06a00", flame: "#f2701a", antler: "#8e8a86", horn: "#fbf4e2", scale: ["#a8170f", "#cc2419", "#e2543a"], glow: "#ff8a2a", whisker: "#fff1cc", metal: 0.2 },
  metal: { zh: "金", name: "Metal", main: "#d8d4c8", dark: "#9a9486", belly: "#e2bd62", belly2: "#c09a40", fin: "#f2d38a", mane: "#f4efe2", maneGlow: "#8a7a52", flame: "#d9a53a", antler: "#7d7a74", horn: "#fffaf0", scale: ["#b2ac9e", "#d8d3c6", "#f2efe6"], glow: "#fff2c8", whisker: "#ffffff", metal: 0.65 },
  water: { zh: "水", name: "Water", main: "#1f4e8c", dark: "#0f2a52", belly: "#bfe6f2", belly2: "#8fc6da", fin: "#9fe0ff", mane: "#d8f4ff", maneGlow: "#3a8ac0", flame: "#3fb2ec", antler: "#8a96a2", horn: "#eef8fc", scale: ["#173f74", "#2862aa", "#4f8fd6"], glow: "#8fd8ff", whisker: "#e8fbff", metal: 0.3 },
  earth: { zh: "土", name: "Earth", main: "#b87a2a", dark: "#7a4a16", belly: "#f4d47c", belly2: "#d8b050", fin: "#f2c86a", mane: "#f2c86a", maneGlow: "#7a4a10", flame: "#c8501a", antler: "#857766", horn: "#f8eed8", scale: ["#94601f", "#b97c2c", "#d89a48"], glow: "#ffc86a", whisker: "#fff0d0", metal: 0.25 },
};
const SEASON_SKIN = { spring: "wood", summer: "fire", autumn: "metal", winter: "water" };
// body colours for a tube of N rings x RS sides: belly underneath, banded scales on top
function paintTube(geo, sk) {
  const col = geo.attributes.color, main = new THREE.Color(sk.main), dark = new THREE.Color(sk.dark), belly = new THREE.Color(sk.belly), belly2 = new THREE.Color(sk.belly2), c = new THREE.Color();
  for (let i = 0; i < N; i++) for (let j = 0; j < RS; j++) {
    const a = (j / RS) * Math.PI * 2;
    if (Math.sin(a) < -0.2) c.copy(belly).lerp(belly2, 0.25); else c.copy(main).lerp(dark, i % 2 ? 0.3 : 0.1);
    col.setXYZ(i * RS + j, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}
const segGeo = (() => {
  const g = new THREE.SphereGeometry(1, 14, 10);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    const c = y < -0.3 ? BELLY : RED.clone().lerp(RED2, 0.5 + 0.5 * Math.sin(z * 9 + p.getX(i) * 4));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
})();
const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 });
const finMat = new THREE.MeshStandardMaterial({ color: "#e9b546", roughness: 0.4, metalness: 0.5, flatShading: true });
const maneMat = new THREE.MeshStandardMaterial({ color: "#f08a24", emissive: "#a23a05", emissiveIntensity: 0.4, roughness: 0.6, flatShading: true });
const hornMat = std("#efdcae");
const flameMat = new THREE.MeshStandardMaterial({ color: "#f2701a", emissive: "#a8300a", emissiveIntensity: 0.35, roughness: 0.55, flatShading: true });
const antlerMat = std("#8e8a86", { flatShading: false, roughness: 0.6, metalness: 0.1 });
const radius = (i) => { const t = i / (N - 1); return 0.38 + 2.9 * Math.pow(1 - t, 0.75) * (t < 0.07 ? 0.78 + t * 3 : 1); };
const segs = [], fins = [];
// one skinned tube for the whole body; the per-segment objects are anchors for fins and legs
const RS = 20;
const tubeGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(N * RS * 3), col = new Float32Array(N * RS * 3), idx = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < RS; j++) {
    const a = (j / RS) * Math.PI * 2;
    const c = Math.sin(a) < -0.35 ? BELLY.clone().lerp(new THREE.Color("#e3b45c"), i % 2 ? 0.35 : 0) : RED.clone().lerp(RED2, i % 2 ? 0.45 : 0.1);
    col.set([c.r, c.g, c.b], (i * RS + j) * 3);
    if (i < N - 1) { const a0 = i * RS + j, a1 = i * RS + ((j + 1) % RS), b0 = a0 + RS, b1 = a1 + RS; idx.push(a0, a1, b0, a1, b1, b0); }
  }
  tubeGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tubeGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  tubeGeo.setIndex(idx);
}
const tube = new THREE.Mesh(tubeGeo, bodyMat);
tube.castShadow = true;
tube.frustumCulled = false;
dragon.add(tube);
for (let i = 0; i < N; i++) {
  const m = new THREE.Object3D();
  const r = radius(i);
  m.scale.set(r, r, r);
  if (i > 1 && i < N - 3) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.25, 5), finMat);
    fin.scale.z = 0.3;
    fin.position.y = 0.6;
    const piv = new THREE.Group();
    piv.position.set(0, 0.85, 0);
    piv.rotation.x = -0.8;
    piv.add(fin);
    m.add(piv);
    fins.push({ piv, i });
  }
  dragon.add(m);
  segs.push({ p: new THREE.Vector3(0, 250, 90 + i * SP), m });
}
// five-claw imperial legs on two body segments
const legs = [];
const limbMat = std("#b8231c", { flatShading: false, roughness: 0.45, metalness: 0.2 });
const clawMat = std("#f3e2b0", { flatShading: false, roughness: 0.3, metalness: 0.3 });
// flame fins: tongues of flame sweeping back from the flanks at intervals along the body
const flameFins = [];
for (const i of [8, 15, 22, 29]) for (const side of [-1, 1]) {
  const piv = new THREE.Group();
  piv.position.set(side * 0.95, 0.15, 0);
  piv.rotation.set(0, side * 0.9, 0);
  for (let k = 0; k < 3; k++) {
    const len = 3.4 - k * 0.7, c = new THREE.Mesh(new THREE.ConeGeometry(0.34 - k * 0.06, len, 5), flameMat);
    c.scale.x = 0.4;
    c.rotation.x = -Math.PI / 2 + 0.3 - k * 0.28;
    c.position.set(0, 0.2 - k * 0.15, -len / 2 + 0.3);
    piv.add(c);
  }
  segs[i].m.add(piv);
  flameFins.push({ piv, i, side });
}
// the belly: a run of broad plates wrapping the underside, each a little shorter than its
// segment so the seams between them read clearly; darker toward the seams, bright mid-plate
const bellyGeo = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 14, 3, true, Math.PI - 1.35, 2.7);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = 1 - 0.38 * THREE.MathUtils.smoothstep(Math.abs(p.getY(i)), 0.25, 0.5); col.set([v, v, v], i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
})();
const bellyMat = new THREE.MeshStandardMaterial({ color: "#f6c51e", vertexColors: true, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide });
const belly = new THREE.InstancedMesh(bellyGeo, bellyMat, N - 2);
belly.frustumCulled = false;
belly.castShadow = true;
dragon.add(belly);
// scale plates for the feet follow the skin's darker shade
const toeScaleMat = std("#8f1712", { flatShading: true, roughness: 0.35, metalness: 0.35 });
const scuteGeo = new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
scuteGeo.scale(1, 0.38, 1.25);
// a claw: a tube that hooks downward and tapers to a point
function clawTube(len, r0) {
  const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0, -0.03, len * 0.45], [0, -len * 0.4, len * 0.85], [0, -len * 0.85, len]].map((q) => new THREE.Vector3(...q)));
  const g = new THREE.TubeGeometry(curve, 10, 1, 7, false), p = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const u = Math.floor(i / 8) / 10;
    curve.getPointAt(Math.min(1, u), c);
    const k = r0 * (1 - u * 0.95);
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, clawMat);
}
// a dragon's foot: a padded palm shingled with scales, five toes of three joints each, every
// joint capped with its own scale plate, ending in a hooked claw
function foot() {
  const f = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), limbMat);
  palm.scale.set(1.3, 0.62, 1.35);
  f.add(palm);
  for (let r = 0; r < 3; r++) for (let c = -2; c <= 2; c++) {
    if (r === 2 && Math.abs(c) === 2) continue;
    const sc = new THREE.Mesh(scuteGeo, toeScaleMat);
    sc.position.set(c * 0.16 + (r % 2) * 0.08, 0.2 + r * 0.02, -0.22 + r * 0.2);
    sc.rotation.x = 0.3;
    sc.scale.setScalar(1.15 - r * 0.12);
    f.add(sc);
  }
  const lens = [0.36, 0.3, 0.24], rads = [0.11, 0.09, 0.075];
  for (let k = 0; k < 5; k++) {
    // four toes forward, the fifth set back on the inside like a thumb
    const thumb = k === 4, a = thumb ? -1.5 : (k - 1.5) * 0.36;
    const toe = new THREE.Group();
    toe.position.set(Math.sin(a) * 0.38, -0.02, Math.cos(a) * 0.4 - (thumb ? 0.15 : 0));
    toe.rotation.y = a;
    let parent = toe;
    const n = thumb ? 2 : 3;
    for (let j = 0; j < n; j++) {
      const joint = new THREE.Group();
      joint.position.z = j ? lens[j - 1] : 0;
      joint.rotation.x = j ? 0.32 : 0.08;
      parent.add(joint);
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(rads[j], lens[j] * 0.75, 4, 10), limbMat);
      bone.rotation.x = Math.PI / 2;
      bone.position.z = lens[j] / 2;
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(rads[j] * 1.12, 10, 8), limbMat);
      const plate = new THREE.Mesh(scuteGeo, toeScaleMat);
      plate.position.set(0, rads[j] * 0.8, lens[j] * 0.5);
      plate.scale.set(rads[j] * 11, rads[j] * 9, lens[j] * 3.4);
      plate.rotation.x = 0.12;
      joint.add(bone, knuckle, plate);
      parent = joint;
    }
    const tip = new THREE.Group();
    tip.position.z = lens[n - 1];
    tip.rotation.x = 0.25;
    tip.add(clawTube(thumb ? 0.42 : 0.55, rads[n - 1] * 1.05));
    parent.add(tip);
    f.add(toe);
  }
  return f;
}
// long, jointed limbs: a muscled haunch, upper leg, a knee with a backward spur, a forearm
// faced with horn plates, and a splayed paw of five jointed toes ending in hooked claws
for (const [si, ph] of [[6, 0], [20, Math.PI]]) {
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    const haunch = at(new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 9), limbMat), 0, -0.35, 0);
    haunch.scale.set(1, 1.35, 1.15);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.46, 2.4, 12), limbMat);
    upper.position.y = -1.35;
    const knee = at(new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), limbMat), 0, -2.55, 0);
    const spur = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.85, 6), clawMat);
    spur.position.set(0, -2.45, -0.4); spur.rotation.x = -2.0;
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.1, 12), limbMat);
    fore.position.set(0, -3.35, 0.55); fore.rotation.x = 0.55;
    leg.add(haunch, upper, knee, spur, fore);
    for (let ring = 0; ring < 5; ring++) for (let k = 0; k < 8; k++) {
      const a = (k + (ring % 2) * 0.5) / 8 * Math.PI * 2, y = -0.45 - ring * 0.42, rad = 0.46 - ring * 0.035;
      const sc = new THREE.Mesh(scuteGeo, toeScaleMat);
      sc.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
      sc.lookAt(Math.sin(a) * rad * 3, y - 0.4, Math.cos(a) * rad * 3);
      sc.rotateX(Math.PI / 2);
      sc.scale.setScalar(1.5);
      leg.add(sc);
    }
    for (let k = 0; k < 4; k++) {
      const plate = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 5), hornMat);
      plate.scale.set(1, 0.45, 0.35);
      plate.position.set(0, -2.75 - k * 0.42, 0.42 + k * 0.24 + 0.08);
      plate.rotation.x = 0.55;
      leg.add(plate);
    }
    const ft = foot();
    ft.position.set(0, -4.2, 1.15);
    leg.add(ft);
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.9, 5), maneMat);
    tuft.position.set(0, -2.55, -0.7); tuft.rotation.x = -2.3;
    leg.add(tuft);
    leg.position.set(side * 0.82, -0.55, 0);
    leg.rotation.z = side * 0.55;
    leg.scale.setScalar(0.72);
    bake(leg);
    segs[si].m.add(leg);
    legs.push({ leg, ph, side });
  }
}
// flame tail fan
const tailFlames = [];
{
  const tail = segs[N - 1].m;
  for (let k = 0; k < 9; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.7, 6, 6), k % 3 === 1 ? flameMat : maneMat);
    c.scale.x = 0.35;
    const piv = new THREE.Group();
    c.rotation.x = -Math.PI / 2; c.position.z = -3;
    piv.add(c);
    piv.rotation.set(rr(-0.2, 0.3), (k - 4) * 0.22, 0);
    tail.add(piv);
    tailFlames.push(piv);
  }
}

// ---------- the head ----------
// built forward along +z: cranium, a long snout with a bulbous nose and nostril curls, a hinged
// lower jaw with rows of teeth and fangs, a forked tongue, heavy brows over slit eyes,
// branching antlers, cheek frills, a flowing beard and a mane of flame locks
const head = new THREE.Group();
head.scale.setScalar(1.45);
dragon.add(head);
const mane = [], beard = [];
{
  const smooth = (c, o = {}) => std(c, { flatShading: false, roughness: 0.42, metalness: 0.18, ...o });
  const skin = smooth("#c0221b"), skinDark = smooth("#8f1712"), gold = smooth("#e7b24a", { metalness: 0.55, roughness: 0.3 });
  const tooth = smooth("#fbf5e4", { roughness: 0.25 }), mouthIn = smooth("#5a0d0d"), tongueM = smooth("#e0566a");
  const ball = (sx, sy, sz, m, seg = 20) => { const o = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), m); o.scale.set(sx, sy, sz); o.castShadow = true; return o; };
  const tubeAlong = (pts, r, m, seg = 20) => { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 6, false), m); o.castShadow = true; return o; };
  const taper = (pts, r0, m) => {
    // a tube whose radius shrinks to a point, for locks of hair, beard and antler tines
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, 18, 1, 6, false);
    const p = g.attributes.position, c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const ring = Math.floor(i / 7), u = ring / 18;
      curve.getPointAt(Math.min(1, u), c);
      const k = r0 * (1 - u * 0.92);
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
    }
    g.computeVertexNormals();
    const o = new THREE.Mesh(g, m); o.castShadow = true; return o;
  };

  // cranium and snout
  head.add(at(ball(1.85, 1.5, 2.0, skin), 0, 0.25, 0));
  head.add(at(ball(1.3, 0.72, 2.7, skin), 0, 0.15, 2.7));
  head.add(at(ball(0.42, 0.32, 2.3, gold), 0, 0.78, 2.4)); // nose ridge
  for (let k = 0; k < 5; k++) head.add(at(ball(0.18, 0.12, 0.3, gold, 8), 0, 1.0 - k * 0.04, 1.0 + k * 0.75));
  head.add(at(ball(1.05, 0.68, 0.7, skin), 0, 0.35, 5.15)); // nose pad
  for (const s of [-1, 1]) {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 16, Math.PI * 1.5), gold);
    curl.position.set(s * 0.55, 0.6, 5.55); curl.rotation.set(0, s * 0.5, s * 0.6);
    head.add(curl, at(ball(0.2, 0.14, 0.12, M.dark, 8), s * 0.45, 0.42, 5.78));
    // flared upper lip
    const lip = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), skinDark);
    lip.position.set(s * 1.05, -0.05, 4.6); lip.rotation.set(0.6, 0, s * 1.1);
    head.add(lip);
  }
  // upper teeth and fangs along the snout's underside
  head.add(at(ball(1.05, 0.25, 2.3, mouthIn), 0, -0.45, 3.0));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const z = 1.6 + k * 0.42, w = 1.08 - k * 0.04;
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 5), tooth);
      t.position.set(s * w, -0.6, z); t.rotation.x = Math.PI; head.add(t);
    }
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.3, 7), tooth);
    fang.position.set(s * 0.82, -0.95, 4.75); fang.rotation.set(Math.PI - 0.15, 0, s * 0.1);
    head.add(fang);
  }
  // hinged lower jaw
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.55, 0.3);
  jaw.add(at(ball(1.15, 0.42, 2.45, skin), 0, -0.4, 2.3), at(ball(1.0, 0.3, 2.2, gold), 0, -0.62, 2.2), at(ball(0.95, 0.2, 2.1, mouthIn), 0, -0.15, 2.4));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 8; k++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 5), tooth);
      t.position.set(s * (0.95 - k * 0.04), 0.05, 1.3 + k * 0.42); jaw.add(t);
    }
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.0, 7), tooth);
    fang.position.set(s * 0.7, 0.3, 4.2); fang.rotation.z = s * -0.12; jaw.add(fang);
    const frill = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.4, 5), k % 2 ? maneMat : finMat);
      f.scale.z = 0.25; f.position.y = 1.1; const p = new THREE.Group(); p.add(f);
      p.rotation.set(-1.9 + k * 0.12, 0, s * (0.9 + k * 0.22));
      frill.add(p);
    }
    frill.position.set(s * 1.0, -0.2, 0.3);
    jaw.add(frill);
  }
  // forked tongue curling out of the mouth
  const tongue = tubeAlong([[0, -0.1, 1.4], [0, -0.05, 3.2], [0, 0.15, 4.8], [0, -0.1, 6.0]], 0.2, tongueM);
  jaw.add(tongue);
  for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), tongueM); tip.position.set(s * 0.15, -0.15, 6.3); tip.rotation.set(Math.PI / 2, 0, s * -0.5); jaw.add(tip); }
  // beard hanging from the chin
  for (let k = 0; k < 7; k++) {
    const x = (k - 3) * 0.28;
    const lock = taper([[0, 0, 0], [x * 0.4, -0.9, -0.3], [x, -1.9, -1.2], [x * 1.3, -2.6, -2.6]], 0.26, k % 2 ? clawMat : gold);
    const piv = new THREE.Group(); piv.position.set(x * 0.6, -0.75, 2.4 - Math.abs(x) * 0.6); piv.add(lock); jaw.add(piv);
    beard.push(piv);
  }
  head.add(jaw);
  head.userData.jaw = jaw;
  head.userData.mats = { skin, skinDark, gold };

  // eyes: narrow fiery almonds slanting down toward the snout, slit pupils, a heavy lid and a
  // brow ridge that sits low over the inner corner for a scowl
  const eyeM = new THREE.MeshStandardMaterial({ color: "#ffb21f", emissive: "#ff6a00", emissiveIntensity: 2.6, roughness: 0.15 });
  const rimM = new THREE.MeshStandardMaterial({ color: "#ffe9a0", emissive: "#ffd060", emissiveIntensity: 1.2 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 1.3, 0.8, 1.85);
    eye.rotation.y = s * 0.85;
    const slant = new THREE.Group();
    slant.rotation.z = s * 0.38;
    slant.add(at(ball(0.72, 0.4, 0.4, skinDark), 0, 0, -0.12)); // socket
    slant.add(at(ball(0.62, 0.25, 0.4, eyeM), 0, 0, 0.08)); // almond eyeball
    slant.add(at(ball(0.64, 0.05, 0.4, rimM, 12), 0, -0.2, 0.1)); // glowing lower rim
    slant.add(at(ball(0.04, 0.22, 0.05, M.dark, 8), 0, 0, 0.47)); // slit pupil
    const lid = at(ball(0.7, 0.2, 0.42, skin), 0, 0.22, 0.06); // heavy upper lid
    lid.rotation.z = s * -0.2;
    slant.add(lid);
    eye.add(slant);
    head.add(eye);
    const brow = taper([[s * 0.35, 1.12, 2.6], [s * 1.0, 1.36, 2.15], [s * 1.65, 1.78, 1.25], [s * 2.1, 2.4, -0.2], [s * 2.35, 3.0, -1.2]], 0.42, gold);
    head.add(brow);
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 5), gold); sp.position.set(s * (0.9 + k * 0.45), 1.35 + k * 0.25, 1.9 - k * 0.5); sp.rotation.set(-0.9, 0, s * -0.6); head.add(sp); }
    // branching antlers
    const antler = new THREE.Group();
    antler.add(taper([[0, 0, 0], [0, 1.5, -0.6], [s * 0.3, 3.0, -1.8], [s * 0.5, 4.0, -3.4], [s * 0.4, 4.6, -5.2]], 0.34, antlerMat));
    antler.add(taper([[0, 1.3, -0.5], [s * 0.2, 2.4, 0.3], [s * 0.3, 3.1, 0.4]], 0.17, antlerMat));
    antler.add(taper([[s * 0.3, 2.9, -1.7], [s * 0.6, 4.1, -1.2], [s * 0.8, 4.8, -1.3]], 0.15, antlerMat));
    antler.add(taper([[s * 0.5, 3.9, -3.3], [s * 0.9, 4.9, -3.0], [s * 1.1, 5.4, -3.2]], 0.12, antlerMat));
    antler.position.set(s * 0.75, 1.45, -0.3);
    antler.rotation.z = s * -0.3;
    head.add(antler);
    // cheek spikes
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.3, 5), finMat);
      sp.position.set(s * 1.7, 0.1 - k * 0.35, -0.2 - k * 0.3); sp.rotation.set(-1.6, 0, s * -0.9);
      head.add(sp);
    }
  }
  // mane: flame locks sweeping back from crown and nape
  for (let k = 0; k < 22; k++) {
    const a = (k / 21) * Math.PI * 1.25 - Math.PI * 0.625;
    const len = rr(3.5, 6);
    const x = Math.sin(a) * 1.5, y = Math.cos(a) * 1.25 + 0.4;
    const lock = taper([[0, 0, 0], [x * 0.3, 0.5, -len * 0.3], [x * 0.6, 0.3 + rr(-0.3, 0.6), -len * 0.7], [x * 0.9, rr(-0.5, 0.8), -len]], rr(0.35, 0.55), k % 3 === 0 ? finMat : maneMat);
    const piv = new THREE.Group();
    piv.position.set(x, y, -1.0 - Math.abs(Math.sin(a)) * 0.4);
    piv.add(lock);
    head.add(piv);
    mane.push({ piv, ph: rand() * 6 });
  }
}

// the head and jaw are hundreds of small parts; merge what doesn't move on its own
bake(head.userData.jaw, beard);
bake(head, [head.userData.jaw, ...mane.map((m) => m.piv)]);
// the antlers sweep back right through the rider's eye line, so first person flies without them
const antlers = [];
head.traverse((o) => { if (o.isMesh && o.material === antlerMat) antlers.push(o); });

// ---------- scales ----------
// overlapping plates over the back and flanks. Each one hinges at its front edge, so it lies
// flat in calm air and lifts and flutters as the wind picks up; at full surge a few peel away.
const SCALE_ROWS = [], SCALE_COLS = 15;
for (let i = 2; i < N - 3; i++) SCALE_ROWS.push(i);
const scaleGeo = new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2);
// round, domed fish scales, darker in the middle with a bright rim, like overlapping coins
{
  const p = scaleGeo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)), v = 0.72 + 0.5 * THREE.MathUtils.smoothstep(d, 0.72, 0.98); col.set([v, v, v], i * 3); }
  scaleGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}
scaleGeo.scale(0.74, 0.085, 0.76);
scaleGeo.translate(0, 0, -0.75); // pivot at the leading edge
const scaleMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.45, vertexColors: true });
const scaleRnd = [];
const scales = new THREE.InstancedMesh(scaleGeo, scaleMat, SCALE_ROWS.length * SCALE_COLS);
scales.castShadow = true;
scales.frustumCulled = false;
{
  for (let n = 0; n < scales.count; n++) scaleRnd.push([rand(), rand()]);
}
// recolour the whole dragon for a skin: body, belly, scales, fins, mane, horns, limbs, head
let mySkin = "fire";
function applySkin(key) {
  const sk = SKINS[key] || SKINS.fire;
  mySkin = key;
  paintTube(tubeGeo, sk);
  bodyMat.metalness = sk.metal;
  const deep = new THREE.Color(sk.scale[0]), bright = new THREE.Color(sk.scale[1]), tip = new THREE.Color(sk.scale[2]), c = new THREE.Color();
  for (let n = 0; n < scales.count; n++) {
    const j = n % SCALE_COLS, edge = Math.abs(j - (SCALE_COLS - 1) / 2) / ((SCALE_COLS - 1) / 2), [r1, r2] = scaleRnd[n];
    c.copy(deep).lerp(bright, r1 * 0.6).lerp(tip, edge > 0.8 ? 0.6 : r2 < 0.08 ? 0.5 : 0);
    scales.setColorAt(n, c);
  }
  scales.instanceColor.needsUpdate = true;
  scaleMat.metalness = 0.35 + sk.metal * 0.5;
  finMat.color.set(sk.fin);
  maneMat.color.set(sk.mane); maneMat.emissive.set(sk.maneGlow);
  hornMat.color.set(sk.horn); clawMat.color.set(sk.horn);
  limbMat.color.set(sk.main);
  toeScaleMat.color.set(sk.scale[2]);
  flameMat.color.set(sk.flame);
  antlerMat.color.set(sk.antler);
  bellyMat.color.set(sk.belly);
  whiskerMat.color.set(sk.whisker);
  const hm = head.userData.mats;
  hm.skin.color.set(sk.main); hm.skinDark.color.set(sk.dark); hm.gold.color.set(sk.fin);
  hm.skin.metalness = hm.skinDark.metalness = sk.metal * 0.8;
}
dragon.add(scales);
// loose scales shed into the slipstream
const SHED = 70;
const shed = new THREE.InstancedMesh(scaleGeo, new THREE.MeshStandardMaterial({ color: "#e9a23b", emissive: "#b8400f", emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 }), SHED);
shed.frustumCulled = false;
const shedData = Array.from({ length: SHED }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
scene.add(shed);
// whiskers, rebuilt each frame so they trail and wave
const whiskerMat = new THREE.MeshStandardMaterial({ color: "#fff1cc", roughness: 0.5 });
const whiskers = [-1, 1].map((s) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), whiskerMat); scene.add(m); return { m, s }; });
// the flaming pearl the dragon chases
const pearl = new THREE.Group();
{
  pearl.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 16), new THREE.MeshStandardMaterial({ color: "#fff7e0", emissive: "#ffd48a", emissiveIntensity: 2.5 })));
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,230,170,1)"); grd.addColorStop(0.35, "rgba(255,150,60,0.55)"); grd.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(7, 7, 1);
  pearl.add(glow);
  const light = new THREE.PointLight("#ffb860", 60, 50, 1.6);
  pearl.add(light);
  // the pearl the dragon used to chase is retired: it's built but never added to the scene
}

// ---------- flight state ----------
const D = { pos: new THREE.Vector3(0, 250, 90), yaw: Math.PI, speed: 0, vy: 0, pitch: 0, idle: 0, auto: null };
const keys = new Set();
const cam = { yaw: 0, pitch: 0.4, dist: 105, drag: false };
const ext = { turn: 0, fwd: 0, vert: 0 }; // touch stick and hand input
let started = false, panelOpen = false, near = null;

// the auto-flight route to an island's ring, as the next point to head for
function autoWaypoint(tgt) {
  const p = D.pos;
  // tucked under an island (or below its rim beside the rock): straight out past the rim first,
  // holding this height, so the climb happens in open air
  for (const isle of ISLES) {
    if (!isle.root) continue;
    const c = isle.root.position, ox = p.x - c.x, oz = p.z - c.z, d = Math.hypot(ox, oz);
    if (d < isle.r * 1.3 && p.y < c.y - 2) {
      const ux = d > 1 ? ox / d : Math.sin(D.yaw), uz = d > 1 ? oz / d : Math.cos(D.yaw);
      return new THREE.Vector3(c.x + ux * isle.r * 1.75, p.y, c.z + uz * isle.r * 1.75);
    }
  }
  // in the open: is any island in the way along the line to the ring? Then climb above it,
  // straight up while close to it, still closing the distance while further off
  let need = -Infinity, block = null;
  for (let k = 1; k <= 16; k++) {
    const u = k / 16, x = p.x + (tgt.x - p.x) * u, z = p.z + (tgt.z - p.z) * u, y = p.y + (tgt.y - p.y) * u;
    for (const isle of ISLES) {
      if (!isle.root) continue;
      const c = isle.root.position;
      if (Math.hypot(x - c.x, z - c.z) < isle.r * 1.25 && y < c.y + 8 && c.y + 30 > need) { need = c.y + 30; block = isle; }
    }
  }
  if (block && p.y < need - 4) {
    const c = block.root.position;
    if (Math.hypot(p.x - c.x, p.z - c.z) < block.r * 1.6) return new THREE.Vector3(p.x, need, p.z);
    return new THREE.Vector3(tgt.x, need, tgt.z);
  }
  return tgt;
}
function steer(dt) {
  if (panelOpen || MP.dead) { D.speed *= Math.exp(-dt * 3); D.vy *= Math.exp(-dt * 3); return; }
  const k = (c) => keys.has(c);
  let fwd = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0) + ext.fwd;
  // keys always win over hand or touch steering, so a stale hand signal can never cancel a key
  const keyTurn = (k("KeyA") || k("ArrowLeft") ? 1 : 0) - (k("KeyD") || k("ArrowRight") ? 1 : 0);
  let turn = keyTurn || ext.turn;
  let vert = (k("Space") ? 1 : 0) - (k("KeyC") || k("KeyQ") ? 1 : 0) + ext.vert;
  // with the mouse captured, looking up climbs and looking down dives (keys still win)
  const mouseVert = !vert && typeof LOCK !== "undefined" && LOCK.on && !D.auto ? THREE.MathUtils.clamp(MOUSE.pitch * 1.8, -1, 1) : 0;
  const boost = (k("ShiftLeft") || k("ShiftRight")) && fwd > 0;
  if (boost && !D.boost) Sound.whoosh();
  D.boost = boost;
  // a serpent can't swim backwards: back brakes, and held, swings the dragon round in a U-turn
  if (fwd < 0) {
    D.back = (D.back || 0) + dt;
    if (D.back > 0.3 && D.uturn === undefined) D.uturn = D.yaw + Math.PI * (turn < 0 ? -1 : 1);
    fwd = 0;
  } else D.back = 0;
  if (D.uturn !== undefined) {
    let dy = D.uturn - D.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (Math.abs(dy) < 0.08 || (fwd > 0 && D.back === 0 && !keys.has("KeyS"))) D.uturn = undefined;
    else { turn = Math.sign(dy); fwd = Math.max(fwd, 0.45); }
  }
  const manual = fwd || turn || vert || D.back;
  if (mouseVert) vert = mouseVert;
  if (manual) D.auto = null;
  if (D.auto) {
    const tgt = D.auto.ringWorld.clone().setY(D.auto.ringWorld.y + 14);
    // never through rock: head for a waypoint that first gets out from under any island, then
    // climbs clear of whatever island lies across the way, and only then makes for the ring
    const way = autoWaypoint(tgt), direct = way === tgt;
    const dx = way.x - D.pos.x, dz = way.z - D.pos.z, dist = Math.hypot(dx, dz);
    let dy = Math.atan2(dx, dz) - D.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    turn = dist < 4 ? 0 : THREE.MathUtils.clamp(dy * 2, -1, 1);
    fwd = Math.min(1, dist / 160) * (Math.abs(dy) > 1.2 ? 0.35 : 1);
    D.autoSurge = direct && dist > 120;
    // on the open run, cruise high and settle onto the ring at the end
    const cruise = direct ? (dist > 90 ? tgt.y + 60 : tgt.y) : way.y;
    vert = THREE.MathUtils.clamp((cruise - D.pos.y) / 20, -1, 1);
    if (dist < 8 && Math.abs(tgt.y - D.pos.y) < 6) { D.auto = null; flash(`${near ? "press E to enter" : "landed"}`); }
  }
  D.idle = manual || D.auto ? 0 : D.idle + dt;
  // idle: no drifting in circles. The head holds its place in a slow, small figure-eight hover
  // while a travelling wave runs down the body (see animateDragon).
  if (D.idle > 0.6) {
    if (!D.anchor) D.anchor = D.pos.clone();
    const h = clock.elapsedTime * 0.45;
    const goal = tmp.copy(D.anchor).add(new THREE.Vector3(Math.sin(h) * 2.5, Math.sin(h * 2) * 1.6, Math.sin(h) * Math.cos(h) * 2.5));
    D.pos.lerp(goal, 1 - Math.exp(-dt * 1.5));
    D.yaw += Math.sin(h * 0.7) * 0.04 * dt;
  } else D.anchor = null;
  D.yaw += turn * 1.9 * dt;
  const target = fwd * (D.auto ? 230 : boost ? 170 : 85);
  D.speed += (target - D.speed) * (1 - Math.exp(-dt * 2.5));
  D.vy += (vert * 55 - D.vy) * (1 - Math.exp(-dt * 3));
  D.pos.x += Math.sin(D.yaw) * D.speed * dt;
  D.pos.z += Math.cos(D.yaw) * D.speed * dt;
  D.pos.y += D.vy * dt;
  D.pitch += (Math.atan2(D.vy, Math.max(30, Math.abs(D.speed))) - D.pitch) * (1 - Math.exp(-dt * 4));
  collide();
}
function collide() {
  D.pos.y = THREE.MathUtils.clamp(D.pos.y, -140, 700);
  const flat = Math.hypot(D.pos.x, D.pos.z);
  if (flat > 1500) D.pos.multiplyScalar(1500 / flat).setY(D.pos.y);
  for (const c of PILLARS) {
    if (!c.alive || D.pos.y > c.top) continue;
    const dx = D.pos.x - c.x, dz = D.pos.z - c.z, d = Math.hypot(dx, dz);
    if (d < c.r) { D.pos.x = c.x + (dx / (d || 1)) * c.r; D.pos.z = c.z + (dz / (d || 1)) * c.r; }
  }
  for (const m of MASSIFS) {
    if (Math.hypot(D.pos.x - m.x, D.pos.z - m.z) > m.R * 1.2) continue;
    for (const c of m.parts) {
      if (D.pos.y > c.top) continue;
      const dx = D.pos.x - c.x, dz = D.pos.z - c.z, d = Math.hypot(dx, dz);
      if (d < c.r) { D.pos.x = c.x + (dx / (d || 1)) * c.r; D.pos.z = c.z + (dz / (d || 1)) * c.r; }
    }
  }
  for (const isle of ISLES) {
    if (!isle.root) continue;
    const p = isle.root.position;
    const dx = D.pos.x - p.x, dz = D.pos.z - p.z, d = Math.hypot(dx, dz);
    const top = p.y + 3;
    // building: push out sideways
    const bx = D.pos.x - isle.center.x, bz = D.pos.z - isle.center.z, bd = Math.hypot(bx, bz);
    if (bd < isle.br && D.pos.y < p.y + isle.bh) { const s = isle.br / (bd || 1); D.pos.x = isle.center.x + bx * s; D.pos.z = isle.center.z + bz * s; }
    // island: rest on the grass, or slide around the rock underneath
    const under = isle.r * (1 - (top - D.pos.y) / (isle.r * 1.6));
    if (D.pos.y < top && D.pos.y > top - 12 && d < isle.r) D.pos.y = top;
    else if (D.pos.y <= top - 12 && D.pos.y > top - isle.r * 1.6 && d < under) { const s = under / (d || 1); D.pos.x = p.x + dx * s; D.pos.z = p.z + dz * s; }
  }
}

const tmp = new THREE.Vector3(), side = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
// Keeps the body from folding or passing through itself, the way a real serpent's spine can't:
// 1) a bend limit between neighbouring segments (no hairpin kinks), then
// 2) self-collision: segments more than a few links apart push each other out. The front of the
//    body has right of way, and if the head itself presses into a coil, the head is pushed back too.
const MAX_BEND = 0.42, d1 = new THREE.Vector3(), d2 = new THREE.Vector3(), axis = new THREE.Vector3(), push = new THREE.Vector3();
function constrainBody() {
  for (let i = 2; i < N; i++) {
    d1.subVectors(segs[i - 1].p, segs[i - 2].p).normalize();
    d2.subVectors(segs[i].p, segs[i - 1].p);
    const len = d2.length() || SP;
    d2.divideScalar(len);
    const ang = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1));
    if (ang > MAX_BEND) {
      axis.crossVectors(d1, d2);
      if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0).cross(d1);
      axis.normalize();
      d2.copy(d1).applyAxisAngle(axis, MAX_BEND);
      segs[i].p.copy(segs[i - 1].p).addScaledVector(d2, len);
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N - 6; i++) {
      const a = segs[i].p, ra = radius(i) * (i === 0 ? 1.6 : 1);
      for (let j = i + 6; j < N; j++) {
        const b = segs[j].p, min = (ra + radius(j)) * 1.05;
        push.subVectors(b, a);
        const d = push.length();
        if (d >= min) continue;
        if (d < 1e-4) push.set(0, 1, 0); else push.divideScalar(d);
        const over = min - d;
        b.addScaledVector(push, over * (i === 0 ? 0.6 : 0.75));
        a.addScaledVector(push, -over * (i === 0 ? 0.4 : 0.25));
        if (i === 0) D.pos.copy(a);
      }
    }
    // pull the chain back to its link length after the pushes
    for (let i = 1; i < N; i++) {
      tmp.subVectors(segs[i].p, segs[i - 1].p);
      const l = tmp.length();
      if (l > SP) segs[i].p.copy(segs[i - 1].p).addScaledVector(tmp, SP / l);
    }
  }
}
const render = segs.map(() => new THREE.Vector3());
const TAN = segs.map(() => new THREE.Vector3()), BIN = segs.map(() => new THREE.Vector3()), NRM = segs.map(() => new THREE.Vector3());
const m4 = new THREE.Matrix4(), rotX = new THREE.Matrix4(), sX = new THREE.Vector3(), sY = new THREE.Vector3(), sP = new THREE.Vector3();
function scaleFrame(i, j) {
  const r = radius(i), a = Math.PI * (-0.14 + 1.28 * (j + (i % 2) * 0.5) / SCALE_COLS);
  sY.copy(BIN[i]).multiplyScalar(Math.cos(a)).addScaledVector(NRM[i], Math.sin(a)).normalize();
  sP.copy(render[i]).addScaledVector(BIN[i], Math.cos(a) * r * 0.97).addScaledVector(NRM[i], Math.sin(a) * r * 0.88);
  sX.crossVectors(sY, TAN[i]).normalize();
  return r;
}
function animateDragon(t, dt) {
  segs[0].p.copy(D.pos);
  for (let i = 1; i < N; i++) {
    tmp.subVectors(segs[i].p, segs[i - 1].p);
    const l = tmp.length();
    if (l > SP) segs[i].p.copy(segs[i - 1].p).addScaledVector(tmp, SP / l);
    // a soft sag so a resting dragon coils instead of hanging rigid
    if (l < SP * 0.9) segs[i].p.y -= dt * 2;
  }
  constrainBody();
  const move = Math.min(1, Math.abs(D.speed) / 60 + 0.25);
  // hovering: ease the body into a loose S trailing behind the head, then let a travelling
  // wave run along it. Side-to-side wave plus a vertical wave at twice the frequency, a quarter
  // cycle apart (how flying snakes undulate), strongest mid-body and calm at head and tail.
  const hoverGoal = D.idle > 0.6 && Math.abs(D.speed) < 8 ? 1 : 0;
  // ease into a hover slowly, but hand the body back to the flight chain quickly once moving
  D.hover = (D.hover || 0) + (hoverGoal - (D.hover || 0)) * (1 - Math.exp(-dt * (hoverGoal ? 1.2 : 5)));
  // wave phases are accumulated, never "time x speed": changing the speed of t * f jumps the phase
  D.phSide = (D.phSide || 0) + dt * (4.2 - D.hover * 2.4);
  D.phUp = (D.phUp || 0) + dt * (2.6 - D.hover * 0.6) * 2;
  if (D.hover > 0.01) {
    const back = tmp.set(-Math.sin(D.yaw), 0, -Math.cos(D.yaw)), across = new THREE.Vector3(back.z, 0, -back.x);
    for (let i = 1; i < N; i++) {
      const u = i / N, env = Math.sin(Math.PI * Math.min(1, u * 1.15));
      const rest = D.pos.clone().addScaledVector(back, i * SP * 0.86)
        .addScaledVector(across, Math.sin(i * 0.2 + t * 0.55) * 7 * env)
        .add(new THREE.Vector3(0, Math.sin(i * 0.4 + t * 1.1 + Math.PI / 2) * 2.4 * env - u * 6, 0));
      segs[i].p.lerp(rest, D.hover * (1 - Math.exp(-dt * 1.6)));
    }
  }
  for (let i = 0; i < N; i++) {
    const a = segs[Math.max(0, i - 1)].p, b = segs[Math.min(N - 1, i + 1)].p;
    tmp.subVectors(a, b).normalize();
    side.crossVectors(tmp, UP).normalize();
    const f = i / N, env = Math.sin(Math.PI * Math.min(1, f * 1.15));
    const sideAmp = 1.1 * f * move + D.hover * 1.6 * env, upAmp = 0.9 * (0.3 + f) + D.hover * 0.8 * env;
    render[i].copy(segs[i].p)
      .addScaledVector(side, Math.sin(D.phSide - i * 0.38) * sideAmp)
      .addScaledVector(UP, Math.sin(D.phUp - i * 0.6 + Math.PI / 2) * upAmp * 0.5 + Math.sin(t * 2.6 - i * 0.3) * upAmp * 0.5);
  }
  for (let i = 0; i < N; i++) {
    const m = segs[i].m;
    m.position.copy(render[i]);
    m.lookAt(i === 0 ? render[0].clone().add(tmp.set(Math.sin(D.yaw), Math.sin(D.pitch), Math.cos(D.yaw))) : render[i - 1]);
  }
  const tp = tubeGeo.attributes.position, nrm = new THREE.Vector3(), tan = new THREE.Vector3(), bin = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    tan.subVectors(render[Math.max(0, i - 1)], render[Math.min(N - 1, i + 1)]).normalize();
    bin.crossVectors(tan, UP).normalize();
    nrm.crossVectors(bin, tan);
    TAN[i].copy(tan); BIN[i].copy(bin); NRM[i].copy(nrm);
    const r = radius(i) * (i === 0 ? 0.9 : 1);
    for (let j = 0; j < RS; j++) {
      const a = (j / RS) * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.92;
      tp.setXYZ(i * RS + j, render[i].x + bin.x * x + nrm.x * y, render[i].y + bin.y * x + nrm.y * y, render[i].z + bin.z * x + nrm.z * y);
    }
  }
  tp.needsUpdate = true;
  tubeGeo.computeVertexNormals();
  for (let i = 1; i < N - 1; i++) {
    const r = radius(i) * 1.06;
    m4.makeBasis(BIN[i], TAN[i], NRM[i]).scale(tmp.set(r, SP * 0.86, r * 0.95)).setPosition(render[i]);
    belly.setMatrixAt(i - 1, m4);
  }
  belly.instanceMatrix.needsUpdate = true;
  for (const { piv, i, side } of flameFins) piv.rotation.y = side * (0.9 - windAmt * 0.35) + Math.sin(t * 7 + i) * 0.12;
  // scales hinge open with the wind, each on its own flutter
  let n = 0;
  for (const i of SCALE_ROWS) for (let j = 0; j < SCALE_COLS; j++, n++) {
    const r = scaleFrame(i, j);
    const lift = 0.05 + 0.03 * Math.sin(t * 2 + i * 0.3) + windAmt * (0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 17 + i * 0.9 + j * 1.7)));
    m4.makeBasis(sX, sY, TAN[i]).multiply(rotX.makeRotationX(lift));
    const k = r * 0.4;
    m4.scale(tmp.set(k, k, k * 1.15)).setPosition(sP);
    scales.setMatrixAt(n, m4);
  }
  scales.instanceMatrix.needsUpdate = true;
  // at speed, loose scales peel off and tumble away in the slipstream
  if (windAmt > 0.35 && !REDUCE) {
    let want = windAmt * dt * 30;
    for (const d of shedData) {
      if (want < rand()) break;
      if (d.life > 0) continue;
      const i = SCALE_ROWS[Math.floor(rand() * SCALE_ROWS.length)];
      scaleFrame(i, Math.floor(rand() * SCALE_COLS));
      d.p.copy(sP);
      d.v.copy(TAN[i]).multiplyScalar(Math.abs(D.speed) * 0.55).addScaledVector(sY, rr(4, 10));
      d.w.set(rr(-8, 8), rr(-8, 8), rr(-8, 8));
      d.life = rr(1.6, 2.6);
      d.s = radius(i) * 0.4;
      want -= 1;
    }
  }
  const q = new THREE.Quaternion();
  shedData.forEach((d, k) => {
    if (d.life > 0) {
      d.life -= dt;
      d.p.addScaledVector(d.v, dt);
      d.v.multiplyScalar(Math.exp(-dt * 1.6));
      d.v.y -= dt * 3;
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
    }
    const sc = d.life > 0 ? d.s * Math.min(1, d.life) : 0;
    m4.compose(d.p, q.setFromEuler(d.r), tmp.set(sc, sc, sc));
    shed.setMatrixAt(k, m4);
  });
  shed.instanceMatrix.needsUpdate = true;
  for (const { piv, i } of fins) piv.rotation.x = -0.8 - windAmt * 0.55 + Math.sin(t * 6 - i * 0.5) * (0.05 + windAmt * 0.22);
  tailFlames.forEach((p, k) => { p.rotation.x = Math.sin(t * 5 + k) * (0.12 + windAmt * 0.3); });
  for (const { piv, ph } of mane) { piv.rotation.x = Math.sin(t * 3 + ph) * 0.1 + windAmt * 0.18; piv.rotation.y = Math.sin(t * 4.5 + ph) * (0.08 + windAmt * 0.3); }
  beard.forEach((p, k) => { p.rotation.x = -windAmt * 0.8 + Math.sin(t * 2.4 + k) * 0.14; });
  for (const { leg, ph, side: s } of legs) leg.rotation.x = Math.sin(t * 5 + ph + (s > 0 ? Math.PI : 0)) * 0.6 * move - 0.3;
  head.position.copy(render[0]);
  const look = new THREE.Vector3(Math.sin(D.yaw) * Math.cos(D.pitch), Math.sin(D.pitch), Math.cos(D.yaw) * Math.cos(D.pitch));
  head.lookAt(render[0].clone().add(look));
  // the jaw hangs open in a snarl and roars every few seconds
  head.userData.jaw.rotation.x = 0.26 + Math.pow(Math.max(0, Math.sin(t * 0.7)), 8) * 0.38 + windAmt * 0.12 + roar * 0.45;
  // whiskers trail back from the snout, waving
  head.updateMatrixWorld();
  for (const w of whiskers) {
    const pts = [];
    for (let k = 0; k < 12; k++) {
      const local = new THREE.Vector3(w.s * (1.0 + k * 0.5), 0.15 - k * 0.1 + Math.sin(t * 3 + k * 0.7) * 0.08 * k, 5.0 - k * (1.3 + windAmt * 0.3));
      pts.push(local.applyMatrix4(head.matrixWorld));
    }
    w.m.geometry.dispose();
    w.m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.12, 4, false);
  }
  // pearl leads the snout
  const pp = render[0].clone().addScaledVector(look, 13 + Math.sin(t * 1.7) * 1.5).add(tmp.set(Math.cos(t * 1.1) * 1.5, 2.5 + Math.sin(t * 2) * 1, 0));
  pearl.position.lerp(pp, 1 - Math.exp(-dt * 6));
}

function updateCamera(dt) {
  for (const a of antlers) a.visible = !firstPerson;
  if (firstPerson) { firstPersonCamera(dt); sunLight.position.copy(render[0]).addScaledVector(sunDir, 400); sunLight.target.position.copy(render[0]); return; }
  if (!cam.drag && Math.abs(D.speed) > 20) cam.yaw *= Math.exp(-dt * 1.2);
  const target = render[0].clone().add(tmp.set(0, 5, 0));
  const y = D.yaw + Math.PI + cam.yaw;
  // while hovering, ease back and up a little so the whole dragon, tail included, is in view
  const hv = D.hover || 0, pitch = cam.pitch + hv * 0.14, dist = cam.dist * (1 + hv * 0.3);
  const off = new THREE.Vector3(Math.sin(y) * Math.cos(pitch), Math.sin(pitch), Math.cos(y) * Math.cos(pitch)).multiplyScalar(dist);
  const want = target.clone().add(off);
  want.y = Math.max(want.y, -150);
  camera.position.lerp(want, 1 - Math.exp(-dt * 4));
  // the lens widens and shivers a little at full surge
  camera.fov += (58 + windAmt * 14 - camera.fov) * (1 - Math.exp(-dt * 3));
  camera.updateProjectionMatrix();
  const jolt = (windAmt > 0.5 ? (windAmt - 0.5) * 0.5 : 0) + shake;
  if (jolt > 0.01 && !REDUCE) camera.position.add(tmp.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(jolt));
  camera.lookAt(target);
  sunLight.position.copy(render[0]).addScaledVector(sunDir, 400);
  sunLight.target.position.copy(render[0]);
}

// ---------- first person ----------
// the camera rides on the dragon's neck, just behind the mane, looking where it's flying
const SEAT = 3;
let firstPerson = false;
const fpEye = new THREE.Vector3(), fpDir = new THREE.Vector3();
function firstPersonCamera(dt) {
  fpEye.copy(render[SEAT]).addScaledVector(NRM[SEAT], radius(SEAT) * 0.92 + 2.8);
  const yaw = D.yaw + cam.yaw * 0.6, pitch = D.pitch - 0.1;
  fpDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  camera.position.lerp(fpEye, 1 - Math.exp(-dt * 25));
  camera.fov += (74 + windAmt * 12 - camera.fov) * (1 - Math.exp(-dt * 3));
  camera.updateProjectionMatrix();
  camera.lookAt(tmp.copy(camera.position).addScaledVector(fpDir, 60));
}
// ---------- dragon fire ----------
// F breathes a fireball from the jaw. A hit topples a stone pillar in a blast of flame, smoke and
// rubble; the islands are sacred ground and shrug fireballs off in a shower of sparks.
let shake = 0, roar = 0, lastShot = -1;
const softTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.4, "rgba(255,255,255,0.6)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
// flame wisps: soft cores with ragged, noise-torn edges, a few variants so no two look alike
const wispTex = [0, 1, 2, 3].map((v) => {
  const N2 = 96, c = document.createElement("canvas");
  c.width = c.height = N2;
  const g = c.getContext("2d"), img = g.createImageData(N2, N2);
  for (let y = 0; y < N2; y++) for (let x = 0; x < N2; x++) {
    const dx = (x - N2 / 2) / (N2 / 2), dy = (y - N2 / 2) / (N2 / 2);
    const r = Math.hypot(dx, dy * 0.85 + 0.1);
    const n = noise(x * 0.09 + v * 13, y * 0.09 - v * 7) * 0.6 + noise(x * 0.2 + v * 5, y * 0.2) * 0.4;
    const a = Math.max(0, Math.min(1, (1 - r) * 1.6 - (1 - n) * 0.75));
    const i = (y * N2 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = a * a * 255;
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
});
function pool(n, additive) {
  return Array.from({ length: n }, (_, k) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: additive ? wispTex[k % 4] : softTex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.visible = false;
    scene.add(s);
    return { s, life: 0, max: 1, v: new THREE.Vector3(), size: 1, grow: 0, drag: 1, alpha: 1, rise: 0, ramp: false, grav: 0, spin: 0 };
  });
}
// fire cools as it ages: white-hot, yellow, orange, deep red, then nearly black
const RAMP = ["#fffbe6", "#ffe08a", "#ffab3a", "#f2611a", "#b02a0c", "#3a120a"].map((h) => new THREE.Color(h));
function rampColor(u, out) {
  const x = Math.min(0.999, u) * (RAMP.length - 1), i = Math.floor(x);
  return out.copy(RAMP[i]).lerp(RAMP[i + 1], x - i);
}
const flames = pool(900, true), smoke = pool(220, false);
let fi = 0, si = 0;
function puff(list, idx, pos, vel, size, life, color, o = {}) {
  const p = list[idx % list.length];
  p.s.position.copy(pos);
  p.v.copy(vel);
  p.size = size; p.life = p.max = life; p.grow = o.grow ?? 0; p.drag = o.drag ?? 1.5; p.alpha = o.alpha ?? 1; p.rise = o.rise ?? 0;
  // fire-coloured flames follow the cooling ramp (starting hotter for the brighter colours)
  const fi0 = FIRE_COLORS.indexOf(color);
  p.ramp = list === flames && (o.ramp ?? fi0 >= 0);
  p.ramp0 = fi0 >= 0 ? fi0 * 0.12 : 0;
  p.grav = o.grav ?? 0;
  p.spin = o.spin ?? rr(-1.5, 1.5);
  p.s.material.color.set(color);
  p.s.material.rotation = rand() * 6;
  p.s.visible = true;
}
const flame = (pos, vel, size, life, color, o) => puff(flames, fi++, pos, vel, size, life, color, o);
const fume = (pos, vel, size, life, color, o) => puff(smoke, si++, pos, vel, size, life, color, o);
const rndDir = () => tmp.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
// embers: small hot sparks that arc out, fall and wink out
function embers(pos, n, speed) {
  for (let k = 0; k < n; k++) flame(pos, rndDir().multiplyScalar(rr(speed * 0.3, speed)).add(tmp.set(0, rr(5, speed * 0.5), 0)), rr(0.5, 1.2), rr(0.8, 1.8), "#ffd060", { drag: 0.6, grav: 45, ramp: true });
}
const FIRE_COLORS = ["#fff2b0", "#ffd060", "#ff9a2a", "#ff5a14", "#e8350f"];

// rubble chunks, one shared pool
const DEBRIS = 520;
const debris = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), std("#8f7f70"), DEBRIS);
debris.frustumCulled = false;
const debrisData = Array.from({ length: DEBRIS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1 }));
let di = 0;
scene.add(debris);
function rubble(pos, spread, n, speed) {
  for (let k = 0; k < n; k++) {
    const d = debrisData[di++ % DEBRIS];
    d.p.copy(pos).add(rndDir().multiplyScalar(rr(0, spread)));
    d.v.copy(rndDir()).multiplyScalar(rr(speed * 0.3, speed)).add(tmp.set(0, rr(10, speed * 0.6), 0));
    d.w.set(rr(-5, 5), rr(-5, 5), rr(-5, 5));
    d.s = rr(1.5, 6.5);
    d.life = rr(3.5, 6);
  }
}
// a few flash lights to reuse
const flashes = Array.from({ length: 3 }, () => { const l = new THREE.PointLight("#ffab4a", 0, 520, 1.4); scene.add(l); return l; });
let li = 0;
function flashAt(pos, power) { const l = flashes[li++ % flashes.length]; l.position.copy(pos); l.intensity = power; }

const balls = [];
const ballGeo = new THREE.SphereGeometry(2.6, 32, 24);
// the fireball itself: churning noise flame, white-hot inside and red at the rim
const fireTime = { value: 0 };
const NOISE_GLSL = `
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }`;
// a translucent outer shell: tongues of flame torn by noise, licking back from the core
function fireShellMat(seed) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: fireTime, seed: { value: seed } },
    vertexShader: `uniform float time, seed; varying vec3 vP, vN, vV; ${NOISE_GLSL}
      void main(){
        float d = fbm(position * 0.7 + vec3(seed, -time * 6.0, seed * 0.5));
        vec3 p = position + normal * d * 2.2;
        vP = position; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float time, seed; varying vec3 vP, vN, vV; ${NOISE_GLSL}
      void main(){
        float n = fbm(vP * 1.1 + vec3(-seed, -time * 7.0, seed));
        float edge = pow(1.0 - abs(dot(vN, vV)), 1.2);
        float a = smoothstep(0.42, 0.78, n) * (0.35 + edge * 0.65);
        vec3 c = mix(vec3(0.9, 0.22, 0.03), vec3(1.0, 0.6, 0.15), n);
        gl_FragColor = vec4(c * a * 0.9, 1.0);
      }`,
  });
}
// the comet's tail: a tapering cone of noise-torn flame streaming back from the ball. t runs
// from 0 at the head to 1 at the tip; the colour runs white-yellow at the head, deep orange
// through the middle, crimson at the edges, fading to smoke at the tip
const TAIL_LEN = 30;
const tailGeo = (() => {
  const g = new THREE.CylinderGeometry(0.25, 1, TAIL_LEN, 28, 24, true);
  g.translate(0, TAIL_LEN / 2, 0); // head at the origin, tail along +y
  return g;
})();
function fireTailMat(seed, layer) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: fireTime, seed: { value: seed }, layer: { value: layer } },
    vertexShader: `uniform float time, seed, layer; varying float vT; varying vec3 vP, vN, vV; ${NOISE_GLSL}
      void main(){
        vT = position.y / ${TAIL_LEN.toFixed(1)};
        float n = fbm(vec3(position.x * 0.6, position.y * 0.18 - time * 9.0, position.z * 0.6) + seed);
        vec3 p = position + normal * (n - 0.4) * (0.6 + vT * 3.0);
        p.xz *= 1.0 + sin(vT * 9.0 - time * 14.0 + seed) * 0.12 * vT;
        vP = position; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float time, seed, layer; varying float vT; varying vec3 vP, vN, vV; ${NOISE_GLSL}
      void main(){
        float n = fbm(vec3(vP.x * 0.5, vP.y * 0.12 - time * 8.0, vP.z * 0.5) + seed * 1.7);
        float core = abs(dot(vN, vV));            // 1 facing you (the middle), 0 at the edges
        vec3 hot = vec3(1.0, 0.92, 0.66), deep = vec3(1.0, 0.36, 0.04), crimson = vec3(0.72, 0.08, 0.03), smoke = vec3(0.16, 0.08, 0.06);
        vec3 c = mix(hot, deep, smoothstep(0.0, 0.28, vT));
        c = mix(c, crimson, smoothstep(0.35, 0.85, vT) * (1.0 - core * 0.5));
        c = mix(c, deep * 0.8, core * smoothstep(0.1, 0.6, vT) * (1.0 - layer) * 0.6);
        c = mix(c, smoke, smoothstep(0.82, 1.0, vT));
        float a = pow(1.0 - vT, 1.3) * smoothstep(0.28, 0.72, n + (1.0 - vT) * 0.25) * (0.35 + core * 0.65);
        gl_FragColor = vec4(c * a * (layer > 0.5 ? 0.75 : 1.15), 1.0);
      }`,
  });
}
function fireballMat(seed) {
  return new THREE.ShaderMaterial({
    uniforms: { time: fireTime, seed: { value: seed } },
    vertexShader: `uniform float time, seed; varying vec3 vP, vN, vV; ${NOISE_GLSL}
      void main(){
        float d = fbm(position * 0.9 + vec3(seed, -time * 4.0, seed));
        vec3 p = position + normal * (d - 0.45) * 1.2;
        vP = position; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float time, seed; varying vec3 vP, vN, vV; ${NOISE_GLSL}
      void main(){
        float n = fbm(vP * 1.4 + vec3(seed, -time * 5.0, -seed));
        float rim = pow(1.0 - max(dot(vN, vV), 0.0), 1.4);
        float heat = clamp(1.05 - rim * 0.95 + (n - 0.5) * 0.7, 0.0, 1.0);
        vec3 c = mix(vec3(0.75, 0.12, 0.02), vec3(1.0, 0.62, 0.16), smoothstep(0.15, 0.6, heat));
        c = mix(c, vec3(1.0, 0.93, 0.7), smoothstep(0.82, 1.0, heat));
        gl_FragColor = vec4(c * 1.05, 1.0);
      }`,
  });
}
// a fireball; owner is null for yours, a friend's id for theirs (tinted their colour)
function spawnBall(pos, vel, owner = null, id = 0) {
  const g = new THREE.Group();
  const seed = Math.random() * 50;
  g.add(new THREE.Mesh(ballGeo, fireballMat(seed)));
  const tint = paletteFor(owner).glow;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: tint, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(13, 13, 1);
  g.add(glow, new THREE.PointLight(tint, 160, 140, 1.5));
  g.position.copy(pos);
  scene.add(g);
  const shell = new THREE.Mesh(ballGeo, fireShellMat(seed + 7));
  shell.scale.setScalar(1.55);
  g.add(shell);
  // the comet tail: a wide outer flame and a narrower deep-orange core, streaming behind
  const tail = new THREE.Group();
  const outer = new THREE.Mesh(tailGeo, fireTailMat(seed + 3, 1));
  outer.scale.set(3.2, 1, 3.2);
  const inner = new THREE.Mesh(tailGeo, fireTailMat(seed + 11, 0));
  inner.scale.set(1.9, 0.82, 1.9);
  tail.add(outer, inner);
  tail.quaternion.setFromUnitVectors(UP, tmp.copy(vel).normalize().negate());
  g.add(tail);
  balls.push({ g, v: vel, life: 3.2, owner, id, shell, tail, light: g.children[2], last: pos.clone() });
  for (let k = 0; k < 14; k++) flame(pos, rndDir().multiplyScalar(rr(5, 25)), rr(3, 6), rr(0.25, 0.5), FIRE_COLORS[k % 5], { grow: 1.5 });
}
function removeBall(i) {
  const f = balls[i];
  scene.remove(f.g); f.g.children[0].material.dispose(); f.g.children[1].material.dispose(); f.shell.material.dispose();
  for (const m of f.tail.children) m.material.dispose();
  balls.splice(i, 1);
}
// the crosshair sits above the dragon; fireballs fly to whatever it is over
const CROSS_Y = 0.22; // in normalised screen units, 0 = middle
const aimRay = new THREE.Raycaster();
aimRay.far = 2600;
function aimPoint(targets) {
  aimRay.setFromCamera(new THREE.Vector2(0, firstPerson ? 0 : CROSS_Y), camera);
  const hit = aimRay.intersectObjects(targets, false)[0];
  return { point: hit ? hit.point : aimRay.ray.at(1800, new THREE.Vector3()), hit };
}
function shoot() {
  const now = clock.elapsedTime;
  if (!started || panelOpen || MP.dead || now - lastShot < 0.32) return;
  lastShot = now;
  head.updateMatrixWorld();
  const mouth = new THREE.Vector3(0, -0.5, 6.4).applyMatrix4(head.matrixWorld);
  const targets = [...PILLARS.filter((c) => c.alive).map((c) => c.mesh), ...[...MP.peers.values()].filter((f) => !f.dead && f.ready).map((f) => f.tube)];
  const dir = aimPoint(targets).point.sub(mouth).normalize();
  const vel = dir.multiplyScalar(380 + Math.max(0, D.speed));
  const id = ++MP.seq;
  spawnBall(mouth, vel.clone(), null, id);
  const r = (v) => Math.round(v * 10) / 10;
  if (MP.on) MP.net?.send({ t: "f", b: id, p: [r(mouth.x), r(mouth.y), r(mouth.z)], v: [r(vel.x), r(vel.y), r(vel.z)] });
  roar = 1;
  Sound.fire();
}
// a hot ring that races outward from a big blast
const rings = [];
function shockwave(pos, size) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ map: softTex, color: "#ffb35a", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(pos);
  m.lookAt(camera.position);
  scene.add(m);
  rings.push({ m, t: 0, size });
}
function blast(pos, pillar) {
  shockwave(pos, 90);
  // a rising mushroom of fire: big slow flames that climb as they cool
  for (let k = 0; k < 26; k++) flame(pos.clone().add(rndDir().multiplyScalar(rr(0, 10))), tmp.set(rr(-15, 15), rr(25, 70), rr(-15, 15)), rr(14, 28), rr(1, 1.8), FIRE_COLORS[k % 3], { grow: 1.6, drag: 1.2 });
  const near = THREE.MathUtils.clamp(1 - pos.distanceTo(camera.position) / 900, 0, 1);
  Sound.boom(near * 0.6);
  Sound.rockHit(near, true);
  shake = Math.max(shake, 0.6 + near * 2.6);
  flashAt(pos, 9000);
  flame(pos, tmp.set(0, 0, 0), 70, 0.35, "#fff6d0", { grow: 0.8 });
  for (let k = 0; k < 70; k++) flame(pos, rndDir().multiplyScalar(rr(30, 140)), rr(8, 22), rr(0.5, 1.3), FIRE_COLORS[k % 5], { grow: 1.2, drag: 2.2 });
  for (let k = 0; k < 28; k++) fume(pos.clone().add(rndDir().multiplyScalar(rr(0, 12))), rndDir().multiplyScalar(rr(8, 35)), rr(20, 40), rr(2.5, 4.5), k % 2 ? "#5e4c49" : "#7a6660", { grow: 2.2, alpha: 0.55, rise: 6 });
  rubble(pos, pillar.r * 0.6, 70, 120);
  embers(pos, 60, 120);
  topple(pillar, pos);
}
// a hit that doesn't finish the pillar: a smaller blast, a shudder and a scorch mark left behind
const scorchMat = new THREE.SpriteMaterial({ map: softTex, color: "#1d1512", transparent: true, opacity: 0.75, depthWrite: false });
function chip(pos, c) {
  const near = THREE.MathUtils.clamp(1 - pos.distanceTo(camera.position) / 900, 0, 1);
  Sound.boom(near * 0.3);
  Sound.rockHit(near, false);
  shake = Math.max(shake, 0.3 + near * 1.2);
  flashAt(pos, 4500);
  for (let k = 0; k < 34; k++) flame(pos, rndDir().multiplyScalar(rr(20, 90)), rr(6, 14), rr(0.4, 0.9), FIRE_COLORS[k % 5], { grow: 1.1, drag: 2.4 });
  for (let k = 0; k < 10; k++) fume(pos, rndDir().multiplyScalar(rr(6, 20)), rr(14, 26), rr(2, 3.5), "#5e4c49", { grow: 2, alpha: 0.5, rise: 5 });
  rubble(pos, 6, 26, 80);
  embers(pos, 30, 90);
  shockwave(pos, 45);
  c.wobble = 1;
  const mark = new THREE.Sprite(scorchMat);
  const s = 14 + (c.maxHp - c.hp) * 6;
  mark.scale.set(s, s, 1);
  c.mesh.worldToLocal(mark.position.copy(pos));
  c.mesh.add(mark);
  flash(`cracked · ${c.hp} more hit${c.hp === 1 ? "" : "s"} to bring it down`);
}
function fizzle(pos) {
  Sound.fizzle();
  flashAt(pos, 1800);
  for (let k = 0; k < 22; k++) flame(pos, rndDir().multiplyScalar(rr(20, 70)), rr(1.5, 3.5), rr(0.3, 0.7), k % 2 ? "#ffe08a" : "#ffb347", { drag: 3 });
  for (let k = 0; k < 4; k++) fume(pos, rndDir().multiplyScalar(rr(4, 12)), rr(8, 14), rr(1.2, 2), "#d9cfc4", { grow: 1.5, alpha: 0.4, rise: 4 });
}
// a struck pillar tips away from the blast, sinking as it falls, shedding rubble the whole way
const falling = [];
function topple(c, hit) {
  c.alive = false;
  const away = tmp.set(c.x - hit.x, 0, c.z - hit.z);
  if (away.lengthSq() < 1e-3) away.set(1, 0, 0);
  away.normalize();
  falling.push({ c, axis: new THREE.Vector3().crossVectors(UP, away).normalize(), w: rr(0.04, 0.09), t: 0, hitY: hit.y });
  Sound.rumble(THREE.MathUtils.clamp(1 - hit.distanceTo(camera.position) / 900, 0, 1));
}
function updateFire(dt) {
  for (let k = rings.length - 1; k >= 0; k--) {
    const r = rings[k];
    r.t += dt;
    const u = r.t / 0.7;
    r.m.scale.setScalar(4 + u * r.size);
    r.m.material.opacity = 0.8 * (1 - u);
    if (u >= 1) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(k, 1); }
  }
  shake *= Math.exp(-dt * 3.5);
  roar *= Math.exp(-dt * 2.5);
  for (const l of flashes) l.intensity *= Math.exp(-dt * 9);
  // fireballs
  for (let b = balls.length - 1; b >= 0; b--) {
    const f = balls[b], p = f.g.position;
    p.addScaledVector(f.v, dt);
    f.life -= dt;
    f.g.children[1].material.rotation += dt * 6;
    // a licking trail laid down by distance travelled, so it stays unbroken at any frame rate:
    // hot wisps that cool and curl upward, a dark smoke wake, and sparks
    const step = f.last.distanceTo(p), n = Math.min(24, Math.ceil(step / 1.3));
    f.tail.quaternion.setFromUnitVectors(UP, tmp.copy(f.v).normalize().negate());
    for (let k = 0; k < n; k++) {
      const at = new THREE.Vector3().copy(f.last).lerp(p, (k + rand()) / n).add(rndDir().multiplyScalar(rr(0, 2)));
      flame(at, rndDir().multiplyScalar(rr(2, 7)).addScaledVector(f.v, -0.06), rr(2.5, 6), rr(0.4, 0.95), FIRE_COLORS[(k % 4) + (k % 2)], { grow: 1.2 });
      if (k % 4 === 0) fume(at, tmp.set(rr(-3, 3), rr(3, 7), rr(-3, 3)), rr(5, 9), rr(1.2, 2), "#4a3a36", { grow: 1.8, alpha: 0.3, rise: 4 });
    }
    f.last.copy(p);
    if (rand() < 0.5) embers(p, 1, 25);
    f.shell.rotation.y += dt * 3;
    f.light.intensity = 140 + Math.sin(clock.elapsedTime * 47 + b) * 30 + rand() * 30;
    let done = f.life <= 0;
    // dragons: a friend's fireball on you is decided here; anything else is just the splash,
    // the dragon that was struck reports the damage itself
    if (!done && f.owner && f.owner !== MP.me && !MP.dead) {
      for (let i = 0; i < N; i += 3) if (p.distanceTo(render[i]) < radius(i) * 1.3 + 3) { hitMe(f); done = true; break; }
    }
    if (!done) for (const fr of MP.peers.values()) {
      if (fr.id === f.owner || !fr.touches(p, 3)) continue;
      impact(p.clone(), f.owner ? paletteFor(f.owner).glow : "#ff8a2a");
      done = true;
      break;
    }
    for (const c of PILLARS) {
      if (done) break;
      if (!c.alive || p.y < c.base || p.y > c.base + c.h + 4) continue;
      if (Math.hypot(p.x - c.x, p.z - c.z) < c.r) {
        // every fireball does the same damage; the last one brings it down
        c.hp -= 1;
        if (c.hp <= 0) blast(p.clone(), c); else chip(p.clone(), c);
        done = true;
      }
    }
    for (const m of MASSIFS) {
      if (done || Math.hypot(p.x - m.x, p.z - m.z) > m.R * 1.2) continue;
      if (m.parts.some((c) => p.y < c.top && Math.hypot(p.x - c.x, p.z - c.z) < c.r)) { fizzle(p.clone()); done = true; }
    }
    for (const isle of ISLES) {
      if (done || !isle.root) break;
      const q = isle.root.position, d = Math.hypot(p.x - q.x, p.z - q.z), top = q.y + 3;
      // the ground and rock underneath, or the building: fireballs flying over the grass pass on by
      const ground = d < isle.r * 1.02 && p.y < top && p.y > top - isle.r * 1.4 * (1 - d / isle.r);
      const hall = Math.hypot(p.x - isle.center.x, p.z - isle.center.z) < isle.br && p.y > top - 2 && p.y < top + isle.bh;
      if (ground || hall) { fizzle(p.clone()); done = true; }
    }
    if (p.y < -170) { fume(p, tmp.set(0, 6, 0), 18, 2, "#e8d8d0", { grow: 1.5, alpha: 0.5 }); done = true; }
    if (done) removeBall(b);
  }
  // struck pillars shudder
  for (const c of PILLARS) {
    if (!c.alive || c.wobble <= 0.001) continue;
    c.wobble *= Math.exp(-dt * 3);
    c.mesh.rotation.x = Math.sin(clock.elapsedTime * 38) * 0.012 * c.wobble;
    c.mesh.rotation.z = Math.cos(clock.elapsedTime * 33) * 0.012 * c.wobble;
  }
  // toppling pillars
  for (let k = falling.length - 1; k >= 0; k--) {
    const f = falling[k], m = f.c.mesh;
    f.t += dt;
    f.w += dt * 0.32;
    m.rotateOnWorldAxis(f.axis, f.w * dt);
    m.position.y -= f.t * f.t * 9 * dt;
    if (rand() < 0.5) {
      const y = f.c.base + f.c.h * rand() * 0.9;
      rubble(tmp.set(f.c.x, Math.min(y, f.hitY), f.c.z), f.c.r * 0.7, 1, 40);
    }
    if (rand() < 0.25) fume(new THREE.Vector3(f.c.x + rr(-1, 1) * f.c.r, -150, f.c.z + rr(-1, 1) * f.c.r), tmp.set(rr(-6, 6), rr(6, 14), rr(-6, 6)), rr(30, 55), rr(3, 5), "#e9d9cf", { grow: 1.6, alpha: 0.6 });
    if (f.t > 7) { scene.remove(m); m.geometry.dispose(); falling.splice(k, 1); }
  }
  // particles
  for (const list of [flames, smoke]) for (const p of list) {
    if (!p.s.visible) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; continue; }
    const u = 1 - p.life / p.max;
    p.v.y -= p.grav * dt;
    p.s.position.addScaledVector(p.v, dt);
    p.s.position.y += p.rise * dt;
    p.v.multiplyScalar(Math.exp(-dt * p.drag));
    const sc = p.size * (1 + p.grow * u);
    p.s.scale.set(sc, sc * (p.ramp ? 1.25 : 1), 1);
    p.s.material.rotation += p.spin * dt;
    if (p.ramp) {
      rampColor(Math.min(1, p.ramp0 + u * 1.05), p.s.material.color);
      // hot flames rise as they cool
      p.s.position.y += 9 * u * dt;
    }
    p.s.material.opacity = p.alpha * (1 - u) * (u < 0.08 ? u * 12.5 : 1);
  }
  const q = new THREE.Quaternion();
  debrisData.forEach((d, k) => {
    if (d.life > 0) {
      d.life -= dt;
      d.v.y -= 60 * dt;
      d.v.multiplyScalar(Math.exp(-dt * 0.3));
      d.p.addScaledVector(d.v, dt);
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      if (d.p.y < -175) d.life = 0;
    }
    const sc = d.life > 0 ? d.s * Math.min(1, d.life) : 0;
    m4.compose(d.p, q.setFromEuler(d.r), tmp.set(sc, sc * 0.8, sc));
    debris.setMatrixAt(k, m4);
  });
  debris.instanceMatrix.needsUpdate = true;
}

// ---------- multiplayer battles ----------
// Friends join a room by code and fly together; fireballs are shared and knock dragons out of
// the sky. Each player is the authority on their own dragon: it reports its own position, decides
// when a friend's fireball has hit it, and announces its own defeat. The relay only forwards.
const params = new URLSearchParams(location.search);
// a deployed relay can be set here (wss://...) or passed as ?server=
const MP_SERVER = location.hostname === "localhost" || location.hostname === "127.0.0.1" || /^192\.168\.|^10\./.test(location.hostname)
  ? "" // local development uses the Node relay on :8787
  : "wss://dragon-isles-relay.dragon-isles-relay-worker.workers.dev";
const relayUrl = () => params.get("server") || MP_SERVER || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname || "localhost"}:8787`;
const MAX_HP = 100, HIT_DMG = 20, RESPAWN_S = 3, SHIELD_S = 2.5;
const MP = { net: null, on: false, me: null, name: "", room: "", peers: new Map(), score: new Map(), hp: MAX_HP, dead: false, shield: 0, respawn: 0, seq: 0, sendT: 0 };
// a dragon's colours: a friend's chosen skin, or yours
const paletteFor = (id) => (id && MP.peers.get(id)?.pal) || SKINS[mySkin];

// a friend's dragon: the same body plan as yours, in their colours, with a name tag and health
class FriendDragon {
  constructor(id) {
    this.id = id; this.name = "joining…"; this.named = false; this.hp = MAX_HP; this.dead = false; this.buf = []; this.ready = false;
    this.pal = SKINS.fire;
    this.skinKey = null;
    this.pts = Array.from({ length: N }, () => new THREE.Vector3());
    const pos = new Float32Array(N * RS * 3), col = new Float32Array(N * RS * 3), idx = [];
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < RS; j++) { const a0 = i * RS + j, a1 = i * RS + ((j + 1) % RS), b0 = a0 + RS, b1 = a1 + RS; idx.push(a0, a1, b0, a1, b1, b0); }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.geo.setIndex(idx);
    this.tube = new THREE.Mesh(this.geo, bodyMat);
    this.tube.castShadow = true;
    this.tube.userData.friend = this;
    // the head is a copy of yours with its own skin materials, so it can wear their element
    this.head = head.clone(true);
    const hm = head.userData.mats;
    this.mats = { skin: hm.skin.clone(), skinDark: hm.skinDark.clone(), gold: hm.gold.clone() };
    this.head.traverse((o) => { if (!o.isMesh) return; for (const k of ["skin", "skinDark", "gold"]) if (o.material === hm[k]) o.material = this.mats[k]; });
    const c = document.createElement("canvas");
    c.width = 256; c.height = 72;
    this.tagCtx = c.getContext("2d");
    this.tagTex = new THREE.CanvasTexture(c);
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    // a constant on-screen size, drawn over scenery, so a friend's name stays readable at any range
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex, depthWrite: false, depthTest: false, fog: false, sizeAttenuation: false, transparent: true }));
    this.tag.scale.set(0.16, 0.045, 1);
    this.tag.renderOrder = 10;
    this.group = new THREE.Group();
    this.group.add(this.tube, this.head, this.tag);
    this.group.visible = false;
    scene.add(this.group);
    this.setSkin("fire");
  }
  setSkin(k) {
    if (!SKINS[k] || k === this.skinKey) return;
    this.skinKey = k;
    const sk = (this.pal = SKINS[k]);
    paintTube(this.geo, sk);
    this.mats.skin.color.set(sk.main); this.mats.skinDark.color.set(sk.dark); this.mats.gold.color.set(sk.fin);
    this.drawTag();
    if (MP.peers.has(this.id)) renderScore();
  }
  drawTag() {
    const g = this.tagCtx;
    g.clearRect(0, 0, 256, 72);
    g.fillStyle = "rgba(20,12,18,0.6)";
    g.beginPath(); g.roundRect(4, 4, 248, 64, 12); g.fill();
    g.fillStyle = this.pal.glow; g.font = "600 28px 'Cormorant Garamond', Georgia, serif"; g.textAlign = "center";
    g.fillText(this.name.slice(0, 16), 128, 34);
    g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(28, 46, 200, 10);
    g.fillStyle = this.hp > 40 ? "#6fe39a" : this.hp > 20 ? "#ffcf4a" : "#ff5a3a";
    g.fillRect(28, 46, 200 * Math.max(0, this.hp) / MAX_HP, 10);
    this.tagTex.needsUpdate = true;
  }
  push(m) {
    if (m.k) this.setSkin(m.k);
    if (m.n && m.n !== this.name) {
      this.name = String(m.n).slice(0, 16);
      // announce them by name the first time it arrives
      if (!this.named) { this.named = true; feed(`${this.name} joined the sky`); }
      this.drawTag();
      renderScore();
    }
    if (m.hp !== undefined && m.hp !== this.hp) { this.hp = m.hp; this.drawTag(); }
    this.dead = !!m.d;
    this.buf.push({ t: performance.now(), p: new THREE.Vector3(...m.p), yaw: m.y, pitch: m.q });
    if (this.buf.length > 30) this.buf.shift();
  }
  update(dt, t) {
    if (!this.buf.length) return;
    // play back 120 ms behind real time, between the two states that bracket it
    const rt = performance.now() - 120;
    let a = this.buf[0], b = this.buf[this.buf.length - 1];
    for (let i = 0; i < this.buf.length - 1; i++) if (this.buf[i].t <= rt && this.buf[i + 1].t >= rt) { a = this.buf[i]; b = this.buf[i + 1]; break; }
    const k = b.t > a.t ? THREE.MathUtils.clamp((rt - a.t) / (b.t - a.t), 0, 1) : 1;
    const p = a.p.clone().lerp(b.p, k);
    let dy = b.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yaw = a.yaw + dy * k, pitch = a.pitch + (b.pitch - a.pitch) * k;
    if (!this.ready) { this.pts.forEach((q, i) => q.copy(p).add(tmp.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(i * SP))); this.ready = true; }
    this.pts[0].copy(p);
    for (let i = 1; i < N; i++) {
      tmp.subVectors(this.pts[i], this.pts[i - 1]);
      const l = tmp.length();
      if (l > SP) this.pts[i].copy(this.pts[i - 1]).addScaledVector(tmp, SP / l);
    }
    // the same bend limit as yours so friends don't fold up either
    for (let i = 2; i < N; i++) {
      d1.subVectors(this.pts[i - 1], this.pts[i - 2]).normalize();
      d2.subVectors(this.pts[i], this.pts[i - 1]);
      const len = d2.length() || SP;
      d2.divideScalar(len);
      if (Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1)) > MAX_BEND) {
        axis.crossVectors(d1, d2); if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0).cross(d1); axis.normalize();
        this.pts[i].copy(this.pts[i - 1]).addScaledVector(d2.copy(d1).applyAxisAngle(axis, MAX_BEND), len);
      }
    }
    const tp = this.geo.attributes.position, tan = new THREE.Vector3(), bin = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      tan.subVectors(this.pts[Math.max(0, i - 1)], this.pts[Math.min(N - 1, i + 1)]).normalize();
      bin.crossVectors(tan, UP).normalize();
      nrm.crossVectors(bin, tan);
      const r = radius(i), wave = Math.sin(t * 2.6 - i * 0.3) * 0.6 * (i / N);
      for (let j = 0; j < RS; j++) {
        const an = (j / RS) * Math.PI * 2, x = Math.cos(an) * r, y = Math.sin(an) * r * 0.92 + wave;
        tp.setXYZ(i * RS + j, this.pts[i].x + bin.x * x + nrm.x * y, this.pts[i].y + bin.y * x + nrm.y * y, this.pts[i].z + bin.z * x + nrm.z * y);
      }
    }
    tp.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.head.position.copy(p);
    this.head.lookAt(tmp.copy(p).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))));
    this.tag.position.copy(p).add(tmp.set(0, 12, 0));
    this.group.visible = !this.dead;
  }
  // does a point touch this dragon? checks the head and every third body ring
  touches(p, pad) {
    if (this.dead || !this.ready) return false;
    for (let i = 0; i < N; i += 3) if (p.distanceTo(this.pts[i]) < radius(i) * 1.3 + pad) return true;
    return false;
  }
  dispose() { scene.remove(this.group); this.geo.dispose(); this.tagTex.dispose(); }
}

function peer(id) {
  if (!MP.peers.has(id)) { MP.peers.set(id, new FriendDragon(id)); if (!MP.score.has(id)) MP.score.set(id, { k: 0, d: 0 }); }
  return MP.peers.get(id);
}
function nameOf(id) { return id === MP.me ? "you" : MP.peers.get(id)?.name || "a dragon"; }

// One sky for everyone: whoever starts flying joins the same shared room (spilling quietly into
// sky-2, sky-3 only if one ever fills up). There are no private rooms or invite links.
const randomName = () => `dragon-${Math.floor(1000 + Math.random() * 9000)}`;
function savedName() { try { return localStorage.getItem("eddie-isles-name") || ""; } catch (e) { return ""; } }
function joinBattle(name, shard = 1) {
  MP.name = name.trim().slice(0, 16) || randomName();
  MP.public = true;
  MP.room = shard > 1 ? `sky-${shard}` : "sky";
  try { localStorage.setItem("eddie-isles-name", MP.name); } catch (e) {}
  params.delete("room"); // old invite links just land in the one sky
  const qs = params.toString();
  history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
  MP.net?.close();
  for (const f of MP.peers.values()) f.dispose();
  MP.peers.clear();
  MP.on = true;
  document.body.classList.add("mp");
  MP.score = new Map([["me", { k: 0, d: 0 }]]);
  MP.net = connect({
    url: relayUrl(), room: MP.room,
    onStatus: (s) => {
      if (s === "full") { joinBattle(MP.name, shard + 1); return; }
      $("#battle-status").textContent = s === "online" ? "online" : s === "full" ? "room full" : s === "connecting" ? "connecting…" : "offline, retrying…";
      $("#battle").classList.toggle("live", s === "online");
      $("#room-chip").classList.toggle("live", s === "online");
    },
    onMessage,
  });
  renderScore();
}
function onMessage(m) {
  if (m.t === "welcome") { MP.me = m.id; for (const id of m.peers) peer(id); renderScore(); return; }
  if (m.t === "join") { peer(m.id); renderScore(); return; }
  if (m.t === "leave") { const f = MP.peers.get(m.id); if (f) { feed(`${f.name} left`); f.dispose(); MP.peers.delete(m.id); } renderScore(); return; }
  const f = m.id && peer(m.id);
  if (m.t === "s") { f.push(m); return; }
  if (m.t === "c") return; // chat was retired; older pages may still send it
  if (m.t === "f") { spawnBall(new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), m.id, m.b); return; }
  if (m.t === "h") {
    // a dragon says it was hit by someone's fireball: clear that ball and show the impact
    const i = balls.findIndex((b) => b.owner === m.by && b.id === m.b);
    if (i >= 0) removeBall(i);
    f.hp = m.hp; f.drawTag();
    if (f.ready) impact(f.pts[0].clone(), paletteFor(m.by).glow);
    return;
  }
  if (m.t === "k") {
    const killer = m.by === MP.me ? "me" : m.by;
    (MP.score.get(killer) || MP.score.set(killer, { k: 0, d: 0 }).get(killer)).k++;
    MP.score.get(m.id).d++;
    if (f.ready) { const p = f.pts[0].clone(); shootDown(p); }
    f.dead = true;
    feed(`${nameOf(m.by)} shot down ${f.name}`, m.by === MP.me);
    if (m.by === MP.me) flash(`you shot down ${f.name}`);
    renderScore();
  }
}
function sendState(dt) {
  if (!MP.on || !MP.net) return;
  MP.sendT -= dt;
  if (MP.sendT > 0) return;
  MP.sendT = 1 / 15;
  const r = (v) => Math.round(v * 10) / 10;
  MP.net.send({ t: "s", p: [r(D.pos.x), r(D.pos.y), r(D.pos.z)], y: r(D.yaw * 100) / 100, q: r(D.pitch * 100) / 100, hp: MP.hp, n: MP.name, k: mySkin, d: MP.dead ? 1 : 0 });
}

// effects for being struck and being shot down
function impact(pos, color) {
  flashAt(pos, 3500);
  for (let k = 0; k < 26; k++) flame(pos, rndDir().multiplyScalar(rr(20, 80)), rr(4, 10), rr(0.3, 0.7), k % 2 ? color : FIRE_COLORS[k % 5], { grow: 1, drag: 2.5 });
  Sound.boom(THREE.MathUtils.clamp(1 - pos.distanceTo(camera.position) / 900, 0, 1) * 0.5);
}
function shootDown(pos) {
  const near = THREE.MathUtils.clamp(1 - pos.distanceTo(camera.position) / 900, 0, 1);
  Sound.boom(near);
  flashAt(pos, 9000);
  for (let k = 0; k < 80; k++) flame(pos, rndDir().multiplyScalar(rr(30, 150)), rr(8, 22), rr(0.5, 1.4), FIRE_COLORS[k % 5], { grow: 1.2, drag: 2.2 });
  for (let k = 0; k < 24; k++) fume(pos, rndDir().multiplyScalar(rr(8, 35)), rr(18, 36), rr(2.5, 4), "#4a3c3a", { grow: 2.2, alpha: 0.55, rise: 6 });
  rubble(pos, 6, 30, 90);
  shake = Math.max(shake, 0.5 + near * 2.5);
}
// a friend's fireball reached your dragon
function hitMe(ball) {
  if (MP.dead || MP.shield > 0) return;
  MP.hp = Math.max(0, MP.hp - HIT_DMG);
  MP.net?.send({ t: "h", b: ball.id, by: ball.owner, hp: MP.hp });
  impact(render[0].clone(), paletteFor(ball.owner).glow);
  shake = Math.max(shake, 1.6);
  paintHp();
  if (MP.hp <= 0) {
    MP.dead = true;
    MP.respawn = RESPAWN_S;
    MP.score.get("me").d++;
    (MP.score.get(ball.owner) || MP.score.set(ball.owner, { k: 0, d: 0 }).get(ball.owner)).k++;
    feed(`${nameOf(ball.owner)} shot you down`);
    MP.net?.send({ t: "k", by: ball.owner });
    shootDown(render[0].clone());
    setDragonVisible(false);
    $("#downed").hidden = false;
    $("#downed b").textContent = nameOf(ball.owner);
    renderScore();
  }
}
function setDragonVisible(v) { dragon.visible = v; pearl.visible = v; for (const w of whiskers) w.m.visible = v; shed.visible = v; }
function updateBattle(dt, t) {
  for (const f of MP.peers.values()) f.update(dt, t);
  if (!MP.on) return;
  if (MP.dead) {
    MP.respawn -= dt;
    $("#downed i").textContent = Math.max(0, Math.ceil(MP.respawn));
    if (MP.respawn <= 0) {
      // back in the sky above a random island with a short shield
      const isle = ISLES[Math.floor(Math.random() * ISLES.length)], q = isle.root ? isle.root.position : new THREE.Vector3(...isle.pos);
      D.pos.set(q.x + rr(-60, 60), q.y + 120, q.z + rr(-60, 60));
      D.speed = 0; D.vy = 0;
      segs.forEach((s, i) => s.p.copy(D.pos).add(tmp.set(0, 0, -i * SP)));
      MP.dead = false; MP.hp = MAX_HP; MP.shield = SHIELD_S;
      $("#downed").hidden = true;
      setDragonVisible(true);
      paintHp();
    }
  }
  if (MP.shield > 0) { MP.shield -= dt; dragon.visible = MP.shield <= 0 || Math.sin(t * 30) > 0; }
  sendState(dt);
}

// HUD
function paintHp() {
  const bar = $("#hpbar i");
  bar.style.width = `${(MP.hp / MAX_HP) * 100}%`;
  bar.style.background = MP.hp > 40 ? "#6fe39a" : MP.hp > 20 ? "#ffcf4a" : "#ff5a3a";
  $("#hpbar span").textContent = `${MP.hp}`;
}
function renderScore() {
  // the battle bits (health bar) only appear once someone else is flying
  document.body.classList.toggle("battle", MP.on && MP.peers.size > 0);
  const rows = [["me", MP.name || "you", SKINS[mySkin]], ...[...MP.peers.values()].map((f) => [f.id, f.name, f.pal])];
  $("#battle-count").textContent = `${rows.length} dragon${rows.length === 1 ? "" : "s"}`;
  $("#room-chip").hidden = !MP.on;
  $("#room-chip b").textContent = rows.length;
  const list = $("#score");
  list.innerHTML = "";
  rows.map(([id, name, pal]) => ({ id, name, pal, s: MP.score.get(id) || { k: 0, d: 0 } }))
    .sort((a, b) => b.s.k - a.s.k || a.s.d - b.s.d)
    .forEach((r) => {
      const li = document.createElement("li");
      li.innerHTML = `<i style="background:${r.pal.main}"></i><span></span><b>${r.s.k}</b><em>${r.s.d}</em>`;
      li.querySelector("span").textContent = r.id === "me" ? `${r.name} (you)` : r.name;
      if (r.id === "me") li.classList.add("me");
      list.appendChild(li);
    });
}
function feed(text, mine) {
  const li = document.createElement("li");
  li.textContent = text;
  if (mine) li.className = "mine";
  $("#feed").prepend(li);
  setTimeout(() => li.remove(), 6000);
}

// pressing Begin joins the one shared sky under a dragon-#### name (kept between visits); the
// online chip toggles the who's-flying board, and holding Tab shows it while held
$("#room-chip").addEventListener("click", () => document.body.classList.toggle("board"));

// the crosshair turns red while it's over a friend's dragon
const cross = $("#crosshair");
function updateCrosshair() {
  cross.hidden = !started || panelOpen || MP.dead;
  if (cross.hidden || !MP.peers.size) { cross.classList.remove("lock"); return; }
  const live = [...MP.peers.values()].filter((f) => !f.dead && f.ready).map((f) => f.tube);
  cross.classList.toggle("lock", !!(live.length && aimPoint(live).hit));
}

// V or the settings button switches between the camera behind the dragon and a seat on its neck
const viewBtn = $("#view-btn");
function setFirstPerson(on) {
  firstPerson = on;
  document.body.classList.toggle("fp", on);
  viewBtn.setAttribute("aria-pressed", String(on));
  viewBtn.textContent = on ? "first person on" : "first person off";
  flash(on ? "first person · V to switch back" : "third person");
}
viewBtn.addEventListener("click", () => setFirstPerson(!firstPerson));

// ---------- input ----------
// some keyboards, remote desktops and input methods report no physical key code: fall back to the key
const KEY_CODES = { w: "KeyW", a: "KeyA", s: "KeyS", d: "KeyD", c: "KeyC", q: "KeyQ", e: "KeyE", f: "KeyF", v: "KeyV", " ": "Space", shift: "ShiftLeft" };
const codeOf = (e) => (e.code && e.code !== "Unidentified" ? e.code : KEY_CODES[(e.key || "").toLowerCase()] || e.key);
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input,textarea")) return;
  const code = codeOf(e);
  if (code === "Escape" && panelOpen) return closePanel();
  if (!started || panelOpen) return;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) e.preventDefault();
  if (code === "KeyE" || code === "Enter") { if (near) openPanel(near); return; }
  if (code === "KeyF") { shoot(); return; }
  if (code === "KeyV") { setFirstPerson(!firstPerson); return; }
  // Cmd/Ctrl combos are shortcuts, not flying (and a Mac never sends the key-up for them)
  if (e.metaKey || e.ctrlKey) return;
  keys.add(code);
});
addEventListener("keyup", (e) => {
  keys.delete(codeOf(e));
  // while Cmd is down a Mac swallows every other key-up, so letting go of it lets go of everything
  if (e.key === "Meta") keys.clear();
});
// ?keys shows what the browser reports for each key press, for tracking down keyboard trouble
if (new URLSearchParams(location.search).has("keys")) {
  const box = document.createElement("pre");
  box.style.cssText = "position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:60;margin:0;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,0.75);color:#9ff;font:12px/1.5 ui-monospace,monospace;pointer-events:none";
  // visible straight away, so "no box" means an old cached page and "no lines" means the key never arrived
  box.textContent = "key readout ready: press any key";
  document.body.appendChild(box);
  const log = [];
  const show = (type, e) => {
    log.unshift(`${type.padEnd(7)} key="${e.key}" code="${e.code}" composing=${e.isComposing} target=${e.target.tagName.toLowerCase()}`);
    log.length = 6;
    box.textContent = `${log.join("\n")}\nheld: ${[...keys].join(" ") || "(none)"}`;
  };
  addEventListener("keydown", (e) => show("down", e), true);
  addEventListener("keyup", (e) => show("up", e), true);
  addEventListener("blur", () => { log.unshift("window lost focus"); log.length = 6; box.textContent = log.join("\n"); });
}
// a held key whose key-up lands somewhere else (another app, the right-click menu, a hidden
// tab) would keep the dragon turning or flying on its own: drop everything held instead
addEventListener("blur", () => keys.clear());
addEventListener("contextmenu", () => keys.clear());
document.addEventListener("visibilitychange", () => { if (document.hidden) keys.clear(); });

let down = null;
canvas.addEventListener("pointerdown", (e) => { if (document.pointerLockElement) return; down = { x: e.clientX, y: e.clientY, t: performance.now() }; cam.drag = true; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
canvas.addEventListener("pointermove", (e) => {
  if (!down || document.pointerLockElement) return;
  if (TEA.active) return;
  cam.yaw -= e.movementX * 0.005;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * 0.004, -0.25, 1.2);
});
canvas.addEventListener("pointerup", (e) => {
  cam.drag = false;
  // a quick click (not a drag): with a mouse, a left click breathes fire at the crosshair unless
  // it lands on a temple or beacon close enough to open; taps and other buttons just pick
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 350) {
    const mouse = e.pointerType === "mouse" && e.button === 0;
    if (!pick(e, mouse) && mouse && started && !panelOpen && !TEA.active && !mouseMode()) shoot();
  }
  down = null;
});
canvas.addEventListener("wheel", (e) => { if (TEA.active) return; cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.001), 45, 240); }, { passive: true });

const ray = new THREE.Raycaster();
// returns true when the click opened an island; quiet skips the "fly over it" note (that click fires instead)
function pick(e, quiet = false) {
  if (!started || panelOpen) return false;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  // a label, a beacon or a temple opens that island's scroll straight away
  const hit = ray.intersectObjects(clickables, true)[0];
  if (!hit) return false;
  let o = hit.object;
  while (o && !o.userData.isle) o = o.parent;
  if (!o) return false;
  // only from over the island itself, not from across the sky
  const isle = o.userData.isle, q = isle.root.position;
  if (Math.hypot(D.pos.x - q.x, D.pos.z - q.z) > isle.r * 1.45) { if (!quiet) flash(`fly over ${isle.en.toLowerCase()} to open it`); return false; }
  openPanel(isle);
  return true;
}
function flyTo(isle) {
  if (near === isle) return openPanel(isle);
  D.auto = isle;
  D.idle = 0;
  Sound.whoosh();
  flash(`flying to ${isle.en.toLowerCase()}`);
}

// touch stick + rise/dive buttons
{
  const stick = $("#stick"), knob = $("#stick i");
  let id = null;
  const set = (e) => {
    const r = stick.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    knob.style.transform = `translate(${x * 36}px, ${y * 36}px)`;
    ext.turn = -x; ext.fwd = -y;
  };
  stick.addEventListener("pointerdown", (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); });
  stick.addEventListener("pointermove", (e) => { if (e.pointerId === id) set(e); });
  const end = () => { id = null; ext.turn = ext.fwd = 0; knob.style.transform = ""; };
  stick.addEventListener("pointerup", end);
  stick.addEventListener("pointercancel", end);
  for (const b of document.querySelectorAll(".vbtns button")) {
    if (b.dataset.fire) { b.addEventListener("pointerdown", shoot); continue; }
    b.addEventListener("pointerdown", () => { ext.vert = +b.dataset.v; });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => { ext.vert = 0; });
  }
}

// hand control, from the AR concept: pinch and drag is a joystick, swipe hops islands, palm enters
let hand = { pinch: false };
function onGesture(g) {
  if (!started) return;
  if (g.type === "palm") { if (panelOpen) closePanel(); else if (near) openPanel(near); else flash("fly onto a gold ring first"); return; }
  // with a scroll open: pinch and drag reads it like a page, a swipe turns to the next island
  if (panelOpen) {
    if (g.type === "pinchstart") hand.top = scroll.scrollTop;
    if (g.type === "pinchmove") scroll.scrollTop = hand.top - g.dy * 2.2;
    if (g.type === "swipe") {
      const i = ISLES.indexOf(openIsle);
      openPanel(ISLES[(i + (g.dir === "left" ? 1 : ISLES.length - 1)) % ISLES.length]);
    }
    return;
  }
  if (g.type === "pinchstart") { hand.pinch = true; D.auto = null; }
  if (g.type === "pinchmove") {
    ext.turn = -THREE.MathUtils.clamp(g.dx / 140, -1, 1);
    ext.vert = -THREE.MathUtils.clamp(g.dy / 120, -1, 1);
    ext.fwd = 1;
  }
  if (g.type === "pinchend") { hand.pinch = false; ext.turn = ext.vert = ext.fwd = 0; }
  if (g.type === "pinchtap") { if (near) openPanel(near); else shoot(); }
  if (g.type === "swipe") {
    const i = ISLES.indexOf(D.auto || near || ISLES[0]);
    flyTo(ISLES[(i + (g.dir === "left" ? 1 : ISLES.length - 1)) % ISLES.length]);
  }
}

// the controls panel folds into a round button, but every visit starts with it open: once the
// mouse steers the dragon there's no cursor to unfold it with
$("#help").open = true;

// ---------- hand dial ----------
// In hand mode the raw webcam stays hidden. This jade dial draws your tracked hand in gold
// ink, glows cinnabar while you pinch, shows where you're steering, and fills a ring as an
// open palm is held.
const dial = $("#handdial"), dctx = dial.querySelector("canvas").getContext("2d");
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function drawDial(hands, st) {
  const S = 360, C = S / 2, g = dctx;
  g.clearRect(0, 0, S, S);
  // trigram ticks round the rim
  g.save();
  g.translate(C, C);
  g.strokeStyle = "rgba(242,211,138,0.45)";
  g.lineWidth = 4;
  g.lineCap = "round";
  for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(-14, -C + 22); g.lineTo(14, -C + 22); g.stroke(); }
  g.restore();
  const lm = hands[0];
  if (!lm && !st?.pinching) { ext.turn = ext.vert = 0; if (!hand.pinch) ext.fwd = 0; }
  dial.classList.toggle("live", !!lm);
  dial.querySelector(".state").textContent = !lm ? "show a hand" : st?.pinching ? "flying" : "pinch to fly";
  if (!lm) return;
  // fit the hand into the dial, mirrored like a mirror
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const p of lm) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const span = Math.max(x1 - x0, y1 - y0) || 0.1, k = (S * 0.58) / span, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const P = lm.map((p) => [C - (p.x - cx) * k, C + (p.y - cy) * k]);
  g.lineCap = "round";
  g.shadowColor = st?.pinching ? "#ff5a3a" : "#f2d38a";
  g.shadowBlur = 18;
  g.strokeStyle = st?.pinching ? "#ffd9a0" : "#f2d38a";
  g.lineWidth = 9;
  g.beginPath();
  for (const [a, b] of BONES) { g.moveTo(...P[a]); g.lineTo(...P[b]); }
  g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = "#fff4d6";
  for (const [x, y] of P) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  // pinch point and steering arrow
  const px = (P[4][0] + P[8][0]) / 2, py = (P[4][1] + P[8][1]) / 2;
  if (st?.pinching) {
    g.fillStyle = "rgba(184,50,42,0.9)";
    g.beginPath(); g.arc(px, py, 16, 0, Math.PI * 2); g.fill();
    const ax = -ext.turn, ay = -ext.vert;
    if (Math.hypot(ax, ay) > 0.08) {
      g.strokeStyle = "#ff8a5a"; g.lineWidth = 8;
      g.beginPath(); g.moveTo(C, C); g.lineTo(C + ax * 110, C + ay * 110); g.stroke();
    }
  }
  if (st?.palmProgress > 0) {
    g.strokeStyle = "#ffd27a"; g.lineWidth = 10;
    g.beginPath(); g.arc(C, C, C - 10, -Math.PI / 2, -Math.PI / 2 + st.palmProgress * Math.PI * 2); g.stroke();
  }
}
$("#cam-toggle").addEventListener("click", (e) => {
  const on = document.body.classList.toggle("show-cam");
  e.currentTarget.textContent = on ? "hide camera" : "show camera";
});

// top bar: each button rings its own note of a small bronze chime set on hover, and a wooden
// temple block knocks under it on click
{
  let lastHover = 0;
  const hud = $("#hud");
  const notes = new Map();
  hud.addEventListener("pointerover", (e) => {
    const b = e.target.closest("button");
    if (!b || e.relatedTarget?.closest?.("button") === b) return;
    const now = performance.now();
    if (now - lastHover < 50) return;
    lastHover = now;
    if (!notes.has(b)) notes.set(b, [...hud.querySelectorAll("button")].indexOf(b));
    Sound.chime(notes.get(b));
  });
  hud.addEventListener("click", (e) => { if (e.target.closest("button")) Sound.block(); });
}

// ---------- first-flight hints (touch screens) ----------
// Instead of a controls list, phones get a ghost fingertip the first time: it drags on the stick
// ("drag to fly"), then taps the island plaques ("tap an island to fly there"). Touching the stick
// moves it on, tapping a plaque ends it, and it never shows again once seen.
function ghostHints() {
  let done = false;
  try { done = localStorage.getItem("eddie-isles-hinted") === "1"; } catch (e) {}
  const touch = matchMedia("(pointer: coarse)").matches || innerWidth < 760;
  if (done || !touch) return;
  const g = $("#ghost"), finger = g.querySelector(".finger"), cap = g.querySelector(".caption");
  const place = (el, text, mode, capBelow) => {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    finger.style.left = `${x}px`; finger.style.top = `${y}px`;
    cap.textContent = text;
    cap.style.left = `${Math.min(innerWidth - 90, Math.max(90, x))}px`;
    cap.style.top = `${capBelow ? r.bottom + 14 : r.top - 46}px`;
    g.className = mode;
    g.hidden = false;
  };
  let step = 0, timer = 0;
  const finish = () => {
    if (step === 3) return;
    step = 3; clearTimeout(timer); g.hidden = true;
    try { localStorage.setItem("eddie-isles-hinted", "1"); } catch (e) {}
  };
  const toPlaques = () => {
    if (step !== 1) return;
    step = 2; clearTimeout(timer);
    place($("#isle-nav"), "tap an island to fly there", "tap", true);
    timer = setTimeout(finish, 6000);
  };
  step = 1;
  place($("#stick"), "drag to fly", "drag", false);
  timer = setTimeout(toPlaques, 5000);
  $("#stick").addEventListener("pointerdown", () => setTimeout(toPlaques, 900), { once: true });
  $("#isle-nav").addEventListener("pointerdown", finish, { once: true });
}

// ---------- island nav + prompt ----------
const nav = $("#isle-nav");
// the islands as destinations: a carved plaque per island with its character, name and a
// tagline. A gold arrow on each turns to point at that island from where you're flying,
// hovering one flares its beacon in the sky, and once you've read an island its plaque is
// stamped.
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem("eddie-isles-seen") || "[]")); } catch (e) {}
for (const isle of ISLES) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "plaque";
  b.innerHTML = `<span class="arrow" aria-hidden="true"><svg viewBox="0 0 12 12" width="12" height="12"><path d="M6 1 L10 9 L6 7 L2 9 Z" fill="currentColor"/></svg></span><span class="zh">${isle.zh}</span><span class="en">${isle.en}</span><span class="sub">${isle.sub}</span><span class="seen" aria-hidden="true">阅</span>`;
  b.setAttribute("aria-label", `Fly to ${isle.en}: ${isle.sub}`);
  b.classList.toggle("is-seen", seen.has(isle.id));
  b.addEventListener("click", () => { if (started) flyTo(isle); });
  b.addEventListener("pointerenter", () => { isle.hot = true; });
  b.addEventListener("pointerleave", () => { isle.hot = false; });
  b.addEventListener("focus", () => { isle.hot = true; });
  b.addEventListener("blur", () => { isle.hot = false; });
  nav.appendChild(b);
  isle.btn = b;
  isle.arrow = b.querySelector(".arrow");
}
function markSeen(isle) {
  if (seen.has(isle.id)) return;
  seen.add(isle.id);
  isle.btn.classList.add("is-seen");
  try { localStorage.setItem("eddie-isles-seen", JSON.stringify([...seen])); } catch (e) {}
}
// each plaque's arrow points at its island relative to where the camera faces
const cF = new THREE.Vector3(), cR = new THREE.Vector3(), cD = new THREE.Vector3();
function updatePlaques() {
  camera.getWorldDirection(cF);
  cF.y = 0; cF.normalize();
  cR.set(-cF.z, 0, cF.x);
  for (const isle of ISLES) {
    if (!isle.root) continue;
    cD.subVectors(isle.root.position, camera.position);
    cD.y = 0;
    const a = Math.atan2(cD.dot(cR), cD.dot(cF));
    isle.arrow.style.transform = `rotate(${a}rad)`;
  }
}
// settings: one quiet button that opens the panel of toggles
{
  const btn = $("#settings-btn"), panel = $("#settings-panel");
  const set = (open) => { panel.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); set(panel.hidden); });
  // the game menu borrows the panel, so a press inside it counts as inside wherever it lives
  addEventListener("pointerdown", (e) => { if (!panel.hidden && !e.target.closest(".hud-right, #settings-panel")) set(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) set(false); });
}
// separate switches for the music and the sound effects, plus the fire-voice picker
for (const which of ["music", "sfx"]) {
  const b = $(`#${which}-btn`);
  // inline stroke icons: a music note for the score, a speaker for effects, struck through when off
  const icon = which === "music"
    ? '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'
    : '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>';
  const paint = () => {
    const on = Sound.pref[which];
    b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}${on ? "" : '<path d="M3 3l18 18"/>'}</svg><span>${which === "sfx" ? "effects" : "music"} ${on ? "on" : "off"}</span>`;
    b.setAttribute("aria-pressed", String(on));
  };
  b.addEventListener("click", () => { Sound.init(); Sound.toggle(which); paint(); });
  paint();
}
const prompt = $("#prompt");
prompt.addEventListener("click", () => near && openPanel(near));
function checkNear() {
  let found = null;
  const P = D.pos;
  // anywhere over the island's footprint counts, from just under the grass to well above the roof
  for (const isle of ISLES) {
    const c = isle.root?.position;
    if (!c) continue;
    if (Math.hypot(P.x - c.x, P.z - c.z) < isle.r && P.y - c.y < 160 && P.y - c.y > -40) found = isle;
  }
  if (found !== near) {
    if (found && !near) Sound.land();
    near = found;
    for (const isle of ISLES) isle.btn.classList.toggle("near", isle === near);
    prompt.hidden = !near || panelOpen;
    if (near) prompt.querySelector("span").textContent = `enter ${near.zh2} · ${near.en.toLowerCase()}`;
  }
}

// ---------- the scrolls ----------
const photo = (p, alt) => `<img loading="lazy" src="${ROOT}${esc(p.file)}" width="${p.w}" height="${p.h}" style="aspect-ratio:${p.w}/${p.h}${p.pos ? `;object-position:${p.pos}` : ""}" alt="${esc(alt)}">`;
// extra links for particular milestones (data.js is generated from the story pack, so they live here)
const CHAPTER_LINKS = {
  "leading-mac": [{ zh: "影", label: "MAC on Instagram", href: "https://www.instagram.com/monashcoding/" }],
};
// stat tiles to leave off particular milestones
const HIDE_STATS = new Set(["lyra", "atlassian", "content"]);
// milestones that read better without the summary line or the photo row (Content is all reels)
const HIDE_SUMMARY = new Set(["content"]), HIDE_PHOTOS = new Set(["content"]);
// milestones whose date, title and role line are left off: Content is only its reel eras
const HIDE_HEAD = new Set(["content"]);
// four photos per milestone, spread across the set (first, two from the middle, last)
const pick4 = (list) => list.length <= 4 ? list : [0, 1, 2, 3].map((k) => list[Math.round((k * (list.length - 1)) / 3)]);
// hand-picked photos for milestones where the even spread lands on the wrong moments: MAC is
// lanyards, stages, lecture halls, club nights and office tours
const P = (ch, f, d, w, h, pos) => ({ file: `assets/photos/${ch}/${f}.jpg`, d, w, h, pos });
const PHOTO_PICKS = {
  "first-internships": ["00_2024-01-11", "02_2024-01-16", "04_2024-01-25", "07_2024-02-02"].map((f) => P("first-internships", f, f.slice(3), 1200, 1600)),
  "monash-intern": [P("first-internships", "08_2024-03-02", "2024-03-02", 1600, 1200), P("first-internships", "09_2024-06-20", "2024-06-20", 1200, 1600), P("first-internships", "11_2024-06-20", "2024-06-20", 1600, 1200)],
  "atlassian": [P("atlassian", "00_2024-11-18", "2024-11-18", 1200, 1600), P("atlassian", "gp_2024-11-19", "2024-11-19", 825, 1100), P("atlassian", "gp_2024-11-22", "2024-11-22", 825, 1100), P("atlassian", "04_2024-11-29", "2024-11-29", 1200, 1600)],
  "culture-amp": [P("culture-amp", "02_2025-12-02", "2025-12-02", 1200, 1600), P("culture-amp", "00_2025-11-24", "2025-11-24", 1600, 1200), P("culture-amp", "03_2025-12-02", "2025-12-02", 1200, 1600)],
  "monash-mac": [P("monash-mac", "gp_2023-04-20", "2023-04-20", 1100, 781), P("monash-mac", "01_2023-05-04", "2023-05-04", 1600, 900), P("monash-mac", "gp_2023-07-07", "2023-07-07", 1100, 825), P("monash-mac", "gp_2023-09-14", "2023-09-14", 1100, 825)],
  "leading-mac": [P("leading-mac", "gp_2025-02-27", "2025-02-27", 1100, 618, "40% 50%"), P("leading-mac", "gp_2025-04-09", "2025-04-09", 1100, 733), P("leading-mac", "09_2025-04-09", "2025-04-09", 1600, 1067, "58% 50%"), P("leading-mac", "13_2025-09-23", "2025-09-23", 1200, 1600)],
};
function chapterHTML(c) {
  const stats = c.stats?.length && !HIDE_STATS.has(c.id) ? `<div class="stats">${c.stats.map(([b, s]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>` : "";
  // each era: its name with the account tagged beside it, one line on why, then the reel
  // thumbnails with just their view counts
  const eras = (c.eras || []).map((e) => {
    const acct = e.vids[0]?.acct || "", handle = acct.replace(/^@/, "");
    const tag = acct ? ` <a class="handle" href="https://www.instagram.com/${esc(handle)}/" target="_blank" rel="noopener">${esc(acct)}</a>` : "";
    return `<div class="era"><h4>${esc(e.name)}${tag}</h4><div class="when">${esc(e.when)}</div><p class="why">${esc(e.why)}</p>
    <div class="reels">${e.vids.map((v) => `<a class="reel" href="${esc(v.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${ROOT}${esc(v.thumbnail)}" alt="Reel on ${esc(v.acct)}, ${esc(v.views)} views"><b>${esc(v.views)}</b></a>`).join("")}</div></div>`;
  }).join("");
  // one description per milestone: the summary, no bullet lists
  const head = HIDE_HEAD.has(c.id) ? "" : `<div class="when">${esc(c.when)}</div><h3>${esc(c.title)}</h3><div class="org">${esc([c.org, c.role].filter(Boolean).join(" · "))}</div>`;
  return `<article class="chapter">${head}
    ${HIDE_SUMMARY.has(c.id) ? "" : `<p>${esc(c.summary)}</p>`}${stats}${eras}
    ${CHAPTER_LINKS[c.id] ? `<div class="links">${CHAPTER_LINKS[c.id].map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener"><span class="stamp" aria-hidden="true">${l.zh}</span>${esc(l.label)}</a>`).join("")}</div>` : ""}
    ${(PHOTO_PICKS[c.id] || c.photos)?.length && !HIDE_PHOTOS.has(c.id) ? `<div class="photos">${(PHOTO_PICKS[c.id] || pick4(c.photos)).map((p) => photo(p, `${c.title}, ${p.d}`)).join("")}</div>` : ""}</article>`;
}
function homeHTML() {
  const fly = (id, label) => `<button type="button" class="fly inline" data-isle="${id}" aria-label="Fly to ${esc(label)}">${esc(label)}</button>`;
  return `<div class="isle-head"><div class="seal big">陈</div><div><div class="kick">关于我 · about me</div><h2 id="scroll-title">Hey, I'm Edward.</h2><div class="aka">(most people call me eddie)</div></div></div>
    <figure class="home-hero"><img class="portrait" src="${ROOT}assets/portrait-baby.jpg" width="1050" height="700" alt="Eddie as a kid, grinning and holding up a toy dinosaur">
    <figcaption class="lede">I wanna be someone my younger self would be proud of.</figcaption></figure>
    <article class="chapter"><div class="when">望子成龙 · the idea</div><h3>Every Chinese kid is meant to become a dragon.</h3>
      <p>Chinese parents have a phrase for what they hope their children grow into: <ruby class="py">望<rt>wàng</rt>子<rt>zǐ</rt>成<rt>chéng</rt>龙<rt>lóng</rt></ruby>, to watch your child become a dragon. This sky is my take on it. You're flying the dragon, and each floating island holds a chapter of how I got here.</p></article>
    <article class="chapter"><div class="when">四岛 · the islands</div><h3>Four islands, one journey.</h3>
      <p>${fly("career", "Career")} is where the work happened, from a first internship at Deloitte to forward deployed engineering at Lyra. ${fly("community", "Community")} is the coding club I ran and the rooms I host for Melbourne engineers now. ${fly("content", "Content")} is the skits and stories that somehow found an audience. ${fly("life", "Life")} is Shanghai, graduating with Mum and Dad there, and a first flight to San Francisco.</p>
      <p>Fly to the glowing beacon on any island and land on its ring, or press <kbd>1</kbd>–<kbd>5</kbd> to be flown there. Every island has a room inside, so take a second to look out the window before the scroll unrolls.</p></article>
    <article class="chapter"><div class="when">right now</div><h3>Still building.</h3>
      <p>Forward deployed engineer at Lyra, doing founding-engineer work for Silicon Valley startups, and a software engineer at boringstack.ai since October 2026. On the side, hosting poker, mahjong and range nights for Melbourne engineers.</p></article>
    <article class="chapter"><div class="when">彩蛋 · easter eggs</div><h3>A few things to try while you're up here.</h3>
      <ul class="eggs">
        <li><b>Breathe fire.</b> Click or press <kbd>F</kbd>. Enough hits and the stone pillars come crashing down.</li>
        <li><b>You're not alone.</b> Anyone else on the site right now flies the same sky, and a fireball will knock them out of it. Hold <kbd>Tab</kbd> to see who's up here.</li>
        <li><b>Fly with your hand.</b> Switch on <b>hand</b> in the settings and steer from your webcam: pinch and drag to fly, a quick pinch to breathe fire.</li>
        <li><b>Change the weather.</b> Day, sunset or night, and all four seasons. Your dragon follows the season too, or pick its element yourself.</li>
        <li><b>Ride up front.</b> Press <kbd>V</kbd> for the view from the dragon's neck.</li>
      </ul></article>
    <div class="links">
      <a href="mailto:edwarddchann@gmail.com"><span class="stamp" aria-hidden="true">信</span>email</a>
      <a href="https://www.linkedin.com/in/edwrdchn/" target="_blank" rel="noopener"><span class="stamp" aria-hidden="true">聯</span>linkedin</a>
      <a href="https://www.instagram.com/eddie_chann/" target="_blank" rel="noopener"><span class="stamp" aria-hidden="true">影</span>instagram</a>
    </div>`;
}
function isleHTML(isle) {
  const chs = isle.chapters.map((id) => CH[id]).filter(Boolean);
  return `<div class="isle-head"><div class="seal big">${isle.zh}</div><div><div class="kick">${isle.zh2} · ${esc(isle.en)} island</div><h2 id="scroll-title">${esc(isle.en)}</h2></div></div>
    <p class="lede">${esc(isle.lede)}</p>${chs.map(chapterHTML).join("")}`;
}
const scroll = $("#scroll");
let openIsle = null;
// every island opens through its own room (see "island rooms" below): you step inside, sit for a
// moment, and then the scroll unrolls over the room
let teaTimer = 0;
function showTea(on, isle) { if (on) enterTea(isle); else leaveTea(); }
function openPanel(isle) {
  if (typeof freeLock === "function") freeLock();
  markSeen(isle);
  const wasOpen = panelOpen;
  panelOpen = true;
  openIsle = isle;
  keys.clear();
  ext.turn = ext.fwd = ext.vert = 0;
  D.auto = null;
  prompt.hidden = true;
  history.replaceState(null, "", `#${isle.id}`);
  clearTimeout(teaTimer);
  const tea = !!ROOMS[isle.id];
  showTea(tea, isle);
  if (tea && !wasOpen) {
    scroll.hidden = true;
    Sound.shoji();
    teaTimer = setTimeout(() => showScroll(isle), REDUCE ? 300 : 1900);
  } else showScroll(isle);
}
function showScroll(isle) {
  if (!panelOpen) return;
  $("#scroll-body").innerHTML = isle.id === "home" ? homeHTML() : isleHTML(isle);
  scroll.hidden = false;
  Sound.unroll();
  scroll.scrollTop = 0;
  $("#scroll-close").focus();
}
function closePanel() {
  if (!panelOpen) return;
  panelOpen = false;
  clearTimeout(teaTimer);
  showTea(false);
  scroll.hidden = true;
  Sound.rollup();
  prompt.hidden = !near;
  canvas.focus?.();
  history.replaceState(null, "", location.pathname + location.search);
}
$("#scroll-close").addEventListener("click", closePanel);
// an island title in the About me scroll flies you there, like the top-bar buttons
$("#scroll-body").addEventListener("click", (e) => {
  const b = e.target.closest("button.fly");
  if (!b) return;
  const isle = ISLES.find((i) => i.id === b.dataset.isle);
  closePanel();
  if (isle) setTimeout(() => flyTo(isle), TEA.active ? 320 : 0);
});
// Esc closes a scroll from anywhere: caught early (capture phase) so a focused control can't
// swallow it, and on key release too in case something else took the key press
const isEsc = (e) => e.key === "Escape" || e.code === "Escape" || e.key === "Esc";
for (const ev of ["keydown", "keyup"]) addEventListener(ev, (e) => { if (panelOpen && isEsc(e)) { e.preventDefault(); closePanel(); } }, true);
scroll.addEventListener("click", (e) => { if (e.target === scroll) closePanel(); });

// ---------- birds ----------
// Red-crowned cranes glide in slow V formations on wide loops between the islands, and swallows
// dart in quick circles around each island. Wings hinge at the shoulder and flap on their own beat.
const birds = [];
{
  const white = std("#f6f3ec", { flatShading: false }), black = std("#1c1c22"), red = std("#d22a1e"), beak = std("#c9b27a"), blue = std("#203048"), cream = std("#efe2c8");
  function wing(len, chord, inner, tip, side) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(len * 0.6, 0.12, chord), inner);
    a.position.x = side * len * 0.3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(len * 0.45, 0.1, chord * 0.75), tip);
    b.position.set(side * len * 0.78, 0, -chord * 0.1);
    g.add(a, b);
    return g;
  }
  function crane() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), white);
    body.scale.set(1, 0.9, 2.2);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 3.4, 6), black);
    neck.rotation.x = Math.PI / 2; neck.position.z = 3.2;
    const headB = at(new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), black), 0, 0, 5);
    const crown = at(new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), red), 0, 0.3, 5.05);
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.6, 5), beak);
    bill.rotation.x = Math.PI / 2; bill.position.z = 6.1;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 5), black);
    tail.rotation.x = -Math.PI / 2; tail.position.z = -2.4;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 4), black);
    legs.rotation.x = Math.PI / 2; legs.position.set(0, -0.3, -3.6);
    const L = wing(7, 2.4, white, black, -1), R = wing(7, 2.4, white, black, 1);
    g.add(body, neck, headB, crown, bill, tail, legs, L, R);
    g.userData.wings = [L, R];
    return g;
  }
  function swallow() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), blue);
    body.scale.set(0.8, 0.7, 1.6);
    const chest = at(new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), cream), 0, -0.15, 0.3);
    for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.4, 3), blue); t.rotation.set(-Math.PI / 2, 0, 0); t.position.set(s * 0.18, 0, -1.3); t.rotation.y = s * 0.35; g.add(t); }
    const L = wing(2.6, 0.7, blue, blue, -1), R = wing(2.6, 0.7, blue, blue, 1);
    g.add(body, chest, L, R);
    g.userData.wings = [L, R];
    return g;
  }
  // crane flocks: a leader on a slow loop, followers in a V behind it
  for (let f = 0; f < 4; f++) {
    const n = 5 + Math.floor(rand() * 4), loop = { r: rr(420, 900), y: rr(330, 470), w: rr(0.025, 0.045) * (f % 2 ? 1 : -1), ph: rand() * 6, c: [rr(-200, 200), rr(-200, 200)] };
    for (let i = 0; i < n; i++) {
      const b = crane();
      b.scale.setScalar(1.3);
      const rank = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
      bake(b, b.userData.wings);
      for (const w of b.userData.wings) bake(w);
      birds.push({ b, kind: "crane", loop, off: new THREE.Vector3(i ? side * rank * 9 : 0, rank * 0.6, -rank * 10), flap: rr(1.6, 2.2), ph: rand() * 6 });
      scene.add(b);
    }
  }
  // swallows circling each island
  for (const isle of ISLES) {
    for (let i = 0; i < 6; i++) {
      const b = swallow();
      b.scale.setScalar(1.4);
      bake(b, b.userData.wings);
      for (const w of b.userData.wings) bake(w);
      birds.push({ b, kind: "swallow", isle, r: isle.r * rr(0.8, 1.35), y: rr(15, 60), w: rr(0.5, 0.9) * (i % 2 ? 1 : -1), ph: rand() * 6, flap: rr(9, 13) });
      scene.add(b);
    }
  }
}
const birdP = new THREE.Vector3(), birdN = new THREE.Vector3();
function updateBirds(t) {
  for (const o of birds) {
    let pos, ahead;
    if (o.kind === "crane") {
      const L = o.loop, a = t * L.w + L.ph, a2 = a + 0.05 * Math.sign(L.w);
      const at2 = (aa) => tmp.set(L.c[0] + Math.cos(aa) * L.r, L.y + Math.sin(aa * 2) * 25, L.c[1] + Math.sin(aa) * L.r);
      const lead = at2(a).clone(), next = at2(a2).clone();
      const fwd = birdN.subVectors(next, lead).normalize(), right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      pos = lead.addScaledVector(right, o.off.x).addScaledVector(fwd, o.off.z).add(tmp.set(0, o.off.y, 0));
      ahead = birdP.copy(pos).add(fwd);
      // cranes mostly glide, with a few slow wingbeats now and then
      const beat = Math.max(0, Math.sin(t * 0.35 + o.ph)) > 0.6 ? Math.sin(t * o.flap * 2 + o.ph) * 0.5 : 0.08 * Math.sin(t * 1.5 + o.ph);
      o.b.userData.wings[0].rotation.z = beat; o.b.userData.wings[1].rotation.z = -beat;
    } else {
      const q = o.isle.root ? o.isle.root.position : new THREE.Vector3(...o.isle.pos);
      const a = t * o.w + o.ph;
      const wob = Math.sin(t * 1.7 + o.ph) * 0.25;
      pos = tmp.set(q.x + Math.cos(a) * o.r * (1 + wob * 0.3), q.y + o.y + Math.sin(t * 2.3 + o.ph) * 8, q.z + Math.sin(a) * o.r * (1 + wob * 0.3)).clone();
      const a2 = a + 0.05 * Math.sign(o.w);
      ahead = birdP.set(q.x + Math.cos(a2) * o.r, pos.y, q.z + Math.sin(a2) * o.r);
      const beat = Math.sin(t * o.flap + o.ph) * 0.8;
      o.b.userData.wings[0].rotation.z = beat; o.b.userData.wings[1].rotation.z = -beat;
    }
    o.b.position.copy(pos);
    o.b.lookAt(ahead);
  }
}

// ---------- time of day ----------
// Day, sunset and night. The default follows the system's light or dark setting; a choice made
// with the buttons is remembered. Switching eases every colour and light over a second or two.
const TOD = {
  day: { top: "#3f86d6", mid: "#8fc0ea", hor: "#f1ead9", low: "#eef0ee", glow: "#fff2d0", disc: "#fffbea", sun: [-0.3, 0.75, -0.55],
    fog: "#d6e2ea", near: 650, far: 3000, hemiSky: "#ffffff", hemiGround: "#6f7d5c", hemiI: 1.05, sunCol: "#fff3de", sunI: 2.7,
    exposure: 1.0, sea: "#eef3f6", cloud: "#ffffff", lantern: 0.6, stars: 0, bloom: 0.25 },
  sunset: { top: "#29264f", mid: "#c77885", hor: "#fabd85", low: "#f2d1b8", glow: "#ffbf73", disc: "#fff2cc", sun: [-0.55, 0.22, -0.8],
    fog: "#eab3a2", near: 500, far: 2500, hemiSky: "#ffd9b8", hemiGround: "#5a4466", hemiI: 0.9, sunCol: "#ffd2a0", sunI: 2.4,
    exposure: 0.92, sea: "#f6d9cf", cloud: "#e9c3c8", lantern: 2.2, stars: 0, bloom: 0.4 },
  night: { top: "#050918", mid: "#101c42", hor: "#2a3a66", low: "#18213c", glow: "#9fb6ff", disc: "#eef3ff", sun: [0.45, 0.55, -0.7],
    fog: "#2a3558", near: 480, far: 2400, hemiSky: "#8aa0dc", hemiGround: "#3d4466", hemiI: 0.95, sunCol: "#c4d6ff", sunI: 1.4,
    exposure: 1.25, sea: "#3d4a70", cloud: "#7f8db4", lantern: 4.5, stars: 1, bloom: 0.75 },
};
const stars = (() => {
  const n = 1800, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, y = Math.abs(u) * 0.9 + 0.08, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 3500, y * 3500, Math.sin(a) * r * 3500], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  // each star gets its own size, twinkle speed and phase; drawn as soft round dots
  const seedA = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) seedA.set([rr(1.2, 3.4), rr(0.6, 3.2), rand() * 6.28], i * 3);
  g.setAttribute("seed", new THREE.BufferAttribute(seedA, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, opacity: { value: 0 } },
    vertexShader: `attribute vec3 seed; uniform float time; varying float vTw;
      void main(){
        vTw = 0.55 + 0.45 * sin(time * seed.y + seed.z) * sin(time * seed.y * 0.37 + seed.z * 2.0);
        gl_PointSize = seed.x * (0.8 + 0.4 * vTw) * 1.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `uniform float opacity; varying float vTw;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * vTw * opacity, 1.);
      }`,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  scene.add(p);
  return p;
})();
const todNow = {}, todGoal = {};
const COLOR_KEYS = ["top", "mid", "hor", "low", "glow", "disc", "fog", "hemiSky", "hemiGround", "sunCol", "sea", "cloud"];
const NUM_KEYS = ["near", "far", "hemiI", "sunI", "exposure", "lantern", "stars", "bloom"];
function setGoal(name) {
  const p = TOD[name];
  for (const k of COLOR_KEYS) { todGoal[k] = new THREE.Color(p[k]); if (!todNow[k]) todNow[k] = todGoal[k].clone(); }
  for (const k of NUM_KEYS) { todGoal[k] = p[k]; if (todNow[k] === undefined) todNow[k] = p[k]; }
  todGoal.sun = new THREE.Vector3(...p.sun).normalize();
  if (!todNow.sun) todNow.sun = todGoal.sun.clone();
}
function updateTod(dt) {
  const a = 1 - Math.exp(-dt * 2.2);
  for (const k of COLOR_KEYS) todNow[k].lerp(todGoal[k], a);
  for (const k of NUM_KEYS) todNow[k] += (todGoal[k] - todNow[k]) * a;
  todNow.sun.lerp(todGoal.sun, a).normalize();
  const u = SKY.uniforms;
  for (const k of ["top", "mid", "hor", "low", "glow", "disc"]) u[k].value.copy(todNow[k]);
  sunDir.copy(todNow.sun);
  scene.fog.color.copy(todNow.fog);
  scene.fog.near = todNow.near; scene.fog.far = todNow.far;
  hemi.color.copy(todNow.hemiSky); hemi.groundColor.copy(todNow.hemiGround); hemi.intensity = todNow.hemiI;
  sunLight.color.copy(todNow.sunCol); sunLight.intensity = todNow.sunI;
  renderer.toneMappingExposure = todNow.exposure;
  SKY.sea.color.copy(todNow.sea);
  seaLayers[0].mat.color.copy(todNow.cloud);
  M.lantern.emissiveIntensity = todNow.lantern;
  stars.material.uniforms.opacity.value = todNow.stars;
  stars.material.uniforms.time.value = clock.elapsedTime;
  stars.visible = todNow.stars > 0.02;
  bloom.strength = todNow.bloom;
}
const TOD_KEY = "eddie-isles-time";
const systemTod = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day");
let todPick = null;
try { todPick = localStorage.getItem(TOD_KEY); } catch (e) {}
let todName = TOD[todPick] ? todPick : systemTod();
setGoal(todName);
for (const k of COLOR_KEYS) todNow[k].copy(todGoal[k]);
{
  const box = $("#tod");
  const ICONS = {
    day: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    sunset: '<path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 9V2M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1"/>',
    night: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  };
  const paint = () => { for (const b of box.children) b.setAttribute("aria-pressed", String(b.dataset.tod === todName)); };
  for (const name of ["day", "sunset", "night"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.tod = name;
    b.setAttribute("aria-label", `${name} sky`);
    b.title = name;
    b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    b.addEventListener("click", () => {
      todName = name;
      try { localStorage.setItem(TOD_KEY, name); } catch (e) {}
      setGoal(name);
      paint();
    });
    box.appendChild(b);
  }
  paint();
  // with no saved choice, keep following the system setting as it changes
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    let saved = null;
    try { saved = localStorage.getItem(TOD_KEY); } catch (e) {}
    if (!TOD[saved]) { todName = systemTod(); setGoal(todName); paint(); }
  });
}

// ---------- rope bridges ----------
// Plank-and-rope bridges slung from the home island to each of the others: a sagging deck of
// weathered planks (a few gone), rope handrails tied to the deck by hangers, posts with red
// lanterns at each end, swaying gently in the wind.
const bridges = [];
const ropeMat = std("#8a6a44", { flatShading: false, roughness: 1 });
const plankMats = ["#7a5636", "#6b4a2e", "#86613d", "#5f4128"].map((c) => std(c));
function buildBridge(a, b) {
  const pa = new THREE.Vector3(...a.pos), pb = new THREE.Vector3(...b.pos);
  const flat = new THREE.Vector3(pb.x - pa.x, 0, pb.z - pa.z), dist = flat.length();
  flat.normalize();
  const A = pa.clone().addScaledVector(flat, a.r * 0.96).setY(pa.y + 0.6);
  const B = pb.clone().addScaledVector(flat, -b.r * 0.96).setY(pb.y + 0.6);
  const L = Math.hypot(B.x - A.x, B.z - A.z), dy = B.y - A.y, sag = L * 0.07;
  // local frame: x runs from A toward B, y is up; deck height along the span sags in the middle
  const deck = (u) => new THREE.Vector3(u * L, dy * u - sag * 4 * u * (1 - u), 0);
  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.position.copy(A);
  outer.rotation.y = -Math.atan2(flat.z, flat.x);
  outer.add(inner);
  const W = 7, n = Math.round(L / 2.3);
  const plank = new THREE.BoxGeometry(1.7, 0.45, W);
  const counts = plankMats.map(() => 0), meshes = plankMats.map((m) => new THREE.InstancedMesh(plank, m, n));
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    if (u > 0.08 && u < 0.92 && rand() < 0.05) continue; // a missing plank here and there
    const p = deck(u), p2 = deck(Math.min(1, u + 0.01));
    const k = Math.floor(rand() * plankMats.length);
    q.setFromEuler(e.set(rr(-0.04, 0.04), rr(-0.05, 0.05), Math.atan2(p2.y - p.y, p2.x - p.x)));
    mtx.compose(p, q, tmp.set(1, 1, rr(0.85, 1.05)));
    meshes[k].setMatrixAt(counts[k]++, mtx);
  }
  meshes.forEach((m, k) => { m.count = counts[k]; m.castShadow = true; m.receiveShadow = true; inner.add(m); });
  // ropes: two under the plank ends, two handrails above, joined by hangers
  const rope = (z, lift, r) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const u = i / 40, p = deck(u); p.y += lift + (lift > 0 ? sag * 0.12 * 4 * u * (1 - u) : 0); p.z = z; pts.push(p); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, r, 5, false), ropeMat);
    m.castShadow = true;
    inner.add(m);
  };
  for (const z of [-W / 2, W / 2]) { rope(z, -0.35, 0.28); rope(z, 5.2, 0.32); }
  const hanger = new THREE.CylinderGeometry(0.1, 0.1, 1, 4);
  const hangers = new THREE.InstancedMesh(hanger, ropeMat, Math.ceil(n / 3) * 2 + 2);
  let h = 0;
  for (let i = 0; i <= n; i += 3) {
    const u = i / n, p = deck(u), top = 5.2 + sag * 0.12 * 4 * u * (1 - u);
    for (const z of [-W / 2, W / 2]) {
      mtx.compose(tmp.set(p.x, p.y + top / 2, z), q.identity(), new THREE.Vector3(1, top + 0.35, 1));
      hangers.setMatrixAt(h++, mtx);
    }
  }
  hangers.count = h;
  inner.add(hangers);
  // posts with a lantern at each end
  for (const [u, side] of [[0, 1], [1, -1]]) {
    const p = deck(u);
    for (const z of [-W / 2 - 0.4, W / 2 + 0.4]) {
      inner.add(at(cyl(0.55, 0.7, 8, M.wood, 7), p.x - side * 0.6, p.y + 3.4, z));
      inner.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), M.gold), p.x - side * 0.6, p.y + 7.6, z));
      const l = hangingLantern();
      l.scale.setScalar(0.6);
      l.position.set(p.x - side * 0.6, p.y + 5.6, z + Math.sign(z) * 1.1);
      inner.add(l);
    }
  }
  bake(inner);
  scene.add(outer);
  bridges.push({ inner, axis: new THREE.Vector3(L, dy, 0).normalize(), ph: rand() * 6 });
}
function buildBridges() {
  const home = ISLES[0];
  for (const isle of ISLES.slice(1)) buildBridge(home, isle);
}
// bridges sway in the wind
let bridgeT = 0;
function updateBridges(t) {
  const dt = Math.min(0.05, Math.max(0, t - bridgeT));
  bridgeT = t;
  bridges.forEach((b, i) => {
    b.inner.setRotationFromAxisAngle(b.axis, Math.sin(t * 0.7 + b.ph) * (0.025 + windAmt * 0.03));
  });
}

// ---------- dragon skins: follow the season, or pick one in settings ----------
const SKIN_KEY = "eddie-isles-skin";
let skinPick = "season";
try { skinPick = localStorage.getItem(SKIN_KEY) || "season"; } catch (e) {}
function refreshSkin() {
  const key = skinPick === "season" ? SEASON_SKIN[seasonName] || "fire" : skinPick;
  if (key !== mySkin || !refreshSkin.done) { applySkin(key); refreshSkin.done = true; }
  for (const b of $("#skins").children) b.setAttribute("aria-pressed", String(b.dataset.skin === skinPick));
}
{
  const box = $("#skins");
  for (const [k, sk] of [["season", null], ...Object.entries(SKINS)]) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.skin = k;
    if (sk) {
      b.innerHTML = `<span style="background:${sk.main};border-color:${sk.fin}">${sk.zh}</span>`;
      b.title = `${sk.name} dragon`;
      b.setAttribute("aria-label", `${sk.name} dragon`);
    } else {
      b.innerHTML = `<span class="all">四季</span>`;
      b.title = "match the season";
      b.setAttribute("aria-label", "Dragon follows the season");
    }
    b.addEventListener("click", () => {
      skinPick = k;
      try { localStorage.setItem(SKIN_KEY, k); } catch (e) {}
      refreshSkin();
      flash(k === "season" ? `the ${SKINS[mySkin].name.toLowerCase()} dragon, for ${seasonName}` : `the ${sk.name.toLowerCase()} dragon`);
    });
    box.appendChild(b);
  }
}

// ---------- seasons ----------
// Spring blossoms with drifting petals, lush summer, gold-and-red autumn with falling leaves,
// and winter under snow, or rain. The default is the real season where you are (southern
// hemisphere time zones flip it); a choice made with the buttons is remembered.
const SEASONS = {
  spring: { grass: "#86b45a", blade: "#ffffff", mei: "#f4b6c8", meiW: "#fbe6ec", ginkgoA: "#a9c255", ginkgoB: "#93b84a", maple: "#7fa64a", maple2: "#9cbb5f", willow: "#a8cc6e", pine: "#2c5440", pine2: "#3b6a4e", tile: "#3c4250", jade: "#2f6b5b", rock: "#ffffff", fall: "petals" },
  summer: { grass: "#5f9a3e", blade: "#d8f0c0", mei: "#5f9442", meiW: "#6fa54d", ginkgoA: "#6f9d3c", ginkgoB: "#5d8f34", maple: "#4f8a3a", maple2: "#6a9d45", willow: "#7fb052", pine: "#24503a", pine2: "#336147", tile: "#3c4250", jade: "#2f6b5b", rock: "#ffffff", fall: null },
  autumn: { grass: "#a99a52", blade: "#f2dca0", mei: "#b5734a", meiW: "#c98f5a", ginkgoA: "#f0c63a", ginkgoB: "#e8b22e", maple: "#c8402a", maple2: "#e06a34", willow: "#c9b15a", pine: "#2c5440", pine2: "#3b6a4e", tile: "#3c4250", jade: "#2f6b5b", rock: "#f6eee4", fall: "leaves" },
  winter: { grass: "#eef2f5", blade: "#ffffff", mei: "#f6f4f2", meiW: "#ffffff", ginkgoA: "#d9dcd6", ginkgoB: "#e4e6e2", maple: "#e9ece8", maple2: "#f2f3f0", willow: "#dfe3e0", pine: "#5c7a70", pine2: "#7a948b", tile: "#eaeef2", jade: "#e2e9ec", rock: "#e9eef4", fall: "snow" },
};
const SEASON_MATS = () => ({ grass: [M.grass], blade: [grassMat], mei: [F.mei], meiW: [F.meiW], ginkgoA: [F.ginkgoA], ginkgoB: [F.ginkgoB], maple: [F.maple], maple2: [F.maple2], willow: [F.willow], pine: [F.pineA], pine2: [F.pineB], tile: [M.tile], jade: [M.tileJade], rock: PILLARS.length ? [PILLARS[0].mesh.material] : [] });
let seasonName = "spring", winterRain = false;
const SNOW_GLOW = new THREE.Color(0.62, 0.66, 0.7), NO_GLOW = new THREE.Color(0, 0, 0);
const seasonGoal = {};
function setSeason(name) {
  seasonName = name;
  refreshSkin();
  for (const [k, hex] of Object.entries(SEASONS[name])) if (k !== "fall") seasonGoal[k] = new THREE.Color(hex);
  const fall = SEASONS[name].fall === "snow" && winterRain ? "rain" : SEASONS[name].fall;
  setPrecip(fall);
  Sound.weather(fall);
}
function updateSeason(dt) {
  const a = 1 - Math.exp(-dt * 1.5), mats = SEASON_MATS();
  for (const [k, list] of Object.entries(mats)) if (seasonGoal[k]) for (const m of list) m.color.lerp(seasonGoal[k], a);
  // snow on grass can't come from tinting green blades, so winter lifts them with a pale glow
  grassMat.emissive.lerp(seasonName === "winter" ? SNOW_GLOW : NO_GLOW, a);
  updatePrecip(dt);
}
const naturalSeason = () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const south = /^(Australia|Pacific\/Auckland|Pacific\/Chatham|America\/(Santiago|Argentina|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima)|Africa\/(Johannesburg|Maputo|Harare|Windhoek))/.test(tz);
  const m = (new Date().getMonth() + (south ? 6 : 0)) % 12;
  return m >= 2 && m <= 4 ? "spring" : m >= 5 && m <= 7 ? "summer" : m >= 8 && m <= 10 ? "autumn" : "winter";
};

// falling things: snow, rain streaks, blossom petals or autumn leaves, in a box around the camera
const FALL_N = 2600, FALL_BOX = new THREE.Vector3(420, 300, 420);
const fallPos = new Float32Array(FALL_N * 3), fallSeed = new Float32Array(FALL_N);
for (let i = 0; i < FALL_N; i++) { fallPos.set([rr(-0.5, 0.5) * FALL_BOX.x, rr(-0.5, 0.5) * FALL_BOX.y, rr(-0.5, 0.5) * FALL_BOX.z], i * 3); fallSeed[i] = rand() * 6.28; }
const fallGeo = new THREE.BufferGeometry();
fallGeo.setAttribute("position", new THREE.BufferAttribute(fallPos, 3));
const fallMat = new THREE.PointsMaterial({ map: softTex, size: 2.2, transparent: true, depthWrite: false, opacity: 0.9, color: "#ffffff" });
const fall = new THREE.Points(fallGeo, fallMat);
fall.frustumCulled = false;
fall.visible = false;
scene.add(fall);
const rainPos = new Float32Array(FALL_N * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: "#c9d6e6", transparent: true, opacity: 0.5, depthWrite: false }));
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);
const FALL_STYLE = {
  snow: { color: "#ffffff", size: 2.4, speed: 22, sway: 9, count: 2600 },
  petals: { color: "#f6b8cc", size: 2.6, speed: 12, sway: 14, count: 900 },
  leaves: { color: "#e0782e", size: 3.2, speed: 16, sway: 16, count: 800 },
  rain: { speed: 260, count: 2200 },
};
let fallKind = null;
function setPrecip(kind) {
  fallKind = kind;
  fall.visible = !!kind && kind !== "rain";
  rain.visible = kind === "rain";
  if (fall.visible) {
    const s = FALL_STYLE[kind];
    fallMat.color.set(s.color);
    fallMat.size = s.size;
    fallGeo.setDrawRange(0, s.count);
  }
}
function updatePrecip(dt) {
  // nothing falls indoors
  fall.visible = !TEA.active && !!fallKind && fallKind !== "rain";
  rain.visible = !TEA.active && fallKind === "rain";
  if (!fallKind || TEA.active) return;
  const c = camera.position, t = clock.elapsedTime, s = FALL_STYLE[fallKind];
  const wrap = (v, centre, size) => centre + ((((v - centre) / size + 0.5) % 1) + 1) % 1 * size - size / 2;
  for (let i = 0; i < s.count; i++) {
    let x = fallPos[i * 3], y = fallPos[i * 3 + 1], z = fallPos[i * 3 + 2];
    y -= s.speed * dt;
    if (fallKind !== "rain") { x += Math.sin(t * 0.8 + fallSeed[i]) * s.sway * dt; z += Math.cos(t * 0.6 + fallSeed[i]) * s.sway * 0.6 * dt; }
    x = wrap(x, c.x, FALL_BOX.x); y = wrap(y, c.y, FALL_BOX.y); z = wrap(z, c.z, FALL_BOX.z);
    fallPos[i * 3] = x; fallPos[i * 3 + 1] = y; fallPos[i * 3 + 2] = z;
    if (fallKind === "rain") rainPos.set([x, y, z, x + 1.2, y + 9, z + 0.6], i * 6);
  }
  if (fallKind === "rain") { rainGeo.setDrawRange(0, s.count * 2); rainGeo.attributes.position.needsUpdate = true; }
  else fallGeo.attributes.position.needsUpdate = true;
}
{
  const KEY_S = "eddie-isles-season";
  let saved = null;
  try { saved = localStorage.getItem(KEY_S); } catch (e) {}
  winterRain = false; // winter starts as snow; pressing winter again switches to rain
  const box = $("#seasons");
  const ICONS = {
    spring: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10 6 12 3 12 3s2 3 0 6.5M14.4 11.2c3.3-2 6-.3 6-.3s-1.5 3-5.4 2.3M13.5 14.3c1.8 3.4-.2 6-.2 6s-2.6-2-1.8-5.8M10.5 14.3c-1.8 3.4.2 6 .2 6M9.6 11.2c-3.3-2-6-.3-6-.3s1.5 3 5.4 2.3"/>',
    summer: '<path d="M12 21c-5-3-8-7-8-11a8 8 0 0 1 16 0c0 4-3 8-8 11z"/><path d="M12 21V8"/>',
    autumn: '<path d="M12 3l2 4 4-1-1 4 4 2-4 2 1 4-4-1-2 4-2-4-4 1 1-4-4-2 4-2-1-4 4 1z"/><path d="M12 12v9"/>',
    winter: '<path d="M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  };
  const paint = () => { for (const b of box.children) b.setAttribute("aria-pressed", String(b.dataset.season === seasonName)); };
  for (const name of Object.keys(SEASONS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.season = name;
    b.title = name;
    b.setAttribute("aria-label", name);
    b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    b.addEventListener("click", () => {
      // pressing winter again swaps snow for rain
      if (name === "winter" && seasonName === "winter") winterRain = !winterRain;
      try { localStorage.setItem(KEY_S, name); } catch (e) {}
      setSeason(name);
      paint();
      if (name === "winter") flash(winterRain ? "winter rain" : "snowing"); else flash(name);
    });
    box.appendChild(b);
  }
  seasonName = SEASONS[saved] ? saved : naturalSeason();
  paint();
}

// ---------- island rooms (one inside each island's building) ----------
// A real room built inside each island's building, so its window looks out on the live world:
// the sky, sea, pillars, islands and birds, whatever the time of day or season. Landing on an
// island takes you inside and the scroll unrolls over the room; closing it (or Esc) flies you
// back out. About me is the tea room; the
// others are furnished for their story: a study, a hosting hall, a studio and a traveller's room.
const TEA = { active: false, room: null, yaw: 0, pitch: 0.02, fov: 54 };
const ROOMS = {};
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const teaLanternMat = new THREE.MeshStandardMaterial({ color: "#e0452a", emissive: "#ff6a2a", emissiveIntensity: 0.9, roughness: 0.6 });
const roomSmooth = (c, o = {}) => std(c, { flatShading: false, roughness: 0.7, ...o });
// blue-and-white porcelain, shared by every room's pots, cups and vases
let porcelainMat = null;
function porcelain() {
  if (porcelainMat) return porcelainMat;
  const map = canvasTex(256, 128, (x, w) => {
    x.fillStyle = "#f6f1e6"; x.fillRect(0, 0, w, 128);
    x.strokeStyle = "#2f4f8a"; x.lineWidth = 3;
    for (let i = 0; i < w; i += 32) { x.beginPath(); x.arc(i + 16, 64, 10, 0, Math.PI * 1.6); x.stroke(); x.beginPath(); x.moveTo(i, 46); x.quadraticCurveTo(i + 16, 36, i + 32, 46); x.stroke(); }
    x.fillStyle = "#2f4f8a"; x.fillRect(0, 22, w, 3); x.fillRect(0, 100, w, 3);
  });
  return (porcelainMat = new THREE.MeshStandardMaterial({ map, roughness: 0.22, metalness: 0.02 }));
}
// floors: woven tatami, dark wooden boards, or a red hosting carpet
const FLOORS = {
  tatami: () => canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = "#cdb27a"; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { x.fillStyle = y % 6 ? "rgba(120,90,40,0.18)" : "rgba(255,240,200,0.12)"; x.fillRect(0, y, w, 1.5); }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(90,70,30,${Math.random() * 0.12})`; x.fillRect(Math.random() * w, Math.random() * h, Math.random() * 20, 1); }
    x.fillStyle = "#26302a"; x.fillRect(0, 0, w, 14); x.fillRect(0, h - 14, w, 14);
    x.fillStyle = "rgba(201,168,90,0.35)"; for (let i = 0; i < w; i += 16) { x.fillRect(i, 5, 8, 4); x.fillRect(i + 8, h - 9, 8, 4); }
  }, [4, 4]),
  wood: () => canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = "#6b4226"; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) {
      const y = r * 64, off = (r % 2) * 180;
      x.fillStyle = `hsl(24, 40%, ${22 + Math.random() * 8}%)`; x.fillRect(0, y, w, 62);
      for (let i = 0; i < 30; i++) { x.strokeStyle = `rgba(30,14,6,${Math.random() * 0.3})`; x.beginPath(); const yy = y + Math.random() * 62; x.moveTo(0, yy); x.bezierCurveTo(170, yy + 4, 340, yy - 4, w, yy + 2); x.stroke(); }
      x.fillStyle = "#2a160c"; x.fillRect(0, y + 62, w, 2); x.fillRect(off, y, 2, 62); x.fillRect(off + 300, y, 2, 62);
    }
  }, [4, 3]),
  carpet: () => canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = "#8c1f19"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#d6aa50"; x.lineWidth = 10; x.strokeRect(24, 24, w - 48, h - 48);
    x.lineWidth = 3; x.strokeRect(46, 46, w - 92, h - 92);
    x.fillStyle = "rgba(214,170,80,0.55)";
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const cx = 112 + i * 96, cy = 112 + j * 96; x.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, r = k % 2 ? 10 : 22; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.fill(); }
  }, [2, 1]),
};
// the shared shell: x runs from the back wall (-24) to the window wall (+24), z across (-13..13)
function roomShell(isle, o) {
  const room = { isle, group: new THREE.Group(), seat: new THREE.Vector3(-9.5, 6.6, 0), lanterns: [], steam: [], steamFrom: [], keep: [] };
  const g = room.group, hold = isle.center.clone().sub(isle.root.position);
  g.position.set(hold.x, 5.9, hold.z);
  // away from home, the window turns to look back across the islands toward About me
  if (isle.id !== "home") g.rotation.y = isle.face - Math.PI / 2;
  const L = 24, Wz = 13, H = 18, smooth = roomSmooth;
  const lacquer = smooth("#3d1f10", { roughness: 0.35 }), beam = smooth("#4a2614", { roughness: 0.6 }), plaster = smooth(o.plaster || "#e9dcc0", { roughness: 0.95 });
  const shoji = canvasTex(256, 384, (x, w, h) => {
    x.fillStyle = "#f6ecd6"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#3d1f10"; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
    x.lineWidth = 3;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo((w / 4) * i, 0); x.lineTo((w / 4) * i, h); x.stroke(); }
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, (h / 6) * i); x.lineTo(w, (h / 6) * i); x.stroke(); }
  });
  const shojiMat = new THREE.MeshStandardMaterial({ map: shoji, emissive: "#ffcf8a", emissiveMap: shoji, emissiveIntensity: 0.05, roughness: 0.9 });
  const ceiling = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = "#5a3220"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#3a1c0e"; x.fillRect(0, 0, w, 14); x.fillRect(0, 0, 14, h);
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(30,12,4,${Math.random() * 0.25})`; x.beginPath(); const y = 14 + Math.random() * (h - 14); x.moveTo(14, y); x.bezierCurveTo(90, y + 6, 160, y - 6, w, y + 2); x.stroke(); }
  }, [8, 4]);
  // the alcove's hanging scroll: a misty mountain painting with the room's four characters
  const painting = canvasTex(256, 640, (x, w, h) => {
    x.fillStyle = "#7a1c14"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#c8a14a"; x.fillRect(10, 0, w - 20, h);
    x.fillStyle = "#efe4c8"; x.fillRect(22, 70, w - 44, h - 150);
    const grd = x.createLinearGradient(0, 300, 0, 520); grd.addColorStop(0, "rgba(40,40,46,0.85)"); grd.addColorStop(1, "rgba(40,40,46,0.05)");
    x.fillStyle = grd;
    for (const [px, ph, pw] of [[60, 230, 30], [100, 300, 40], [150, 210, 28], [190, 280, 36]]) { x.beginPath(); x.moveTo(px - pw, 540); x.quadraticCurveTo(px - pw * 0.6, 540 - ph, px, 540 - ph - 10); x.quadraticCurveTo(px + pw * 0.6, 540 - ph, px + pw, 540); x.fill(); }
    x.fillStyle = "#1e1612"; x.font = "64px 'Ma Shan Zheng', KaiTi, serif"; x.textAlign = "center";
    o.chars.split("").forEach((ch, i) => x.fillText(ch, w - 62, 140 + i * 66));
    x.fillStyle = "#b8322a"; x.fillRect(w - 86, 420, 40, 40);
    x.fillStyle = "#f3d9b0"; x.font = "30px 'Ma Shan Zheng', KaiTi, serif"; x.fillText("陈", w - 66, 452);
  });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); return mesh; };
  const slab = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  // floor with a wooden border, a coffered ceiling with beams
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, Wz * 2), new THREE.MeshStandardMaterial({ map: FLOORS[o.floor || "tatami"](), roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  for (const z of [-Wz + 0.4, Wz - 0.4]) add(slab(L * 2, 0.3, 0.8, beam), 0, 0.15, z);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, Wz * 2), new THREE.MeshStandardMaterial({ map: ceiling, roughness: 0.8 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
  for (let x = -18; x <= 18; x += 9) add(slab(1, 1, Wz * 2, beam), x, H - 0.5, 0);
  add(slab(L * 2, 1.2, 1, beam), 0, H - 0.6, -Wz + 0.5); add(slab(L * 2, 1.2, 1, beam), 0, H - 0.6, Wz - 0.5);
  // side walls: shoji below, plaster above, posts between panels
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, H), plaster);
    wall.position.set(0, H / 2, s * Wz); wall.rotation.y = s > 0 ? Math.PI : 0; wall.receiveShadow = true; g.add(wall);
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 11), shojiMat);
      p.position.set(-21 + i * 8.4, 5.7, s * (Wz - 0.05)); p.rotation.y = s > 0 ? Math.PI : 0; g.add(p);
      add(slab(0.7, 12, 0.6), -24.9 + i * 8.4 + 0.6, 6, s * (Wz - 0.2)).material = beam;
    }
    add(slab(L * 2, 0.7, 0.6, beam), 0, 11.5, s * (Wz - 0.2));
  }
  // back wall with an alcove: the hanging scroll on a raised lacquer step
  const back = new THREE.Mesh(new THREE.PlaneGeometry(Wz * 2, H), plaster);
  back.position.set(-L, H / 2, 0); back.rotation.y = Math.PI / 2; g.add(back);
  add(slab(1.2, H, 1.2, lacquer), -L + 0.6, H / 2, -6.5); add(slab(1.2, H, 1.2, lacquer), -L + 0.6, H / 2, 6.5);
  add(slab(2.4, 0.8, 12, lacquer), -L + 1.2, 1.2, 0);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 10.5), new THREE.MeshStandardMaterial({ map: painting, roughness: 0.9 }));
  art.position.set(-L + 0.08, 9.5, 0); art.rotation.y = Math.PI / 2; g.add(art);
  // window wall: a wide opening onto the world, framed in lacquer with a lattice transom and
  // the sliding shoji pushed back to either side
  const win = { z: 11, y0: 3.4, y1: 14.6 };
  add(slab(0.8, win.y0, Wz * 2, plaster), L, win.y0 / 2, 0);
  add(slab(0.8, H - win.y1, Wz * 2, plaster), L, (H + win.y1) / 2, 0);
  add(slab(0.8, win.y1 - win.y0, Wz - win.z, plaster), L, (win.y0 + win.y1) / 2, -(Wz + win.z) / 2);
  add(slab(0.8, win.y1 - win.y0, Wz - win.z, plaster), L, (win.y0 + win.y1) / 2, (Wz + win.z) / 2);
  add(slab(1.4, 0.9, win.z * 2 + 1.6, lacquer), L - 0.4, win.y0, 0);
  add(slab(1.4, 0.9, win.z * 2 + 1.6, lacquer), L - 0.4, win.y1, 0);
  for (const z of [-win.z, 0, win.z]) add(slab(1.2, win.y1 - win.y0, z ? 1.2 : 0.8, lacquer), L - 0.4, (win.y0 + win.y1) / 2, z);
  for (let i = -win.z + 2; i < win.z; i += 2) add(slab(0.3, H - win.y1 - 0.4, 0.25, lacquer), L - 0.5, (H + win.y1) / 2, i);
  add(slab(0.3, 0.25, win.z * 2, lacquer), L - 0.5, (H + win.y1) / 2, 0);
  // hanging lanterns, lit, swaying
  for (const [x, z] of o.lanterns || [[17, -6.5], [17, 6.5]]) {
    const lan = new THREE.Group();
    const lamp = hangingLantern();
    lamp.scale.setScalar(1.5);
    // indoors the lanterns glow softly rather than blaze
    lamp.traverse((m) => { if (m.isMesh && m.material === M.lantern) m.material = teaLanternMat; });
    lamp.position.y = -4.5;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 4), beam);
    cord.position.y = -1.6;
    const light = new THREE.PointLight("#ffb068", 9, 34, 1.6);
    light.position.y = -4.5;
    lan.add(lamp, cord, light);
    lan.position.set(x, H, z);
    g.add(lan);
    room.lanterns.push(lan);
  }
  // a soft warm fill so the corners aren't black
  const fill = new THREE.PointLight("#ffd8a8", 5, 60, 1.4);
  fill.position.set(-6, 14, 0);
  g.add(fill);
  // a cup of tea with a little wisp of steam
  const cupGeo = new THREE.LatheGeometry([[0, 0], [0.45, 0.02], [0.62, 0.35], [0.72, 0.85], [0.68, 0.88]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
  const teaMat = smooth("#9c6b2c", { roughness: 0.1 });
  const cup = (x, y, z) => {
    add(new THREE.Mesh(cupGeo, porcelain()), x, y, z).scale.setScalar(0.75);
    const liq = new THREE.Mesh(new THREE.CircleGeometry(0.47, 20), teaMat);
    liq.rotation.x = -Math.PI / 2; liq.position.set(x, y + 0.54, z); g.add(liq);
    room.steamFrom.push(new THREE.Vector3(x, y + 0.7, z));
  };
  const cushion = (x, z, color) => { const c = add(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.7, 5.2, 4, 1, 4), smooth(color, { roughness: 0.95 })), x, 0.35, z); c.geometry.attributes.position.array.forEach((v, i, a) => { if (i % 3 === 1 && v > 0) a[i] = v * 0.7; }); return c; };
  const lowTable = () => {
    add(slab(7.5, 0.6, 13, lacquer), 0, 3.1, 0);
    add(slab(7.7, 0.25, 13.2, smooth("#8c1f19", { roughness: 0.4 })), 0, 2.75, 0);
    for (const [x, z] of [[-3.2, -5.8], [3.2, -5.8], [-3.2, 5.8], [3.2, 5.8]]) add(slab(0.7, 2.8, 0.7, lacquer), x, 1.4, z);
  };
  return { room, g, add, slab, smooth, lacquer, beam, plaster, cup, cushion, lowTable, L, Wz, H };
}
function finishRoom({ room, g }) {
  for (let i = 0; i < 40; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: "#ffffff", transparent: true, depthWrite: false, opacity: 0 }));
    g.add(sp);
    room.steam.push({ s: sp, life: 0, src: 0, v: new THREE.Vector3() });
  }
  room.isle.root.add(g);
  bake(g, [...room.lanterns, ...room.steam.map((p) => p.s), ...room.keep]);
  g.visible = false;
  ROOMS[room.isle.id] = room;
}

// About me: the tea room. A low table with a porcelain pot and two cups, cushions for you and a
// guest, a plum branch, a bonsai pine and an incense burner
function teaRoom(isle) {
  const c = roomShell(isle, { chars: "龍騰雲海" }), { room, g, add, slab, smooth } = c;
  c.lowTable();
  add(slab(4.4, 0.25, 6.5, smooth("#6b3f22")), 0, 3.52, 0);
  const pot = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.9, 0.05], [1.35, 0.5], [1.45, 1.0], [1.3, 1.5], [0.85, 1.85], [0.7, 1.9]].map(([r, y]) => new THREE.Vector2(r, y)), 32), porcelain());
  const lid = new THREE.Mesh(new THREE.LatheGeometry([[0, 2.2], [0.25, 2.18], [0.3, 2.05], [0.75, 1.95], [0.78, 1.88]].map(([r, y]) => new THREE.Vector2(r, y)), 24), porcelain());
  const knob = at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), smooth("#b8322a", { roughness: 0.3 })), 0, 2.25, 0);
  const spout = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(1.2, 0.7, 0), new THREE.Vector3(1.8, 1.0, 0), new THREE.Vector3(2.2, 1.6, 0), new THREE.Vector3(2.35, 1.95, 0)]), 16, 0.18, 8), porcelain());
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.12, 8, 20, Math.PI * 1.2), smooth("#3d1f10", { roughness: 0.4 }));
  handle.position.set(-1.35, 1.0, 0); handle.rotation.z = Math.PI * 0.4;
  pot.add(body, lid, knob, spout, handle);
  pot.position.set(0.6, 3.65, 1.2); pot.rotation.y = -0.6; pot.scale.setScalar(0.72);
  pot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(pot);
  room.keep.push(pot);
  room.steamFrom.push(new THREE.Vector3(2.35, 1.95, 0).multiplyScalar(0.72).applyEuler(pot.rotation).add(pot.position));
  c.cup(-1.2, 3.65, -1.8); c.cup(1.4, 3.65, -2.4);
  c.cushion(-8.8, 0, "#7a1c24"); c.cushion(7.2, 0, "#2c3e5c");
  add(slab(3.4, 2.2, 3.4, c.lacquer), 14, 1.1, -10);
  add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.7, 0.05], [1.1, 0.8], [1.2, 1.6], [0.7, 2.6], [0.45, 3.2], [0.6, 3.5]].map(([r, y]) => new THREE.Vector2(r, y)), 28), porcelain()), 14, 2.2, -10);
  const plum = TREES.mei(0.55); plum.position.set(14, 5.2, -10); g.add(plum);
  const pine = TREES.huangshan(0.55); pine.position.set(16, 1.4, 9.5); g.add(pine);
  add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.8, 1.4, 20), smooth("#3c4250", { roughness: 0.4 })), 16, 0.7, 9.5);
  add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0.3], [0.9, 0.35], [1.1, 0.9], [0.9, 1.3], [0.95, 1.4]].map(([r, y]) => new THREE.Vector2(r, y)), 20), smooth("#8a6a3a", { metalness: 0.7, roughness: 0.35 })), -15, 0, 10);
  room.steamFrom.push(new THREE.Vector3(-15, 1.6, 10));
  finishRoom(c);
}

// Career: a scholar's study. A long desk with a laptop open on some code, a brush pot, an ink
// stone and a stack of books, with bookshelves along the walls
function studyRoom(isle) {
  const c = roomShell(isle, { chars: "鵬程萬里", floor: "wood" }), { room, g, add, slab, smooth, lacquer } = c;
  add(slab(7, 0.5, 14, lacquer), 0, 4.4, 0);
  for (const [x, z] of [[-3, -6.4], [3, -6.4], [-3, 6.4], [3, 6.4]]) add(slab(0.6, 4.2, 0.6, lacquer), x, 2.1, z);
  // the laptop: a dark aluminium base and a lid tipped back, its screen full of code
  const alu = smooth("#3a3d44", { metalness: 0.6, roughness: 0.35 });
  add(slab(2.6, 0.12, 3.8, alu), 0.4, 4.71, 0);
  const code = canvasTex(320, 210, (x, w, h) => {
    x.fillStyle = "#16181f"; x.fillRect(0, 0, w, h);
    const cols = ["#c678dd", "#61afef", "#98c379", "#e5c07b", "#abb2bf", "#e06c75"];
    for (let r = 0; r < 13; r++) {
      let px = 14 + (r % 4) * 14;
      for (let k = 0; k < 2 + ((r * 7) % 4); k++) { const len = 20 + ((r * 13 + k * 29) % 60); x.fillStyle = cols[(r + k * 3) % cols.length]; x.fillRect(px, 12 + r * 15, len, 6); px += len + 8; }
    }
  });
  const lid = new THREE.Group();
  lid.position.set(1.65, 4.77, 0);
  lid.rotation.z = -0.28;
  lid.add(at(slab(0.12, 2.5, 3.8, alu), 0, 1.25, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.3), new THREE.MeshBasicMaterial({ map: code }));
  screen.rotation.y = -Math.PI / 2;
  lid.add(at(screen, -0.07, 1.25, 0));
  g.add(lid);
  room.keep.push(lid);
  const glow = new THREE.PointLight("#8fb6ff", 2.5, 12, 2);
  glow.position.set(-0.5, 6, 0);
  g.add(glow);
  // brush pot with brushes, an ink stone, a stack of books
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 16), porcelain()), -1.6, 5.45, 5);
  for (let i = 0; i < 5; i++) { const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3, 6), smooth("#a8743a")), -1.6 + Math.cos(i * 1.3) * 0.25, 6.6, 5 + Math.sin(i * 1.3) * 0.25); b.rotation.set(Math.sin(i * 1.3) * 0.25, 0, -Math.cos(i * 1.3) * 0.25); }
  add(slab(1.6, 0.3, 2.6, smooth("#1c1a1c", { roughness: 0.3 })), -1.8, 4.8, -4.6);
  ["#7a1c14", "#2c3e5c", "#c8a14a", "#3c5a3a"].forEach((col, i) => add(slab(2.2 - i * 0.1, 0.45, 3 - i * 0.15, smooth(col)), 1.4, 4.88 + i * 0.46, -4.8).rotation.y = (i % 2 ? 0.12 : -0.08));
  c.cup(1.4, 4.65, 3.4);
  c.cushion(-8.8, 0, "#2c3e5c");
  // bookshelves against both side walls
  const bookCols = ["#7a1c14", "#2c3e5c", "#c8a14a", "#3c5a3a", "#5a3220", "#e9dcc0"];
  for (const s of [-1, 1]) for (const x0 of [-17, 8]) {
    const z = s * (c.Wz - 1.6);
    add(slab(9, 13, 0.4, lacquer), x0, 6.5, s * (c.Wz - 0.5));
    for (const xx of [x0 - 4.4, x0 + 4.4]) add(slab(0.4, 13, 2.4, lacquer), xx, 6.5, z);
    for (let k = 0; k < 5; k++) {
      const y = 0.4 + k * 3;
      add(slab(9, 0.3, 2.4, lacquer), x0, y, z);
      if (k === 4) continue;
      let x = x0 - 4;
      while (x < x0 + 3.6) { const w = 0.35 + rand() * 0.35, h = 1.8 + rand() * 0.8; add(slab(w, h, 1.6, smooth(bookCols[Math.floor(rand() * bookCols.length)])), x + w / 2, y + 0.15 + h / 2, z); x += w + 0.04; }
    }
  }
  finishRoom(c);
}

// Community: a hosting hall. A mahjong table mid-game with stools round it, more lanterns, and
// snacks and tea laid out by the window
function hallRoom(isle) {
  const c = roomShell(isle, { chars: "群英聚會", floor: "carpet", lanterns: [[17, -6.5], [17, 6.5], [-2, -7], [-2, 7]] }), { g, add, slab, smooth, lacquer } = c;
  const felt = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = "#1f5a46"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(255,255,255,0.08)"; for (let i = 0; i < 60; i++) { x.beginPath(); x.moveTo(Math.random() * w, Math.random() * h); x.lineTo(Math.random() * w, Math.random() * h); x.stroke(); }
    x.strokeStyle = "#c8a14a"; x.lineWidth = 4; x.strokeRect(10, 10, w - 20, h - 20);
  });
  const T = 3; // the table stands a little way off, toward the window
  add(slab(7, 0.5, 7, lacquer), T, 3.6, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.08, 6.3), new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95 })), T, 3.88, 0);
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) add(slab(0.5, 3.4, 0.5, lacquer), T + x, 1.7, z);
  // a wall of tiles in front of each seat, and a few discards face up in the middle
  const tileMat = smooth("#f6f0e2", { roughness: 0.4 }), backMat = smooth("#2f7a5b", { roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    for (let j = -4; j <= 4; j++) {
      const t = add(slab(0.4, 0.55, 0.28, j % 2 ? tileMat : backMat), T + Math.cos(a) * 2.4 - Math.sin(a) * j * 0.44, 4.2, Math.sin(a) * 2.4 + Math.cos(a) * j * 0.44);
      t.rotation.y = -a + Math.PI / 2;
    }
  }
  for (let k = 0; k < 7; k++) add(slab(0.4, 0.14, 0.55, tileMat), T - 0.8 + (k % 4) * 0.55, 3.98, -0.4 + Math.floor(k / 4) * 0.8).rotation.y = (k * 0.37) % 0.4;
  // round stools for the other three players
  for (const [x, z] of [[T + 6, 0], [T, -6], [T, 6]]) { add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.4, 3, 16), smooth("#7a1c14", { roughness: 0.5 })), x, 1.5, z); add(new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.3, 16), smooth("#c8a14a")), x, 3.1, z); }
  c.cup(T - 2.2, 3.92, -2.2);
  // a side table of snacks and tea by the window
  add(slab(4, 3, 6, lacquer), 14, 1.5, -9);
  for (const [x, z, col] of [[13.4, -10.5, "#e8b04a"], [14.6, -8.4, "#c84a2a"], [13.6, -7.2, "#7ab04a"]]) {
    add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.6, 0.05], [1, 0.5], [1.1, 0.6]].map(([r, y]) => new THREE.Vector2(r, y)), 20), porcelain()), x, 3, z);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), smooth(col)), x, 3.3, z);
  }
  c.cup(14.2, 3, -11.6);
  finishRoom(c);
}

// Content: a little studio. A camera on a tripod and a ring light aimed at your seat, with the
// three eras' reel covers hung along the wall like scrolls
function studioRoom(isle) {
  const c = roomShell(isle, { chars: "光影人生", floor: "wood" }), { room, g, add, slab, smooth, lacquer } = c;
  c.cushion(-8.8, 0, "#7a1c24");
  add(slab(4, 2.4, 6, lacquer), -4, 1.2, 0);
  c.cup(-3.4, 2.4, 2.2);
  // tripod and camera, looking back at you
  const metal = smooth("#202226", { metalness: 0.5, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6.4, 6), metal), 6 + Math.cos(a) * 1.1, 3, Math.sin(a) * 1.1);
    leg.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32);
  }
  add(slab(2.6, 1.7, 1.5, metal), 6, 6.6, 0);
  const lens = add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.4, 16), smooth("#111214", { metalness: 0.6, roughness: 0.25 })), 4.4, 6.6, 0);
  lens.rotation.z = Math.PI / 2;
  const rec = add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: "#ff3a2a" })), 5.1, 7.35, 0.6);
  room.keep.push(rec);
  // a ring light on a stand just behind it
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 6), metal), 8.5, 4.5, 3.4);
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.22, 10, 36), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff4e0", emissiveIntensity: 1.4 })), 8.4, 9.2, 3.4);
  ring.rotation.y = Math.PI / 2;
  const key = new THREE.PointLight("#fff1dc", 6, 30, 1.6);
  key.position.set(7.6, 9.2, 3.4);
  g.add(key);
  // the reel covers, one per era, framed like hanging scrolls along the wall
  const loader = new THREE.TextureLoader();
  ["assets/reels/mac_C6Ag1u-JsaU.jpg", "assets/reels/clu_DOM-X2tE10p.jpg", "assets/reels/own_DT1J-Zmk0KF.jpg"].forEach((src, i) => {
    const t = loader.load(ROOT + src);
    t.colorSpace = THREE.SRGBColorSpace;
    const x = -14 + i * 9, z = c.Wz - 0.45;
    add(slab(4.8, 8.4, 0.3, M.redDeep), x, 8.4, z);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7.5), new THREE.MeshBasicMaterial({ map: t }));
    pic.position.set(x, 8.4, z - 0.2); pic.rotation.y = Math.PI;
    g.add(pic);
    room.keep.push(pic);
  });
  finishRoom(c);
}

// Life: a traveller's room. A map of the route from Melbourne to Shanghai and San Francisco, a
// globe, a packed suitcase, and the graduation cap on the low table
function travelRoom(isle) {
  const c = roomShell(isle, { chars: "行萬里路" }), { room, g, add, slab, smooth, lacquer } = c;
  c.lowTable();
  c.cushion(-8.8, 0, "#2c3e5c");
  c.cup(1.6, 3.65, -3.6);
  // the mortarboard: a black board tipped at an angle, its cap and a gold tassel
  const cap = new THREE.Group();
  cap.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, 0.7, 20), smooth("#141416")), 0, 0.35, 0));
  const board = at(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 2.8), smooth("#141416")), 0, 0.75, 0);
  board.rotation.y = Math.PI / 4;
  cap.add(board, at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), smooth("#d6aa50")), 1.2, 0.3, 0), at(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), smooth("#d6aa50")), 1.2, -0.25, 0));
  cap.position.set(0.8, 3.4, 1.6);
  cap.rotation.y = 0.4;
  g.add(cap);
  room.keep.push(cap);
  // the route map on the left wall
  const map = canvasTex(1024, 512, (x, w, h) => {
    x.fillStyle = "#efe2c2"; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(90,130,150,0.22)"; x.fillRect(16, 16, w - 32, h - 32);
    x.fillStyle = "#c9b48a";
    const blob = (pts) => { x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); x.fill(); };
    blob([[150, 60], [330, 50], [360, 170], [300, 230], [230, 210], [170, 140]]); // Asia
    blob([[270, 330], [370, 320], [390, 420], [300, 440], [260, 390]]); // Australia
    blob([[690, 70], [880, 60], [900, 160], [820, 260], [740, 230], [700, 150]]); // North America
    const city = { mel: [340, 410, "Melbourne"], sha: [300, 160, "上海 Shanghai"], sf: [740, 170, "San Francisco"] };
    x.strokeStyle = "#b8322a"; x.lineWidth = 5; x.setLineDash([16, 12]);
    const arc = (a, b, lift) => { x.beginPath(); x.moveTo(a[0], a[1]); x.quadraticCurveTo((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - lift, b[0], b[1]); x.stroke(); };
    arc(city.mel, city.sha, 80); arc(city.sha, city.sf, 120); arc(city.mel, city.sf, -60);
    x.setLineDash([]);
    x.font = "600 30px 'EB Garamond', serif"; x.textAlign = "center";
    for (const [px, py, name] of Object.values(city)) { x.fillStyle = "#b8322a"; x.beginPath(); x.arc(px, py, 11, 0, Math.PI * 2); x.fill(); x.fillStyle = "#2a1d16"; x.fillText(name, px, py + 44); }
    x.strokeStyle = "#7a5a3a"; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8);
  });
  const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshStandardMaterial({ map, roughness: 0.9 }));
  mapMesh.position.set(-5, 8.6, -c.Wz + 0.35);
  g.add(mapMesh);
  room.keep.push(mapMesh);
  add(slab(16.8, 8.8, 0.25, lacquer), -5, 8.6, -c.Wz + 0.2);
  // a globe on a stand and a packed suitcase by the window
  const globeTex = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = "#4f7d96"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#cdb98a";
    for (const [cx, cy, rx, ry] of [[120, 90, 60, 40], [150, 180, 30, 40], [280, 80, 90, 45], [330, 180, 40, 25], [430, 90, 50, 50]]) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0.3, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = "rgba(255,255,255,0.25)"; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, (h / 6) * i); x.lineTo(w, (h / 6) * i); x.stroke(); }
  });
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.2, 4.6, 12), lacquer), 15, 2.3, 9);
  const globe = add(new THREE.Mesh(new THREE.SphereGeometry(2, 28, 18), new THREE.MeshStandardMaterial({ map: globeTex, roughness: 0.5 })), 15, 6.4, 9);
  globe.rotation.z = 0.4;
  room.keep.push(globe);
  const merid = add(new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.08, 6, 32), smooth("#c8a14a", { metalness: 0.6, roughness: 0.3 })), 15, 6.4, 9);
  merid.rotation.z = 0.4;
  const leather = smooth("#7a3a1c", { roughness: 0.6 });
  add(slab(2.4, 4.6, 5.6, leather), 15.5, 2.3, -9);
  for (const z of [-10.6, -7.4]) add(slab(2.5, 4.7, 0.3, smooth("#3a1c0e")), 15.5, 2.3, z);
  const handle = add(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 6, 16, Math.PI), smooth("#3a1c0e")), 15.5, 4.6, -9);
  handle.rotation.y = Math.PI / 2;
  finishRoom(c);
}
const ROOM_FOR = { hall: teaRoom, pagoda: studyRoom, pavilion: hallRoom, teahouse: studioRoom, gate: travelRoom };
function buildRooms() { for (const isle of ISLES) ROOM_FOR[isle.kind]?.(isle); }

const fade = $("#fade");
const fadeTo = (o, ms) => new Promise((r) => { fade.style.transitionDuration = `${ms}ms`; fade.style.opacity = o; setTimeout(r, ms); });
async function enterTea(isle) {
  const room = ROOMS[isle?.id];
  if (TEA.active || !room) return;
  await fadeTo(1, REDUCE ? 0 : 320);
  TEA.active = true;
  TEA.room = room;
  room.group.visible = true;
  // the other buildings are smaller than their rooms: hide the outside while you're in
  if (isle.id !== "home") isle.bld.visible = false;
  TEA.yaw = 0; TEA.pitch = 0.02; TEA.fov = 50;
  camera.fov = 62;
  setDragonVisible(false);
  document.body.classList.add("tea");
  Sound.shoji();
  await fadeTo(0, REDUCE ? 0 : 700);
}
async function leaveTea() {
  if (!TEA.active) return;
  await fadeTo(1, REDUCE ? 0 : 280);
  const room = TEA.room;
  TEA.active = false;
  TEA.room = null;
  room.group.visible = false;
  room.isle.bld.visible = true;
  document.body.classList.remove("tea");
  setDragonVisible(!MP.dead);
  await fadeTo(0, REDUCE ? 0 : 500);
}
function updateTea(dt, t) {
  if (!TEA.active) return;
  const room = TEA.room;
  const g = room.group;
  g.updateMatrixWorld();
  const eye = g.localToWorld(room.seat.clone().add(tmp.set(0, Math.sin(t * 0.8) * 0.04, 0)));
  // forward in the room's frame: yaw 0 looks out of the window (+x)
  const f = new THREE.Vector3(Math.cos(TEA.pitch) * Math.cos(TEA.yaw), Math.sin(TEA.pitch), Math.cos(TEA.pitch) * Math.sin(-TEA.yaw));
  camera.position.copy(eye);
  camera.lookAt(g.localToWorld(room.seat.clone().add(f)));
  camera.fov += (TEA.fov - camera.fov) * (1 - Math.exp(-dt * 1.6)); // a slow settle as you sit down
  camera.updateProjectionMatrix();
  sunLight.position.copy(eye).addScaledVector(sunDir, 400);
  sunLight.target.position.copy(eye);
  for (const [k, l] of room.lanterns.entries()) { l.rotation.z = Math.sin(t * 1.3 + k * 2) * 0.05; l.rotation.x = Math.cos(t * 1.1 + k) * 0.03; }
  // steam curls up from the pot and cups and fades
  for (const p of room.steam) {
    if (p.life <= 0) {
      if (rand() > 0.12) continue;
      p.src = Math.floor(rand() * room.steamFrom.length);
      p.s.position.copy(room.steamFrom[p.src]);
      p.v.set(rr(-0.15, 0.15), rr(0.6, 1.1), rr(-0.15, 0.15));
      p.life = p.max = rr(2, 3.4);
    }
    p.life -= dt;
    const u = 1 - p.life / p.max;
    p.s.position.addScaledVector(p.v, dt);
    p.s.position.x += Math.sin(t * 1.7 + p.src) * 0.2 * dt;
    const sc = 0.25 + u * 1.3;
    p.s.scale.set(sc, sc * 1.4, 1);
    p.s.material.opacity = 0.12 * Math.sin(Math.PI * Math.min(1, u));
  }
}

// ---------- boot ----------
const pct = $("#load-pct");
const step = (n) => new Promise((r) => { pct.textContent = `${n}%`; requestAnimationFrame(() => setTimeout(r, 0)); });
(async () => {
  await document.fonts?.ready;
  for (let i = 0; i < ISLES.length; i++) { await step(Math.round(((i + 1) / ISLES.length) * 85)); makeIsle(ISLES[i]); }
  for (const isle of ISLES) islandFalls(isle);
  buildBridges();
  buildRooms();
  setSeason(seasonName);
  for (const [k, list] of Object.entries(SEASON_MATS())) if (seasonGoal[k]) for (const m of list) m.color.copy(seasonGoal[k]);
  await step(95);
  renderer.compile(scene, camera);
  await step(100);
  $("#loading").classList.add("gone");
  const stage = initStage({ onGesture, onFrame: drawDial, drawSkeleton: false });
  // the hand camera can be switched on and off any time from the top bar
  const camBtn = $("#cam-btn");
  const paintCam = () => {
    const on = document.body.classList.contains("cam-on");
    camBtn.setAttribute("aria-pressed", String(on));
    camBtn.querySelector("span").textContent = on ? "hand on" : "hand off";
  };
  new MutationObserver(paintCam).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  camBtn.addEventListener("click", async () => {
    if (stage.camOn) { stage.stopCamera(); ext.turn = ext.fwd = ext.vert = 0; }
    else { camBtn.querySelector("span").textContent = "starting…"; await stage.startCamera(); }
    paintCam();
  });
  paintCam();
  // any click, tap or key press starts the audio (also after arriving on a #island link that
  // skips the start screen) and wakes it if the browser suspended it in the background
  const wake = () => Sound.wake();
  for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, wake, { passive: true });
  const startObs = new MutationObserver(() => {
    if (!document.body.classList.contains("started")) return;
    started = true;
    document.activeElement?.blur?.();
    startObs.disconnect();
    if (!MP.on) joinBattle(savedName());
    Sound.begin();
    takeLock();
    setTimeout(ghostHints, 1200);
  });
  startObs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  const deep = ISLES.find((i) => `#${i.id}` === location.hash);
  if (deep) { started = true; $("#entry").classList.add("gone"); document.body.classList.add("started"); openPanel(deep); }
})();

// ?debug exposes the flight state for testing from the console
if (new URLSearchParams(location.search).has("debug")) window.__isles = { D, PILLARS, MASSIFS, ISLES, flyTo, setFirstPerson, openPanel, balls, falling, shoot, cam, birds, Sound, MP, drawDial, render, segs, renderer, scene, get wind() { return windAmt; }, get LOCK() { return LOCK; }, streakMat };
const clock = new THREE.Clock();
// ---------- mouse control ----------
// On a desktop the cursor is captured once the journey begins (pointer lock), like a flight or
// block game: moving the mouse steers (left/right turns, up/down climbs or dives where you look),
// clicking or holding breathes fire. Hold Tab to get the cursor back with the island plaques
// (numbered, and 1-5 fly there from anywhere) and the who's-flying board; Esc opens the game
// menu with the settings and links. Scrolls and the tea room free the cursor too, and the
// next click or key press takes the reins again. Touch screens keep their own controls.
const FINE = matchMedia("(pointer: fine)").matches && "requestPointerLock" in canvas;
const LOCK = { on: false, ours: false, tab: false, paused: false, held: false, pausedAt: 0, broken: false, misses: 0 };
// some embedded browsers refuse pointer lock outright: then fall back to click-to-fire and drag-to-look
const mouseMode = () => FINE && !LOCK.broken;
const lockFailed = (e) => { if (/WrongDocument|NotSupported|not supported|not valid/i.test(String(e?.name || e))) LOCK.broken = true; };
const MOUSE = { pitch: 0, moved: 0 };
const pauseEl = $("#pause");
const wantsLock = () => mouseMode() && started && !panelOpen && !TEA.active && !LOCK.tab && !LOCK.paused && !MP.dead;
// some browsers (and extensions) ignore the request without a word: two clicks that go unanswered
// mean it's not coming, so drop to drag-to-look rather than keep asking
function lockGaveUp() {
  if (LOCK.on || LOCK.broken || ++LOCK.misses < 2) return;
  LOCK.broken = true;
  flash("this browser won't hand over the mouse · drag to look, F to breathe fire");
}
function takeLock(fromClick) {
  if (!wantsLock() || LOCK.on) return;
  if (fromClick) setTimeout(lockGaveUp, 900);
  try {
    const r = canvas.requestPointerLock({ unadjustedMovement: true });
    if (r && r.catch) r.catch((e) => { lockFailed(e); if (!LOCK.broken) try { canvas.requestPointerLock()?.catch?.(lockFailed); } catch (e2) { lockFailed(e2); } });
  } catch (e) { lockFailed(e); if (!LOCK.broken) try { canvas.requestPointerLock(); } catch (e2) { lockFailed(e2); } }
}
function freeLock() {
  if (!document.pointerLockElement) return;
  LOCK.ours = true;
  document.exitPointerLock();
}
document.addEventListener("pointerlockchange", () => {
  LOCK.on = document.pointerLockElement === canvas;
  if (LOCK.on) LOCK.misses = 0;
  document.body.classList.toggle("locked", LOCK.on);
  if (LOCK.on && !LOCK.told) { LOCK.told = true; flash("mouse steers · click to breathe fire · hold Tab for islands · Esc for the menu"); }
  // lost without us asking (the browser's Esc): open the game menu
  if (!LOCK.on && !LOCK.ours && started && !panelOpen && !LOCK.tab && !LOCK.paused) openPause();
  LOCK.ours = false;
  LOCK.held = false;
});
document.addEventListener("pointerlockerror", () => { LOCK.on = false; });
// steering: the mouse turns the dragon and sets where it's pointed up or down
document.addEventListener("mousemove", (e) => {
  if (!LOCK.on) return;
  const mx = e.movementX || 0, my = e.movementY || 0;
  // auto-flight keeps the reins: a stray mouse nudge shouldn't drop it mid-route (keys still do)
  if (D.auto) return;
  D.yaw -= mx * 0.0022;
  D.uturn = undefined;
  MOUSE.pitch = THREE.MathUtils.clamp(MOUSE.pitch - my * 0.0022, -0.85, 0.85);
  if (my) MOUSE.moved = performance.now();
});
// clicks: with the reins taken, a click (or a held button) breathes fire; otherwise it takes them
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (LOCK.on) { LOCK.held = true; shoot(); }
  else if (mouseMode()) takeLock(true);
});
addEventListener("mouseup", (e) => { if (e.button === 0) LOCK.held = false; });
function openPause() {
  if (LOCK.paused || !started) return;
  LOCK.paused = true;
  LOCK.pausedAt = performance.now();
  keys.clear();
  const panel = $("#settings-panel");
  $("#pause-settings").appendChild(panel);
  panel.hidden = false;
  pauseEl.hidden = false;
  $("#resume").focus();
}
function closePause() {
  if (!LOCK.paused) return;
  LOCK.paused = false;
  const panel = $("#settings-panel");
  panel.hidden = true;
  $("#settings-btn").after(panel);
  pauseEl.hidden = true;
  canvas.focus?.();
  takeLock();
}
$("#resume").addEventListener("click", closePause);
pauseEl.addEventListener("click", (e) => { if (e.target === pauseEl) closePause(); });
// Tab: hold for the cursor, the island plaques and the who's-flying board
function tabOn() {
  if (LOCK.tab || !started || panelOpen || LOCK.paused) return;
  LOCK.tab = true;
  document.body.classList.add("board", "tabbed");
  freeLock();
}
function tabOff() {
  if (!LOCK.tab) return;
  LOCK.tab = false;
  document.body.classList.remove("board", "tabbed");
  takeLock();
}
ISLES.forEach((isle, i) => isle.btn?.setAttribute("data-key", String(i + 1)));
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input,textarea")) return;
  if (e.key === "Tab") { e.preventDefault(); if (!e.repeat) tabOn(); return; }
  if (isEsc(e)) {
    if (e.defaultPrevented) return; // it just closed a scroll
    // the Esc that the browser used to release the mouse can arrive here too: ignore it once
    if (LOCK.paused) { if (performance.now() - LOCK.pausedAt > 250) closePause(); return; }
    if (!panelOpen && started && !LOCK.on) openPause();
    return;
  }
  if (LOCK.paused) return;
  // 1-5 fly to an island
  const n = /^Digit([1-5])$/.exec(e.code);
  if (n && started && !panelOpen) { flyTo(ISLES[+n[1] - 1]); return; }
  // any other key while playing takes the reins back (a key press counts as a gesture)
  takeLock();
});
addEventListener("keyup", (e) => { if (e.key === "Tab") tabOff(); });
addEventListener("blur", () => { if (LOCK.tab) tabOff(); });
// every frame: hold-to-fire and the camera tilting with the dragon's aim
function updateMouse() {
  if (LOCK.on && LOCK.held) shoot();
  if (LOCK.on && !firstPerson) cam.pitch += (0.32 - MOUSE.pitch * 0.32 - cam.pitch) * 0.08;
  if (!LOCK.on) MOUSE.pitch *= 0.9;
  // a still mouse eases the dragon back to level, so a glance up or down isn't an endless climb or dive
  else if (performance.now() - MOUSE.moved > 1000) MOUSE.pitch *= 0.985;
}

function frame() {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05), t = clock.elapsedTime;
  adaptResolution(raw);
  if (started) steer(dt); else { D.yaw += dt * 0.2; D.speed = 18; D.pos.x += Math.sin(D.yaw) * D.speed * dt; D.pos.z += Math.cos(D.yaw) * D.speed * dt; }
  animateDragon(t, dt);
  if (TEA.active) updateTea(dt, t); else updateCamera(dt);
  updateStreaks(dt);
  fireTime.value = t;
  updateFire(dt);
  updateTod(dt);
  updateSeason(dt);
  updateBridges(t);
  updateBirds(t);
  updatePlaques();
  updateBattle(dt, t);
  updateCrosshair();
  if (mouseMode()) updateMouse();
  checkNear();
  Sound.wind(Math.abs(D.speed) / 170, D.boost || (D.auto && D.autoSurge));
  for (const l of seaLayers) { l.t.offset.x += l.s * dt; l.t.offset.y += l.s * 0.6 * dt; }
  ribbonMat.uniforms.time.value = t;
  grassTime.value = t;
  for (const { g, v } of puffs) { g.position.x += v * dt; if (g.position.x > 800) g.position.x = -800; }
  for (const isle of ISLES) {
    if (!isle.root) continue;
    isle.root.position.y = isle.pos[1] + Math.sin(t * 0.4 + isle.r) * 1.2;
    isle.ringWorld.y = isle.root.position.y;
    isle.ring.material.opacity = 0.55 + 0.35 * Math.sin(t * 3);
    // signs grow gently with distance so they stay readable from afar: normal size within
    // about 250 units, easing up to twice the size by about 1300, and no bigger than that
    const far = THREE.MathUtils.smoothstep(camera.position.distanceTo(isle.label.getWorldPosition(tmp)), 250, 1300);
    const flare = isle.hot ? 1.25 + Math.sin(t * 6) * 0.05 : 1;
    isle.label.scale.set(64 * (1 + far) * flare, 32 * (1 + far) * flare, 1);
    for (const m of isle.beam.children) { m.material.uniforms.time.value = t; m.material.uniforms.power.value = isle.hot ? 2.6 : isle === near ? 0.35 : 1; }
    for (const o of isle.root.children[0].children) if (o.userData.spin !== undefined) { o.rotation.y += o.userData.spin * dt; o.position.y += Math.sin(t + o.userData.bob) * 0.02; }
  }
  composer.render();
  requestAnimationFrame(frame);
}
frame();
