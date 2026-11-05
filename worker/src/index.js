// Dragon Isles multiplayer relay on Cloudflare Workers. Each room is one Durable Object that
// holds the room's WebSockets and forwards every message to the other dragons in it, stamped
// with the sender's id. Same protocol as server/relay.mjs (the local Node version).
const MAX_PER_ROOM = 12;
const MAX_MSG_BYTES = 2048;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Dragon Isles relay: connect with a WebSocket to ?room=<code>", { status: 200 });
    }
    const room = (url.searchParams.get("room") || "lobby").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "lobby";
    const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
    return stub.fetch(request);
  },
};

export class Room {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch() {
    const sockets = this.ctx.getWebSockets();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (sockets.length >= MAX_PER_ROOM) {
      this.ctx.acceptWebSocket(server);
      server.close(4001, "room full");
      return new Response(null, { status: 101, webSocket: client });
    }
    // ids keep counting up across the room's life, even after the object sleeps
    const id = String(((await this.ctx.storage.get("nextId")) || 0) + 1);
    await this.ctx.storage.put("nextId", Number(id));
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });
    const peers = sockets.map((ws) => ws.deserializeAttachment()?.id).filter(Boolean);
    server.send(JSON.stringify({ t: "welcome", id, peers }));
    this.broadcast({ t: "join", id }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(text); } catch {}
    }
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== "string" || data.length > MAX_MSG_BYTES) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== "string") return;
    msg.id = ws.deserializeAttachment()?.id; // never trust a sender-supplied id
    this.broadcast(msg, ws);
  }

  async webSocketClose(ws) {
    const id = ws.deserializeAttachment()?.id;
    if (id) this.broadcast({ t: "leave", id }, ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}
