// WebSocket link to the multiplayer relay (server/relay.mjs). Joins a room, reconnects with
// backoff if the connection drops, and hands every message to onMessage.
export function connect({ url, room, onMessage, onStatus }) {
  let ws = null, closed = false, retry = 0, myId = null;
  const open = () => {
    onStatus?.("connecting");
    ws = new WebSocket(`${url}?room=${encodeURIComponent(room)}`);
    ws.onopen = () => { retry = 0; };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "welcome") { myId = m.id; onStatus?.("online"); }
      onMessage(m);
    };
    ws.onclose = (e) => {
      onStatus?.(e.code === 4001 ? "full" : "offline");
      if (closed || e.code === 4001) return;
      setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
    };
    ws.onerror = () => {};
  };
  open();
  return {
    get id() { return myId; },
    send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    close() { closed = true; ws?.close(); },
  };
}
