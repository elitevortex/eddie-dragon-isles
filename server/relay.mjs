// Multiplayer relay for Dragon Isles. Each browser joins a room by name and the relay forwards
// every message to the other dragons in that room, stamped with the sender's id. Game logic
// lives in the clients: each dragon is the authority on its own position and health.
//
//   npm install && npm start            -> ws://localhost:8787
//   PORT=9000 npm start                 -> another port
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT) || 8787;
const MAX_PER_ROOM = 12;
const MAX_MSG_BYTES = 2048;
const MAX_MSGS_PER_SEC = 60;

const rooms = new Map(); // room name -> Map(id -> socket)
let nextId = 1;

const wss = new WebSocketServer({ port: PORT });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
}
function broadcast(room, msg, except) {
  const peers = rooms.get(room);
  if (!peers) return;
  const text = JSON.stringify(msg);
  for (const [id, ws] of peers) if (id !== except) send(ws, text);
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://relay");
  const room = (url.searchParams.get("room") || "lobby").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "lobby";
  if (!rooms.has(room)) rooms.set(room, new Map());
  const peers = rooms.get(room);
  if (peers.size >= MAX_PER_ROOM) { ws.close(4001, "room full"); return; }

  const id = String(nextId++);
  peers.set(id, ws);
  send(ws, { t: "welcome", id, room, peers: [...peers.keys()].filter((k) => k !== id) });
  broadcast(room, { t: "join", id }, id);

  let windowStart = Date.now(), count = 0;
  ws.on("message", (data) => {
    if (data.length > MAX_MSG_BYTES) return;
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; count = 0; }
    if (++count > MAX_MSGS_PER_SEC) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== "string") return;
    msg.id = id; // never trust a sender-supplied id
    broadcast(room, msg, id);
  });
  ws.on("close", () => {
    peers.delete(id);
    broadcast(room, { t: "leave", id });
    if (!peers.size) rooms.delete(room);
  });
});

// drop sockets that stopped answering pings
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.alive === false) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 15000);
wss.on("connection", (ws) => { ws.alive = true; ws.on("pong", () => { ws.alive = true; }); });

console.log(`Dragon Isles relay listening on ws://localhost:${PORT}`);
