// Camera + MediaPipe hand tracking + gesture recognition, shared by both AR routes.
// Emits: swipe {dir}, pinchstart/pinchmove/pinchend {x,y,dx,dy}, pinchtap {x,y}, palm.

const TASKS = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

class GestureTracker {
  constructor(emit) {
    this.emit = emit;
    this.pinching = false;
    this.hist = [];
    this.lastSwipe = 0;
    this.palmSince = 0;
    this.palmFired = false;
  }

  reset() {
    if (this.pinching) this.emit({ type: 'pinchend', ...this.last, dx: 0, dy: 0, cancelled: true });
    this.pinching = false;
    this.hist = [];
    this.palmSince = 0;
    this.palmFired = false;
  }

  update(lm, t, map) {
    if (!lm) { this.reset(); return null; }
    const size = dist(lm[0], lm[9]) || 0.1;
    const pinchD = dist(lm[4], lm[8]) / size;
    const p = map((lm[4].x + lm[8].x) / 2, (lm[4].y + lm[8].y) / 2);
    const c = map(lm[9].x, lm[9].y);

    // Pinch with hysteresis so it doesn't flicker at the threshold.
    if (!this.pinching && pinchD < 0.3) {
      this.pinching = true;
      this.start = { x: p.x, y: p.y, t };
      this.emit({ type: 'pinchstart', x: p.x, y: p.y });
    } else if (this.pinching && pinchD > 0.48) {
      this.pinching = false;
      const dx = p.x - this.start.x, dy = p.y - this.start.y;
      this.emit({ type: 'pinchend', x: p.x, y: p.y, dx, dy });
      if (Math.hypot(dx, dy) < 40 && t - this.start.t < 700) this.emit({ type: 'pinchtap', x: p.x, y: p.y });
      this.hist = [];
    } else if (this.pinching) {
      this.emit({ type: 'pinchmove', x: p.x, y: p.y, dx: p.x - this.start.x, dy: p.y - this.start.y });
    }

    // Swipe: fast horizontal travel of the palm centre while not pinching.
    this.hist.push({ x: c.x, y: c.y, t });
    while (this.hist.length && t - this.hist[0].t > 240) this.hist.shift();
    if (!this.pinching && t - this.lastSwipe > 650 && this.hist.length > 3) {
      const dx = c.x - this.hist[0].x;
      if (Math.abs(dx) > innerWidth * 0.15) {
        this.emit({ type: 'swipe', dir: dx > 0 ? 'right' : 'left' });
        this.lastSwipe = t;
        this.hist = [];
      }
    }

    // Open palm: four fingers extended, thumb out, hand roughly still, held ~0.7s.
    const extended = [8, 12, 16, 20].every((i) => dist(lm[i], lm[0]) > dist(lm[i - 2], lm[0]) * 1.12);
    const thumbOut = dist(lm[4], lm[17]) > size * 0.85;
    const span = this.hist.length ? Math.abs(c.x - this.hist[0].x) : 0;
    const palm = extended && thumbOut && !this.pinching && pinchD > 0.6 && span < innerWidth * 0.05;
    let palmProgress = 0;
    if (palm) {
      if (!this.palmSince) this.palmSince = t;
      palmProgress = Math.min(1, (t - this.palmSince) / 700);
      if (!this.palmFired && palmProgress >= 1) { this.palmFired = true; this.emit({ type: 'palm' }); }
    } else {
      this.palmSince = 0;
      this.palmFired = false;
    }

    this.last = { x: p.x, y: p.y };
    return { p, pinching: this.pinching, palmProgress: this.palmFired ? 0 : palmProgress };
  }
}

// Maps normalised landmark coords onto the mirrored, object-fit: cover video.
function coverMap(video) {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const W = innerWidth, H = innerHeight;
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s;
  const ox = (W - dw) / 2, oy = (H - dh) / 2;
  return (x, y) => ({ x: (1 - x) * dw + ox, y: y * dh + oy });
}

function drawHands(ctx, hands, map, st) {
  const dpr = devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const lm of hands) {
    const pts = lm.map((l) => map(l.x, l.y));
    ctx.strokeStyle = 'rgba(92,225,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of BONES) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
    ctx.stroke();
    ctx.fillStyle = '#5CE1FF';
    for (const q of pts) { ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  if (!st) return;
  const { p, pinching, palmProgress } = st;
  ctx.strokeStyle = pinching ? '#FFB547' : 'rgba(92,225,255,0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, pinching ? 10 : 18, 0, Math.PI * 2); ctx.stroke();
  if (pinching) { ctx.fillStyle = '#FFB547'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
  if (palmProgress > 0) {
    ctx.strokeStyle = '#FFB547';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, 34, -Math.PI / 2, -Math.PI / 2 + palmProgress * Math.PI * 2); ctx.stroke();
  }
}

let flashTimer;
export function flash(text) {
  const el = document.getElementById('flash');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), 700);
}

function setStatus(text, live) {
  const el = document.getElementById('status');
  if (!el) return;
  el.querySelector('span:last-child').textContent = text;
  el.classList.toggle('live', !!live);
}

// Wires the entry overlay, camera, tracker and skeleton overlay. onGesture gets every event.
// Optional: drawSkeleton false skips the full-screen skeleton overlay, and onFrame(hands, st)
// receives the raw landmarks each frame so a page can draw its own hand display.
export function initStage({ onGesture, onFrame, drawSkeleton = true }) {
  const entry = document.getElementById('entry');
  const video = document.getElementById('cam');
  const canvas = document.getElementById('hands');
  const ctx = canvas.getContext('2d');
  const tracker = new GestureTracker(onGesture);

  const resize = () => {
    const dpr = devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();
  addEventListener('resize', resize);

  const dismiss = () => { entry.classList.add('gone'); document.body.classList.add('started'); };

  document.getElementById('btn-nocam').addEventListener('click', () => {
    dismiss();
    setStatus('MOUSE + KEYS MODE', false);
  });

  document.getElementById('btn-cam').addEventListener('click', async () => {
    const btn = document.getElementById('btn-cam');
    btn.disabled = true;
    btn.textContent = 'Starting camera…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 }, audio: false });
      video.srcObject = stream;
      await video.play();
      document.body.classList.add('cam-on');
      dismiss();
      setStatus('LOADING HAND MODEL…', false);
      const { FilesetResolver, HandLandmarker } = await import(`${TASKS}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${TASKS}/wasm`);
      const landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      setStatus('SHOW A HAND', false);
      let lastVT = -1, seen = false;
      const loop = () => {
        if (video.readyState >= 2 && video.currentTime !== lastVT) {
          lastVT = video.currentTime;
          const t = performance.now();
          const res = landmarker.detectForVideo(video, t);
          const map = coverMap(video);
          const hands = res.landmarks || [];
          const st = tracker.update(hands[0], t, map);
          if (drawSkeleton) drawHands(ctx, hands, map, st);
          onFrame?.(hands, st);
          if (!!hands.length !== seen) {
            seen = !!hands.length;
            setStatus(seen ? 'HAND TRACKED' : 'SHOW A HAND', seen);
          }
        }
        requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      console.error(err);
      dismiss();
      setStatus('NO CAMERA · MOUSE + KEYS MODE', false);
      flash('Camera unavailable');
    }
  });

  return { flash };
}
