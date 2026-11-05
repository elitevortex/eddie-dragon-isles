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

const $ = (s) => document.querySelector(s);
const ROOT = document.documentElement.dataset.root ?? "../";
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CH = Object.fromEntries((window.CHAPTERS || []).map((c) => [c.id, c]));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- the islands ----------
const ISLES = [
  { id: "home", zh: "家", zh2: "家园", en: "Home", sub: "about eddie", pos: [0, 0, 0], r: 86, kind: "hall" },
  { id: "career", zh: "业", zh2: "事业", en: "Career", sub: "internships to lyra", pos: [480, 40, -230], r: 74, kind: "pagoda",
    chapters: ["first-internships", "atlassian", "fastrack", "culture-amp", "lyra"],
    lede: "Internships that kept getting bigger: Deloitte and Monash, Atlassian in Sydney, a startup through Fastrack, Culture Amp, then forward deployed at Lyra." },
  { id: "community", zh: "群", zh2: "社群", en: "Community", sub: "mac and hosting", pos: [-465, 15, -280], r: 77, kind: "pavilion",
    chapters: ["monash-mac", "leading-mac", "hosting"],
    lede: "The thing I've always cared about most. Running Monash's coding club, then hosting rooms for Melbourne engineers after I graduated." },
  { id: "content", zh: "影", zh2: "影像", en: "Content", sub: "skits, ugc, my story", pos: [-370, 62, 400], r: 67, kind: "teahouse",
    chapters: ["content"],
    lede: "Skits for MAC, growth work at Cluely, then my own story on @eddie_chann. Three eras, each for a different reason." },
  { id: "life", zh: "旅", zh2: "人生", en: "Life", sub: "shanghai, grad, sf", pos: [420, -6, 420], r: 74, kind: "gate",
    chapters: ["shanghai", "graduation", "sf"],
    lede: "Mandarin in Shanghai with trips out to the Great Wall, graduating with Mum and Dad there, and a first flight to San Francisco." },
];
const INTRO = "Forward Deployed Engineer at Lyra. Before that: Atlassian, Culture Amp, Deloitte and Monash. Along the way I led Monash's coding club, made content watched millions of times, and started hosting rooms for Melbourne engineers.";

// ---------- renderer ----------
const canvas = $("#world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
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
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: sunDir } },
    vertexShader: "varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: `uniform vec3 sun; varying vec3 vd;
      void main(){
        float h = vd.y;
        vec3 top = vec3(0.16,0.15,0.32), mid = vec3(0.78,0.47,0.52), hor = vec3(0.98,0.74,0.52), low = vec3(0.95,0.82,0.72);
        vec3 c = h > 0. ? mix(hor, mix(mid, top, smoothstep(0.15, 0.7, h)), smoothstep(0.0, 0.18, h)) : mix(hor, low, smoothstep(0., -0.2, h));
        float s = max(dot(vd, sun), 0.);
        c += vec3(1.0,0.75,0.45) * pow(s, 18.) * 0.6 + vec3(1.,0.95,0.8) * smoothstep(0.9985, 0.9993, s);
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  scene.add(sky);
}
scene.add(new THREE.HemisphereLight("#ffd9b8", "#5a4466", 0.9));
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
    seaLayers.push({ t, s: 0.0025 + k * 0.0018 });
  }
}
// Zhangjiajie-style sandstone pillars rising out of the cloud sea: slender spires to massive
// fused towers, banded with strata, split by vertical fissures, ledged and mossy, crowned with
// pines. Each pillar is one merged mesh (rock and pines) with its base at the origin, so a
// fireball can topple the whole thing.
const PILLARS = [];
{
  const rock = new THREE.Color("#b7a58f"), band = new THREE.Color("#8a786b"), dark = new THREE.Color("#57505c"),
    moss = new THREE.Color("#4d6e45"), lichen = new THREE.Color("#d2c6ae"), pineA = new THREE.Color("#2f5a45"), pineB = new THREE.Color("#3e6a4c");
  const mat = std("#ffffff", { vertexColors: true });
  const PINE = new THREE.ConeGeometry(3.2, 9, 7);
  PINE.translate(0, 4.5, 0);
  const tint = (g, fn) => {
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const c = fn(i, p); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  };
  function column(h, r, ox, oz) {
    const rings = Math.max(10, Math.round(h / 6));
    const g = new THREE.CylinderGeometry(r * rr(0.72, 0.92), r, h, 18, rings);
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
      p.setX(i, x * k); p.setZ(i, z * k);
      const c = rock.clone().lerp(band, 0.5 + 0.5 * Math.sin(ring * 0.9 + ph)).lerp(dark, (1 - t) * 0.55 + fis * 0.45);
      if (noise(a * 3 + ph, t * 9) > 0.72) c.lerp(lichen, 0.35);
      if (ring % ledge === 0 || noise(a * 2.2 + ph, t * 5) > 0.74) c.lerp(moss, 0.5);
      if (t > 0.9) c.lerp(moss, Math.min(1, (t - 0.9) * 10));
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
    return new THREE.Mesh(geo, mat);
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
      PILLARS.push({ x, z, r: r * 1.15, top: base + h + 8, base, h, mesh: m, alive: true });
    }
  };
  for (let i = 0; i < 34; i++) { const a = (i / 34) * Math.PI * 2 + rr(-0.08, 0.08), d = rr(1150, 1900); placeCluster(Math.cos(a) * d, Math.sin(a) * d, 3 + Math.floor(rand() * 4), 420, 780, 26, 95); }
  for (let i = 0; i < 30; i++) { const a = rand() * Math.PI * 2, d = rr(700, 1100); placeCluster(Math.cos(a) * d, Math.sin(a) * d, 2 + Math.floor(rand() * 3), 300, 560, 16, 70); }
  for (let i = 0; i < 14; i++) { const a = rand() * Math.PI * 2, d = rr(200, 680); placeCluster(Math.cos(a) * d, Math.sin(a) * d, 1 + Math.floor(rand() * 2), 220, 380, 10, 42); }
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
    puffs.push({ g, v: rr(2, 6) });
  }
}
// sky lanterns slowly rising
const lanterns = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 0.8, 2.2, 8), M.lantern, 70);
const lanternData = [];
{
  const m = new THREE.Matrix4();
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, d = rr(60, 650);
    lanternData.push({ x: Math.cos(a) * d, y: rr(-120, 220), z: Math.sin(a) * d, v: rr(2, 5), ph: rand() * 6 });
    lanterns.setMatrixAt(i, m);
  }
  scene.add(lanterns);
}

// wind streaks that rush past when the dragon picks up speed
const STREAKS = 240;
const streakPos = new Float32Array(STREAKS * 6);
const streakGeo = new THREE.BufferGeometry();
streakGeo.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
const streakMat = new THREE.LineBasicMaterial({ color: "#fff6e8", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const streaks = new THREE.LineSegments(streakGeo, streakMat);
streaks.frustumCulled = false;
scene.add(streaks);
const streakData = Array.from({ length: STREAKS }, () => new THREE.Vector3(rr(-70, 70), rr(-40, 45), rr(-90, 90)));
let windAmt = 0; // 0 calm .. 1 full surge, also drives the scale flutter
function updateStreaks(dt, origin) {
  const target = THREE.MathUtils.clamp((Math.abs(D.speed) - 40) / 130, 0, 1);
  windAmt += (target - windAmt) * (1 - Math.exp(-dt * 3));
  streakMat.opacity = windAmt * windAmt * 0.8;
  if (windAmt < 0.01) return;
  const f = new THREE.Vector3(Math.sin(D.yaw), 0, Math.cos(D.yaw)), sv = new THREE.Vector3(f.z, 0, -f.x);
  const len = 3 + windAmt * 16;
  streakData.forEach((p, i) => {
    p.z -= (Math.abs(D.speed) * 1.6 + 30) * dt;
    if (p.z < -90) p.set(rr(-70, 70), rr(-40, 45), 90);
    const ax = origin.x + sv.x * p.x + f.x * p.z, ay = origin.y + p.y, az = origin.z + sv.z * p.x + f.z * p.z;
    streakPos.set([ax, ay, az, ax - f.x * len, ay - D.vy * 0.02 * len, az - f.z * len], i * 6);
  });
  streakGeo.attributes.position.needsUpdate = true;
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

// ---------- buildings, one style per island ----------
const BUILD = {
  hall(isle) {
    const g = new THREE.Group();
    g.add(at(box(40, 3, 28, M.stone), 0, 1.5, 0), at(box(14, 1.5, 6, M.stone), 0, 0.75, 16));
    g.add(at(box(32, 11, 18, M.wall), 0, 8.5, 0), at(box(7, 8, 0.6, M.redDeep), 0, 7, 9.1));
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
  g.fillText(isle.en.toLowerCase(), 200, 96);
  g.font = "500 34px 'IBM Plex Sans', sans-serif"; g.fillStyle = "#f6dcae";
  g.fillText(isle.sub, 204, 160);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, fog: false }));
  s.scale.set(44, 22, 1);
  return s;
}

// ---------- build every island ----------
const clickables = [];
function makeIsle(isle) {
  const root = new THREE.Group();
  root.position.fromArray(isle.pos);
  root.add(islandBody(isle.r));
  // the building faces the home island (or +z for home)
  const face = isle.id === "home" ? 0 : Math.atan2(-isle.pos[0], -isle.pos[2]);
  const { g, h, br } = BUILD[isle.kind](isle);
  const holder = new THREE.Group();
  holder.rotation.y = face;
  holder.position.set(-Math.sin(face) * isle.r * 0.18, 0, -Math.cos(face) * isle.r * 0.18);
  holder.add(g);
  root.add(holder);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // landing ring in front of the door
  const fwd = new THREE.Vector3(Math.sin(face), 0, Math.cos(face));
  const ringPos = fwd.clone().multiplyScalar(isle.r * 0.55);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6, 8, 40), new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(ringPos).setY(0.15);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 90, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#ffcf73", transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.copy(ringPos).setY(45);
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
  // scatter trees around the rim, away from the door and building
  const n = Math.round(isle.r / 4.5);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = rr(br + 8, isle.r * 0.9);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const toRing = Math.hypot(x - ringPos.x, z - ringPos.z);
    if (toRing < 16) continue;
    const pick = rand();
    const t = pick < 0.45 ? pine(rr(0.8, 1.3)) : pick < 0.8 ? blossom(rr(0.8, 1.2)) : pick < 0.92 ? bamboo() : new THREE.Mesh(new THREE.DodecahedronGeometry(rr(1.5, 3.5), 0), M.stoneDark);
    t.position.set(x, 0, z);
    t.rotation.y = rand() * 6;
    root.add(t);
  }
  const label = labelSprite(isle);
  label.position.set(holder.position.x, h + 18, holder.position.z);
  label.userData.isle = isle;
  root.add(label);
  clickables.push(label);
  scene.add(root);
  Object.assign(isle, { root, ring, beam, label, face, br, bh: h, ringWorld: ringPos.clone().add(root.position), center: new THREE.Vector3().fromArray(isle.pos).add(holder.position) });
}

// a waterfall pouring off the home island into the mist
function waterfall(isle, angle) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 256;
  const g = c.getContext("2d");
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${rr(0.2, 0.8)})`; g.fillRect(rr(0, 64), rr(0, 256), rr(1, 4), rr(20, 70)); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 3);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 150), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, color: "#dff3ff", depthWrite: false, side: THREE.DoubleSide }));
  const x = Math.cos(angle) * (isle.r + 0.5), z = Math.sin(angle) * (isle.r + 0.5);
  m.position.set(x, -75, z);
  m.lookAt(x * 2, -75, z * 2);
  isle.root.add(m);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 20), M.water);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(Math.cos(angle) * (isle.r - 9), 0.2, Math.sin(angle) * (isle.r - 9));
  isle.root.add(pond);
  return t;
}

// ---------- the dragon ----------
const N = 56, SP = 2.05;
const dragon = new THREE.Group();
scene.add(dragon);
const RED = new THREE.Color("#c0221b"), RED2 = new THREE.Color("#8f1712"), BELLY = new THREE.Color("#f2d07e");
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
const radius = (i) => { const t = i / (N - 1); return 0.3 + 2.25 * Math.pow(1 - t, 0.75) * (t < 0.07 ? 0.78 + t * 3 : 1); };
const segs = [], fins = [];
// one skinned tube for the whole body; the per-segment objects are anchors for fins and legs
const RS = 14;
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
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.1, 5), i % 2 ? maneMat : finMat);
    fin.scale.z = 0.3;
    fin.position.y = 1.0;
    const piv = new THREE.Group();
    piv.position.set(0, 0.85, 0);
    piv.rotation.x = -0.8;
    piv.add(fin);
    m.add(piv);
    fins.push({ piv, i });
  }
  dragon.add(m);
  segs.push({ p: new THREE.Vector3(0, 40, 90 + i * SP), m });
}
// five-claw imperial legs on two body segments
const legs = [];
const limbMat = std("#b8231c", { flatShading: false, roughness: 0.45, metalness: 0.2 });
const clawMat = std("#f3e2b0", { flatShading: false, roughness: 0.3, metalness: 0.3 });
for (const [si, ph] of [[8, 0], [27, Math.PI]]) {
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 1.5, 8), limbMat);
    upper.position.y = -0.75;
    const knee = at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), limbMat), 0, -1.5, 0);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.2, 8), limbMat);
    fore.position.set(0, -1.95, 0.35); fore.rotation.x = 0.7;
    const paw = at(new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), limbMat), 0, -2.35, 0.8);
    leg.add(upper, knee, fore, paw);
    for (let k = 0; k < 5; k++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 5), clawMat);
      const a = (k - 2) * 0.42;
      claw.position.set(Math.sin(a) * 0.3, -2.45, 0.8 + Math.cos(a) * 0.3);
      claw.rotation.set(1.3, 0, -a);
      leg.add(claw);
    }
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 5), maneMat);
    tuft.position.set(0, -1.5, -0.6); tuft.rotation.x = -2.2;
    leg.add(tuft);
    leg.position.set(side * 0.8, -0.6, 0);
    leg.rotation.z = side * 0.6;
    leg.scale.setScalar(0.62);
    segs[si].m.add(leg);
    legs.push({ leg, ph, side });
  }
}
// flame tail fan
const tailFlames = [];
{
  const tail = segs[N - 1].m;
  for (let k = 0; k < 9; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.7, 6, 6), k % 2 ? maneMat : finMat);
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
head.scale.setScalar(1.3);
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

  // eyes: glowing amber with slit pupils under heavy gold brows
  const eyeM = new THREE.MeshStandardMaterial({ color: "#ffd84a", emissive: "#ffb000", emissiveIntensity: 1.8, roughness: 0.2 });
  for (const s of [-1, 1]) {
    head.add(at(ball(0.62, 0.55, 0.5, skinDark), s * 1.15, 0.85, 1.6));
    head.add(at(ball(0.5, 0.46, 0.42, eyeM), s * 1.28, 0.85, 1.75));
    head.add(at(ball(0.07, 0.36, 0.1, M.dark, 8), s * 1.62, 0.85, 1.98));
    const brow = taper([[s * 0.6, 1.2, 2.6], [s * 1.3, 1.5, 1.7], [s * 1.7, 1.75, 0.6], [s * 2.0, 2.2, -0.8]], 0.38, gold);
    head.add(brow);
    // branching antlers
    const antler = new THREE.Group();
    antler.add(taper([[0, 0, 0], [0, 1.5, -0.6], [s * 0.3, 3.0, -1.8], [s * 0.5, 4.0, -3.4], [s * 0.4, 4.6, -5.2]], 0.34, clawMat));
    antler.add(taper([[0, 1.3, -0.5], [s * 0.2, 2.4, 0.3], [s * 0.3, 3.1, 0.4]], 0.17, clawMat));
    antler.add(taper([[s * 0.3, 2.9, -1.7], [s * 0.6, 4.1, -1.2], [s * 0.8, 4.8, -1.3]], 0.15, clawMat));
    antler.add(taper([[s * 0.5, 3.9, -3.3], [s * 0.9, 4.9, -3.0], [s * 1.1, 5.4, -3.2]], 0.12, clawMat));
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

// ---------- scales ----------
// overlapping plates over the back and flanks. Each one hinges at its front edge, so it lies
// flat in calm air and lifts and flutters as the wind picks up; at full surge a few peel away.
const SCALE_ROWS = [], SCALE_COLS = 11;
for (let i = 2; i < N - 3; i++) SCALE_ROWS.push(i);
const scaleGeo = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
scaleGeo.scale(0.62, 0.16, 0.85);
scaleGeo.translate(0, 0, -0.75); // pivot at the leading edge
const scaleMat = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.55, flatShading: true });
const scales = new THREE.InstancedMesh(scaleGeo, scaleMat, SCALE_ROWS.length * SCALE_COLS);
scales.castShadow = true;
scales.frustumCulled = false;
{
  const c = new THREE.Color(), deep = new THREE.Color("#a3150f"), bright = new THREE.Color("#e2362a"), tip = new THREE.Color("#f0b84a");
  for (let n = 0; n < scales.count; n++) {
    const j = n % SCALE_COLS, edge = Math.abs(j - (SCALE_COLS - 1) / 2) / ((SCALE_COLS - 1) / 2);
    c.copy(deep).lerp(bright, rand() * 0.6).lerp(tip, edge > 0.8 ? 0.6 : rand() < 0.08 ? 0.5 : 0);
    scales.setColorAt(n, c);
  }
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
  scene.add(pearl);
}

// ---------- flight state ----------
const D = { pos: new THREE.Vector3(0, 40, 90), yaw: Math.PI, speed: 0, vy: 0, pitch: 0, idle: 0, auto: null };
const keys = new Set();
const cam = { yaw: 0, pitch: 0.36, dist: 74, drag: false };
const ext = { turn: 0, fwd: 0, vert: 0 }; // touch stick and hand input
let started = false, panelOpen = false, near = null;

function steer(dt) {
  if (panelOpen) { D.speed *= Math.exp(-dt * 3); D.vy *= Math.exp(-dt * 3); return; }
  const k = (c) => keys.has(c);
  let fwd = (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0) + ext.fwd;
  let turn = (k("KeyA") || k("ArrowLeft") ? 1 : 0) - (k("KeyD") || k("ArrowRight") ? 1 : 0) + ext.turn;
  let vert = (k("Space") ? 1 : 0) - (k("KeyC") || k("KeyQ") ? 1 : 0) + ext.vert;
  const boost = (k("ShiftLeft") || k("ShiftRight")) && fwd > 0;
  if (boost && !D.boost) Sound.whoosh();
  D.boost = boost;
  const manual = fwd || turn || vert;
  if (manual) D.auto = null;
  if (D.auto) {
    const tgt = D.auto.ringWorld.clone().setY(D.auto.ringWorld.y + 14);
    const dx = tgt.x - D.pos.x, dz = tgt.z - D.pos.z, dist = Math.hypot(dx, dz);
    let dy = Math.atan2(dx, dz) - D.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    turn = THREE.MathUtils.clamp(dy * 2, -1, 1);
    fwd = Math.min(1, dist / 60) * (Math.abs(dy) > 1.2 ? 0.35 : 1);
    // climb over anything in the way, then settle onto the ring
    const cruise = dist > 90 ? Math.max(tgt.y, 70) : tgt.y;
    vert = THREE.MathUtils.clamp((cruise - D.pos.y) / 20, -1, 1);
    if (dist < 8 && Math.abs(tgt.y - D.pos.y) < 6) { D.auto = null; flash(`${near ? "press E to enter" : "landed"}`); }
  }
  D.idle = manual || D.auto ? 0 : D.idle + dt;
  // idle: drift in a lazy circle so the body keeps moving
  if (D.idle > 4 && !REDUCE) { fwd = 0.18; turn = 0.25; }
  D.yaw += turn * 1.9 * dt;
  const target = fwd * (boost ? 170 : 85);
  D.speed += (target - D.speed) * (1 - Math.exp(-dt * 2.5));
  D.vy += (vert * 55 - D.vy) * (1 - Math.exp(-dt * 3));
  D.pos.x += Math.sin(D.yaw) * D.speed * dt;
  D.pos.z += Math.cos(D.yaw) * D.speed * dt;
  D.pos.y += D.vy * dt;
  D.pitch += (Math.atan2(D.vy, Math.max(30, Math.abs(D.speed))) - D.pitch) * (1 - Math.exp(-dt * 4));
  collide();
}
function collide() {
  D.pos.y = THREE.MathUtils.clamp(D.pos.y, -140, 320);
  const flat = Math.hypot(D.pos.x, D.pos.z);
  if (flat > 1500) D.pos.multiplyScalar(1500 / flat).setY(D.pos.y);
  for (const c of PILLARS) {
    if (!c.alive || D.pos.y > c.top) continue;
    const dx = D.pos.x - c.x, dz = D.pos.z - c.z, d = Math.hypot(dx, dz);
    if (d < c.r) { D.pos.x = c.x + (dx / (d || 1)) * c.r; D.pos.z = c.z + (dz / (d || 1)) * c.r; }
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
  const move = Math.min(1, Math.abs(D.speed) / 60 + 0.25);
  for (let i = 0; i < N; i++) {
    const a = segs[Math.max(0, i - 1)].p, b = segs[Math.min(N - 1, i + 1)].p;
    tmp.subVectors(a, b).normalize();
    side.crossVectors(tmp, UP).normalize();
    const f = i / N;
    render[i].copy(segs[i].p)
      .addScaledVector(side, Math.sin(t * 4.2 - i * 0.38) * 1.1 * f * move)
      .addScaledVector(UP, Math.sin(t * 2.6 - i * 0.3) * 0.9 * (0.3 + f));
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
  // scales hinge open with the wind, each on its own flutter
  let n = 0;
  for (const i of SCALE_ROWS) for (let j = 0; j < SCALE_COLS; j++, n++) {
    const r = scaleFrame(i, j);
    const lift = 0.16 + 0.04 * Math.sin(t * 2 + i * 0.3) + windAmt * (0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * 17 + i * 0.9 + j * 1.7)));
    m4.makeBasis(sX, sY, TAN[i]).multiply(rotX.makeRotationX(lift));
    const k = r * 0.5;
    m4.scale(tmp.set(k, k, k * 1.1)).setPosition(sP);
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
  head.userData.jaw.rotation.x = 0.26 + Math.pow(Math.max(0, Math.sin(t * 0.7)), 8) * 0.38 + windAmt * 0.12;
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
  if (!cam.drag && Math.abs(D.speed) > 20) cam.yaw *= Math.exp(-dt * 1.2);
  const target = render[0].clone().add(tmp.set(0, 5, 0));
  const y = D.yaw + Math.PI + cam.yaw;
  const off = new THREE.Vector3(Math.sin(y) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(y) * Math.cos(cam.pitch)).multiplyScalar(cam.dist);
  const want = target.clone().add(off);
  want.y = Math.max(want.y, -150);
  camera.position.lerp(want, 1 - Math.exp(-dt * 4));
  // the lens widens and shivers a little at full surge
  camera.fov += (58 + windAmt * 14 - camera.fov) * (1 - Math.exp(-dt * 3));
  camera.updateProjectionMatrix();
  if (windAmt > 0.5 && !REDUCE) camera.position.add(tmp.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar((windAmt - 0.5) * 0.5));
  camera.lookAt(target);
  sunLight.position.copy(render[0]).addScaledVector(sunDir, 400);
  sunLight.target.position.copy(render[0]);
}

// ---------- input ----------
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input,textarea")) return;
  if (e.code === "Escape" && panelOpen) return closePanel();
  if (!started || panelOpen) return;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyE" || e.code === "Enter") { if (near) openPanel(near); return; }
  keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

let down = null;
canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; cam.drag = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (!down) return;
  cam.yaw -= e.movementX * 0.005;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * 0.004, -0.25, 1.2);
});
canvas.addEventListener("pointerup", (e) => {
  cam.drag = false;
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 350) pick(e);
  down = null;
});
canvas.addEventListener("wheel", (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.001), 28, 160); }, { passive: true });

const ray = new THREE.Raycaster();
function pick(e) {
  if (!started || panelOpen) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(clickables)[0];
  if (hit) flyTo(hit.object.userData.isle);
}
function flyTo(isle) {
  if (near === isle) return openPanel(isle);
  D.auto = isle;
  D.idle = 0;
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
    b.addEventListener("pointerdown", () => { ext.vert = +b.dataset.v; });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => { ext.vert = 0; });
  }
}

// hand control, from the AR concept: pinch and drag is a joystick, swipe hops islands, palm enters
let hand = { pinch: false };
function onGesture(g) {
  if (!started) return;
  if (g.type === "palm") { if (panelOpen) closePanel(); else if (near) openPanel(near); else flash("fly onto a gold ring first"); return; }
  if (panelOpen) return;
  if (g.type === "pinchstart") { hand.pinch = true; D.auto = null; }
  if (g.type === "pinchmove") {
    ext.turn = -THREE.MathUtils.clamp(g.dx / 140, -1, 1);
    ext.vert = -THREE.MathUtils.clamp(g.dy / 120, -1, 1);
    ext.fwd = 1;
  }
  if (g.type === "pinchend") { hand.pinch = false; ext.turn = ext.vert = ext.fwd = 0; }
  if (g.type === "pinchtap" && near) openPanel(near);
  if (g.type === "swipe") {
    const i = ISLES.indexOf(D.auto || near || ISLES[0]);
    flyTo(ISLES[(i + (g.dir === "left" ? 1 : ISLES.length - 1)) % ISLES.length]);
  }
}

// ---------- island nav + prompt ----------
const nav = $("#isle-nav");
for (const isle of ISLES) {
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = `<span class="zh">${isle.zh}</span><span class="en">${isle.en}</span>`;
  b.setAttribute("aria-label", `Fly to ${isle.en}`);
  b.addEventListener("click", () => { if (started) flyTo(isle); });
  nav.appendChild(b);
  isle.btn = b;
}
const muteBtn = $("#mute");
const paintMute = () => { muteBtn.textContent = Sound.muted ? "sound off" : "sound on"; muteBtn.setAttribute("aria-pressed", String(!Sound.muted)); };
muteBtn.addEventListener("click", () => { Sound.init(); Sound.toggle(); paintMute(); });
paintMute();
const prompt = $("#prompt");
prompt.addEventListener("click", () => near && openPanel(near));
function checkNear() {
  let found = null;
  for (const isle of ISLES) {
    const r = isle.ringWorld;
    if (!r) continue;
    if (Math.hypot(D.pos.x - r.x, D.pos.z - r.z) < 16 && D.pos.y - r.y < 30 && D.pos.y - r.y > -4) found = isle;
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
const photo = (p, alt) => `<img loading="lazy" src="${ROOT}${esc(p.file)}" width="${p.w}" height="${p.h}" style="aspect-ratio:${p.w}/${p.h}" alt="${esc(alt)}">`;
function chapterHTML(c) {
  const stats = c.stats?.length ? `<div class="stats">${c.stats.map(([b, s]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>` : "";
  const eras = (c.eras || []).map((e) => `<div class="era"><h4>${esc(e.name)} <small class="when">${esc(e.when)}</small></h4><p class="why">${esc(e.why)}</p>
    <div class="reels">${e.vids.map((v) => `<a class="reel" href="${esc(v.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${ROOT}${esc(v.thumbnail)}" alt="Reel on ${esc(v.acct)}"><b>${esc(v.views)}</b><span>${esc(v.acct)}</span></a>`).join("")}</div></div>`).join("");
  return `<article class="chapter"><div class="when">${esc(c.when)}</div><h3>${esc(c.title)}</h3><div class="org">${esc(c.org)} · ${esc(c.role)}</div>
    ${c.why ? `<p class="why">${esc(c.why)}</p>` : ""}<p>${esc(c.summary)}</p>${stats}
    ${c.bullets?.length ? `<ul>${c.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}${eras}
    ${c.photos?.length ? `<div class="photos">${c.photos.map((p) => photo(p, `${c.title}, ${p.d}`)).join("")}</div>` : ""}</article>`;
}
function homeHTML() {
  return `<div class="isle-head"><div class="seal big">家</div><div><div class="kick">家园 · home island</div><h2 id="scroll-title">Hey, I'm Edward.</h2></div></div>
    <div class="home-grid"><img class="portrait" src="${ROOT}assets/portrait-studio.jpg" alt="Eddie"><div>
    <p class="lede">most people call me eddie. I wanna be someone my younger self would be proud of.</p><p>${esc(INTRO)}</p></div></div>
    <article class="chapter"><div class="when">right now</div><h3>Still building.</h3><ul>
      <li>Forward Deployed Engineer at Lyra, founding-engineer work for Silicon Valley startups</li>
      <li>Software Engineer at boringstack.ai, since Oct 2026</li>
      <li>Hosting poker, mahjong and range nights for Melbourne engineers</li></ul></article>
    <article class="chapter"><div class="when">the isles</div><h3>Where everything lives</h3><ul>
      ${ISLES.slice(1).map((i) => `<li><b>${i.zh2} ${i.en}</b>: ${esc(i.lede)}</li>`).join("")}</ul></article>
    <p class="credit">Music: Imperial China Cinematic by Shane Ivers, <a href="https://www.silvermansound.com" target="_blank" rel="noopener">silvermansound.com</a>, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.</p>
    <div class="links"><a href="mailto:edwarddchann@gmail.com">email</a><a href="https://www.linkedin.com/in/edwrdchn/" target="_blank" rel="noopener">linkedin</a><a href="https://www.instagram.com/eddie_chann/" target="_blank" rel="noopener">instagram</a></div>`;
}
function isleHTML(isle) {
  const chs = isle.chapters.map((id) => CH[id]).filter(Boolean);
  return `<div class="isle-head"><div class="seal big">${isle.zh}</div><div><div class="kick">${isle.zh2} · ${esc(isle.en)} island</div><h2 id="scroll-title">${esc(isle.en)}</h2></div></div>
    <p class="lede">${esc(isle.lede)}</p>${chs.map(chapterHTML).join("")}`;
}
const scroll = $("#scroll");
function openPanel(isle) {
  panelOpen = true;
  keys.clear();
  ext.turn = ext.fwd = ext.vert = 0;
  D.auto = null;
  $("#scroll-body").innerHTML = isle.id === "home" ? homeHTML() : isleHTML(isle);
  scroll.hidden = false;
  Sound.unroll();
  scroll.scrollTop = 0;
  prompt.hidden = true;
  $("#scroll-close").focus();
  history.replaceState(null, "", `#${isle.id}`);
}
function closePanel() {
  panelOpen = false;
  scroll.hidden = true;
  Sound.rollup();
  prompt.hidden = !near;
  canvas.focus?.();
  history.replaceState(null, "", location.pathname + location.search);
}
$("#scroll-close").addEventListener("click", closePanel);
scroll.addEventListener("click", (e) => { if (e.target === scroll) closePanel(); });

// ---------- boot ----------
const pct = $("#load-pct");
const step = (n) => new Promise((r) => { pct.textContent = `${n}%`; requestAnimationFrame(() => setTimeout(r, 0)); });
const falls = [];
(async () => {
  await document.fonts?.ready;
  for (let i = 0; i < ISLES.length; i++) { await step(Math.round(((i + 1) / ISLES.length) * 85)); makeIsle(ISLES[i]); }
  falls.push(waterfall(ISLES[0], -2.3), waterfall(ISLES[3], 0.9));
  await step(95);
  renderer.compile(scene, camera);
  await step(100);
  $("#loading").classList.add("gone");
  initStage({ onGesture });
  for (const id of ["#btn-nocam", "#btn-cam"]) $(id).addEventListener("click", () => Sound.init());
  const startObs = new MutationObserver(() => { if (document.body.classList.contains("started")) { started = true; startObs.disconnect(); } });
  startObs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  const deep = ISLES.find((i) => `#${i.id}` === location.hash);
  if (deep) { started = true; $("#entry").classList.add("gone"); document.body.classList.add("started"); openPanel(deep); }
})();

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (started) steer(dt); else { D.yaw += dt * 0.2; D.speed = 18; D.pos.x += Math.sin(D.yaw) * D.speed * dt; D.pos.z += Math.cos(D.yaw) * D.speed * dt; }
  animateDragon(t, dt);
  updateCamera(dt);
  updateStreaks(dt, render[0]);
  checkNear();
  Sound.wind(Math.abs(D.speed) / 170, D.boost);
  for (const l of seaLayers) { l.t.offset.x += l.s * dt; l.t.offset.y += l.s * 0.6 * dt; }
  for (const f of falls) f.offset.y += dt * 1.4;
  for (const { g, v } of puffs) { g.position.x += v * dt; if (g.position.x > 800) g.position.x = -800; }
  const m = new THREE.Matrix4();
  lanternData.forEach((l, i) => {
    l.y += l.v * dt;
    if (l.y > 260) l.y = -130;
    m.makeTranslation(l.x + Math.sin(t * 0.5 + l.ph) * 3, l.y, l.z + Math.cos(t * 0.4 + l.ph) * 3);
    lanterns.setMatrixAt(i, m);
  });
  lanterns.instanceMatrix.needsUpdate = true;
  for (const isle of ISLES) {
    if (!isle.root) continue;
    isle.root.position.y = isle.pos[1] + Math.sin(t * 0.4 + isle.r) * 1.2;
    isle.ringWorld.y = isle.root.position.y;
    isle.ring.material.opacity = 0.55 + 0.35 * Math.sin(t * 3);
    isle.beam.material.opacity = isle === near ? 0.035 : 0.07;
    for (const o of isle.root.children[0].children) if (o.userData.spin !== undefined) { o.rotation.y += o.userData.spin * dt; o.position.y += Math.sin(t + o.userData.bob) * 0.02; }
  }
  composer.render();
  requestAnimationFrame(frame);
}
frame();
