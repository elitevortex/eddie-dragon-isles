// Eddie's story as floating islands over a sea of cloud. You fly a long Chinese dragon in
// third person; each island holds one pillar of the story from data.js. Land on an island's
// gold ring and press E (or hold an open palm with the camera on) to unroll its scroll.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { initStage, flash } from "../ar/hands.js";

const $ = (s) => document.querySelector(s);
const ROOT = document.documentElement.dataset.root ?? "../";
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CH = Object.fromEntries((window.CHAPTERS || []).map((c) => [c.id, c]));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- the islands ----------
const ISLES = [
  { id: "home", zh: "家", zh2: "家园", en: "Home", sub: "about eddie", pos: [0, 0, 0], r: 54, kind: "hall" },
  { id: "career", zh: "业", zh2: "事业", en: "Career", sub: "internships to lyra", pos: [310, 40, -150], r: 46, kind: "pagoda",
    chapters: ["first-internships", "atlassian", "fastrack", "culture-amp", "lyra"],
    lede: "Internships that kept getting bigger: Deloitte and Monash, Atlassian in Sydney, a startup through Fastrack, Culture Amp, then forward deployed at Lyra." },
  { id: "community", zh: "群", zh2: "社群", en: "Community", sub: "mac and hosting", pos: [-300, 15, -180], r: 48, kind: "pavilion",
    chapters: ["monash-mac", "leading-mac", "hosting"],
    lede: "The thing I've always cared about most. Running Monash's coding club, then hosting rooms for Melbourne engineers after I graduated." },
  { id: "content", zh: "影", zh2: "影像", en: "Content", sub: "skits, ugc, my story", pos: [-240, 62, 260], r: 42, kind: "teahouse",
    chapters: ["content"],
    lede: "Skits for MAC, growth work at Cluely, then my own story on @eddie_chann. Three eras, each for a different reason." },
  { id: "life", zh: "旅", zh2: "人生", en: "Life", sub: "shanghai, grad, sf", pos: [270, -6, 270], r: 46, kind: "gate",
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
scene.fog = new THREE.Fog("#eab3a2", 420, 2100);
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
  const g = new THREE.ConeGeometry(0.5, 1, 32, 10, true);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = 0.5 - v.y;
    const a = Math.atan2(v.z, v.x);
    const s = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const c = (s - 1) / (Math.SQRT2 - 1);
    const r = 0.5 * t * s * (1 + 0.1 * t);
    const y = Math.pow(1 - t, 1.9) + 0.42 * c * c * Math.pow(t, 4);
    p.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
  }
  g.computeVertexNormals();
  return g;
})();
function roof(w, d, h, m = M.tile) {
  const g = new THREE.Group();
  const r = new THREE.Mesh(ROOF, m);
  r.scale.set(w, h, d);
  r.castShadow = true;
  g.add(r, at(new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), M.gold), 0, h + 0.3, 0));
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
// karst peaks rising out of the cloud sea
{
  const mat = std("#8d98b4");
  const mat2 = std("#a3abc2");
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rr(-0.05, 0.05);
    const d = rr(950, 1700);
    const h = rr(260, 620);
    const rb = rr(55, 120);
    const g = new THREE.CylinderGeometry(rb * rr(0.2, 0.4), rb, h, 8, 6);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const y = p.getY(j) / h + 0.5;
      const bulge = 1 + 0.35 * Math.sin(y * Math.PI) ;
      p.setX(j, p.getX(j) * bulge + rr(-6, 6));
      p.setZ(j, p.getZ(j) * bulge + rr(-6, 6));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rand() < 0.5 ? mat : mat2);
    m.position.set(Math.cos(a) * d, -175 + h / 2 - 20, Math.sin(a) * d);
    scene.add(m);
  }
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
    g.add(at(cyl(0.8, 0.9, h, m), x, y0 + h / 2, d / 2), at(cyl(0.8, 0.9, h, m), x, y0 + h / 2, -d / 2));
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
    const moon = new THREE.Mesh(new THREE.TorusGeometry(5, 1.3, 8, 24), M.wall);
    g.add(at(moon, 16, 6, -6), at(box(3, 12, 2.2, M.wall), 22, 6, -6), at(box(3, 12, 2.2, M.wall), 10, 6, -6));
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

