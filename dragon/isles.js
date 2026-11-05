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
  { id: "home", zh: "家", zh2: "家园", en: "Home", sub: "about eddie", pos: [0, 200, 0], r: 86, kind: "hall" },
  { id: "career", zh: "业", zh2: "事业", en: "Career", sub: "internships to lyra", pos: [480, 250, -230], r: 74, kind: "pagoda",
    chapters: ["first-internships", "atlassian", "fastrack", "culture-amp", "lyra"],
    lede: "Internships that kept getting bigger: Deloitte and Monash, Atlassian in Sydney, a startup through Fastrack, Culture Amp, then forward deployed at Lyra." },
  { id: "community", zh: "群", zh2: "社群", en: "Community", sub: "mac and hosting", pos: [-465, 215, -280], r: 77, kind: "pavilion",
    chapters: ["monash-mac", "leading-mac", "hosting"],
    lede: "The thing I've always cared about most. Running Monash's coding club, then hosting rooms for Melbourne engineers after I graduated." },
  { id: "content", zh: "影", zh2: "影像", en: "Content", sub: "skits, ugc, my story", pos: [-370, 270, 400], r: 67, kind: "teahouse",
    chapters: ["content"],
    lede: "Skits for MAC, growth work at Cluely, then my own story on @eddie_chann. Three eras, each for a different reason." },
  { id: "life", zh: "旅", zh2: "人生", en: "Life", sub: "shanghai, grad, sf", pos: [420, 190, 420], r: 74, kind: "gate",
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
  for (let i = 0; i < 34; i++) { const a = (i / 34) * Math.PI * 2 + rr(-0.08, 0.08), d = rr(1150, 1900); placeCluster(Math.cos(a) * d, Math.sin(a) * d, 3 + Math.floor(rand() * 4), 420, 780, 26, 95); }
  for (let i = 0; i < 30; i++) { const a = rand() * Math.PI * 2, d = rr(700, 1100); placeCluster(Math.cos(a) * d, Math.sin(a) * d, 2 + Math.floor(rand() * 3), 260, 440, 16, 70); }
  for (let i = 0; i < 14; i++) { const a = rand() * Math.PI * 2, d = rr(200, 680); placeCluster(Math.cos(a) * d, Math.sin(a) * d, 1 + Math.floor(rand() * 2), 160, 320, 10, 42); }
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
  // a column of light into the sky, seen from across the map and through the fog
  const beam = new THREE.Group();
  for (const [w, k] of [[10, 0.5], [3.5, 1]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 1.3, BEAM_H, 32, 1, true), beamMat(k));
    m.position.y = BEAM_H / 2;
    beam.add(m);
  }
  beam.position.copy(ringPos);
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
  clickables.push(label, beam, holder);
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
  segs.push({ p: new THREE.Vector3(0, 250, 90 + i * SP), m });
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
const D = { pos: new THREE.Vector3(0, 250, 90), yaw: Math.PI, speed: 0, vy: 0, pitch: 0, idle: 0, auto: null };
const keys = new Set();
const cam = { yaw: 0, pitch: 0.4, dist: 105, drag: false };
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
  if (manual) D.auto = null;
  if (D.auto) {
    const tgt = D.auto.ringWorld.clone().setY(D.auto.ringWorld.y + 14);
    const dx = tgt.x - D.pos.x, dz = tgt.z - D.pos.z, dist = Math.hypot(dx, dz);
    let dy = Math.atan2(dx, dz) - D.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    turn = THREE.MathUtils.clamp(dy * 2, -1, 1);
    fwd = Math.min(1, dist / 60) * (Math.abs(dy) > 1.2 ? 0.35 : 1);
    // climb over anything in the way, then settle onto the ring
    const cruise = dist > 90 ? tgt.y + 60 : tgt.y;
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
  D.pos.y = THREE.MathUtils.clamp(D.pos.y, -140, 700);
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
  const jolt = (windAmt > 0.5 ? (windAmt - 0.5) * 0.5 : 0) + shake;
  if (jolt > 0.01 && !REDUCE) camera.position.add(tmp.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(jolt));
  camera.lookAt(target);
  sunLight.position.copy(render[0]).addScaledVector(sunDir, 400);
  sunLight.target.position.copy(render[0]);
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
function pool(n, additive) {
  return Array.from({ length: n }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.visible = false;
    scene.add(s);
    return { s, life: 0, max: 1, v: new THREE.Vector3(), size: 1, grow: 0, drag: 1, alpha: 1, rise: 0 };
  });
}
const flames = pool(500, true), smoke = pool(140, false);
let fi = 0, si = 0;
function puff(list, idx, pos, vel, size, life, color, o = {}) {
  const p = list[idx % list.length];
  p.s.position.copy(pos);
  p.v.copy(vel);
  p.size = size; p.life = p.max = life; p.grow = o.grow ?? 0; p.drag = o.drag ?? 1.5; p.alpha = o.alpha ?? 1; p.rise = o.rise ?? 0;
  p.s.material.color.set(color);
  p.s.material.rotation = rand() * 6;
  p.s.visible = true;
}
const flame = (pos, vel, size, life, color, o) => puff(flames, fi++, pos, vel, size, life, color, o);
const fume = (pos, vel, size, life, color, o) => puff(smoke, si++, pos, vel, size, life, color, o);
const rndDir = () => tmp.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
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
const ballGeo = new THREE.SphereGeometry(2.3, 16, 12);
function shoot() {
  const now = clock.elapsedTime;
  if (!started || panelOpen || now - lastShot < 0.32) return;
  lastShot = now;
  head.updateMatrixWorld();
  const mouth = new THREE.Vector3(0, -0.5, 6.4).applyMatrix4(head.matrixWorld);
  const dir = new THREE.Vector3(Math.sin(D.yaw) * Math.cos(D.pitch), Math.sin(D.pitch), Math.cos(D.yaw) * Math.cos(D.pitch));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: "#fff0b8" })));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: "#ff8a2a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(16, 16, 1);
  g.add(glow, new THREE.PointLight("#ff8a3a", 160, 140, 1.5));
  g.position.copy(mouth);
  scene.add(g);
  balls.push({ g, v: dir.multiplyScalar(340 + Math.abs(D.speed)), life: 3.2 });
  for (let k = 0; k < 14; k++) flame(mouth, rndDir().multiplyScalar(rr(5, 25)).addScaledVector(dir, 0.08), rr(3, 6), rr(0.25, 0.5), FIRE_COLORS[k % 5], { grow: 1.5 });
  roar = 1;
  Sound.fire();
}
function blast(pos, pillar) {
  const near = THREE.MathUtils.clamp(1 - pos.distanceTo(camera.position) / 900, 0, 1);
  Sound.boom(near);
  shake = Math.max(shake, 0.6 + near * 2.6);
  flashAt(pos, 9000);
  flame(pos, tmp.set(0, 0, 0), 70, 0.35, "#fff6d0", { grow: 0.8 });
  for (let k = 0; k < 70; k++) flame(pos, rndDir().multiplyScalar(rr(30, 140)), rr(8, 22), rr(0.5, 1.3), FIRE_COLORS[k % 5], { grow: 1.2, drag: 2.2 });
  for (let k = 0; k < 28; k++) fume(pos.clone().add(rndDir().multiplyScalar(rr(0, 12))), rndDir().multiplyScalar(rr(8, 35)), rr(20, 40), rr(2.5, 4.5), k % 2 ? "#5e4c49" : "#7a6660", { grow: 2.2, alpha: 0.55, rise: 6 });
  rubble(pos, pillar.r * 0.6, 70, 120);
  topple(pillar, pos);
}
// a hit that doesn't finish the pillar: a smaller blast, a shudder and a scorch mark left behind
const scorchMat = new THREE.SpriteMaterial({ map: softTex, color: "#1d1512", transparent: true, opacity: 0.75, depthWrite: false });
function chip(pos, c) {
  const near = THREE.MathUtils.clamp(1 - pos.distanceTo(camera.position) / 900, 0, 1);
  Sound.boom(near * 0.55);
  shake = Math.max(shake, 0.3 + near * 1.2);
  flashAt(pos, 4500);
  for (let k = 0; k < 34; k++) flame(pos, rndDir().multiplyScalar(rr(20, 90)), rr(6, 14), rr(0.4, 0.9), FIRE_COLORS[k % 5], { grow: 1.1, drag: 2.4 });
  for (let k = 0; k < 10; k++) fume(pos, rndDir().multiplyScalar(rr(6, 20)), rr(14, 26), rr(2, 3.5), "#5e4c49", { grow: 2, alpha: 0.5, rise: 5 });
  rubble(pos, 6, 26, 80);
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
  shake *= Math.exp(-dt * 3.5);
  roar *= Math.exp(-dt * 2.5);
  for (const l of flashes) l.intensity *= Math.exp(-dt * 9);
  // fireballs
  for (let b = balls.length - 1; b >= 0; b--) {
    const f = balls[b], p = f.g.position;
    p.addScaledVector(f.v, dt);
    f.life -= dt;
    f.g.children[1].material.rotation += dt * 6;
    for (let k = 0; k < 3; k++) flame(p, rndDir().multiplyScalar(rr(2, 10)).addScaledVector(f.v, -0.05), rr(3.5, 7), rr(0.3, 0.6), FIRE_COLORS[(k + b) % 5], { grow: 0.8 });
    if (rand() < 0.35) fume(p, tmp.set(0, 4, 0), rr(5, 9), rr(0.8, 1.4), "#6d5a55", { grow: 1.6, alpha: 0.35, rise: 3 });
    let done = f.life <= 0;
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
    for (const isle of ISLES) {
      if (done || !isle.root) break;
      const q = isle.root.position, d = Math.hypot(p.x - q.x, p.z - q.z), top = q.y + 3;
      // the ground and rock underneath, or the building: fireballs flying over the grass pass on by
      const ground = d < isle.r * 1.02 && p.y < top && p.y > top - isle.r * 1.4 * (1 - d / isle.r);
      const hall = Math.hypot(p.x - isle.center.x, p.z - isle.center.z) < isle.br && p.y > top - 2 && p.y < top + isle.bh;
      if (ground || hall) { fizzle(p.clone()); done = true; }
    }
    if (p.y < -170) { fume(p, tmp.set(0, 6, 0), 18, 2, "#e8d8d0", { grow: 1.5, alpha: 0.5 }); done = true; }
    if (done) { scene.remove(f.g); f.g.children[0].material.dispose(); f.g.children[1].material.dispose(); balls.splice(b, 1); }
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
    p.s.position.addScaledVector(p.v, dt);
    p.s.position.y += p.rise * dt;
    p.v.multiplyScalar(Math.exp(-dt * p.drag));
    const sc = p.size * (1 + p.grow * u);
    p.s.scale.set(sc, sc, 1);
    p.s.material.opacity = p.alpha * (1 - u) * (u < 0.1 ? u * 10 : 1);
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

// ---------- input ----------
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input,textarea")) return;
  if (e.code === "Escape" && panelOpen) return closePanel();
  if (!started || panelOpen) return;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyE" || e.code === "Enter") { if (near) openPanel(near); return; }
  if (e.code === "KeyF") { shoot(); return; }
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
canvas.addEventListener("wheel", (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.001), 45, 240); }, { passive: true });

const ray = new THREE.Raycaster();
function pick(e) {
  if (!started || panelOpen) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  // a label, a beacon or a temple opens that island's scroll straight away
  const hit = ray.intersectObjects(clickables, true)[0];
  if (!hit) return;
  let o = hit.object;
  while (o && !o.userData.isle) o = o.parent;
  if (o) openPanel(o.userData.isle);
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
  if (panelOpen) return;
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

// the controls panel starts folded on short screens so it never covers the top bar
if (innerHeight < 720) $("#help").open = false;

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
{
  const box = $("#voices");
  for (const [id, label] of Object.entries(Sound.VOICES)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(Sound.pref.voice === id));
    b.addEventListener("click", () => {
      Sound.init();
      Sound.setVoice(id);
      for (const o of box.children) o.setAttribute("aria-pressed", String(o === b));
      Sound.fire();
    });
    box.appendChild(b);
  }
}
const prompt = $("#prompt");
prompt.addEventListener("click", () => near && openPanel(near));
function checkNear() {
  let found = null;
  for (const isle of ISLES) {
    const r = isle.ringWorld;
    if (!r) continue;
    if (Math.hypot(D.pos.x - r.x, D.pos.z - r.z) < 34 && D.pos.y - r.y < 70 && D.pos.y - r.y > -4) found = isle;
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
    <p class="credit">Dragon breath sound effect from <a href="https://tunetank.com" target="_blank" rel="noopener">tunetank.com</a>.</p>
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
      birds.push({ b, kind: "crane", loop, off: new THREE.Vector3(i ? side * rank * 9 : 0, rank * 0.6, -rank * 10), flap: rr(1.6, 2.2), ph: rand() * 6 });
      scene.add(b);
    }
  }
  // swallows circling each island
  for (const isle of ISLES) {
    for (let i = 0; i < 6; i++) {
      const b = swallow();
      b.scale.setScalar(1.4);
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
    fog: "#1a2340", near: 380, far: 2100, hemiSky: "#7086c4", hemiGround: "#15111f", hemiI: 0.5, sunCol: "#b9cdff", sunI: 0.9,
    exposure: 1.05, sea: "#2b3554", cloud: "#7f8db4", lantern: 4.5, stars: 1, bloom: 0.75 },
};
const stars = (() => {
  const n = 1800, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, y = Math.abs(u) * 0.9 + 0.08, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 3500, y * 3500, Math.sin(a) * r * 3500], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: "#fff8e8", size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
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
  stars.material.opacity = todNow.stars;
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

// ?debug exposes the flight state for testing from the console
if (new URLSearchParams(location.search).has("debug")) window.__isles = { D, PILLARS, balls, falling, shoot, cam, birds };
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (started) steer(dt); else { D.yaw += dt * 0.2; D.speed = 18; D.pos.x += Math.sin(D.yaw) * D.speed * dt; D.pos.z += Math.cos(D.yaw) * D.speed * dt; }
  animateDragon(t, dt);
  updateCamera(dt);
  updateStreaks(dt, render[0]);
  updateFire(dt);
  updateTod(dt);
  updateBirds(t);
  checkNear();
  Sound.wind(Math.abs(D.speed) / 170, D.boost);
  for (const l of seaLayers) { l.t.offset.x += l.s * dt; l.t.offset.y += l.s * 0.6 * dt; }
  for (const f of falls) f.offset.y += dt * 1.4;
  grassTime.value = t;
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
    for (const m of isle.beam.children) { m.material.uniforms.time.value = t; m.material.uniforms.power.value = isle === near ? 0.35 : 1; }
    for (const o of isle.root.children[0].children) if (o.userData.spin !== undefined) { o.rotation.y += o.userData.spin * dt; o.position.y += Math.sin(t + o.userData.bob) * 0.02; }
  }
  composer.render();
  requestAnimationFrame(frame);
}
frame();
