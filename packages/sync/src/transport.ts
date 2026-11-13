import type { C2S, S2C } from "@muse/protocol";

export type TransportHandlers = {
  /** A connection is up (first time or again). The replica sends hello here. */
  open(): void;
  message(m: S2C): void;
  /** The connection dropped. Reconnecting is the transport's job; it calls open again. */
  close(): void;
};

/**
 * What a replica needs from the network. Messages sent while down may be dropped; the
 * replica resends what matters after the next open. Tests inject simulated networks here.
 */
export interface Transport {
  start(h: TransportHandlers): void;
  send(m: C2S): void;
  stop(): void;
}

/** The single place messages are turned into frames and back, so the format can change. */
export const codec = {
  encode(m: C2S): string {
    return JSON.stringify(m);
  },
  decode(frame: string): S2C {
    return JSON.parse(frame) as S2C;
  },
};

export type WsTransportOptions = {
  /** Delay before reconnect attempt n (from 0). Default: 100 ms doubling to 5 s, with jitter. */
  backoff?: (attempt: number) => number;
  WebSocket?: typeof WebSocket;
};

export interface SharedSocket {
  /** A transport for one room on this socket. One per room: a second hello replaces the first. */
  transport(room: string): Transport;
  /** True while the socket is open. */
  readonly open: boolean;
  close(): void;
}

/**
 * One WebSocket carrying many rooms (multiplexed by `room`), reconnecting with backoff until
 * closed. Each room's transport sees open and close with the socket; server errors without a
 * room go to every room.
 */
export function sharedSocket(url: string, opts: WsTransportOptions = {}): SharedSocket {
  const WS = opts.WebSocket ?? globalThis.WebSocket;
  const backoff = opts.backoff ?? ((n: number) => Math.min(5000, 100 * 2 ** n) * (0.5 + Math.random() / 2));
  const rooms = new Map<string, TransportHandlers>();
  let ws: WebSocket | null = null;
  let isOpen = false;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed || ws) return;
    const sock = new WS(url);
    ws = sock;
    sock.onopen = () => {
      isOpen = true;
      attempt = 0;
      for (const h of [...rooms.values()]) h.open();
    };
    sock.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      const m = codec.decode(ev.data);
      if (m.t === "error" && m.room === undefined) for (const h of [...rooms.values()]) h.message(m);
      else rooms.get(m.room!)?.message(m);
    };
    sock.onclose = () => {
      const was = isOpen;
      if (ws === sock) ws = null;
      isOpen = false;
      if (was) for (const h of [...rooms.values()]) h.close();
      if (!closed && rooms.size) timer = setTimeout(connect, backoff(attempt++));
    };
    sock.onerror = () => {};
  };

  return {
    get open() {
      return isOpen;
    },
    transport(room) {
      return {
        start(h) {
          rooms.set(room, h);
          if (isOpen) h.open();
          else connect();
        },
        send(m) {
          if (ws && isOpen && ws.readyState === WS.OPEN) ws.send(codec.encode(m));
        },
        stop() {
          rooms.delete(room);
        },
      };
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
      ws = null;
    },
  };
}

/** One WebSocket for one replica, reconnecting with backoff until stopped. */
export function wsTransport(url: string, opts: WsTransportOptions = {}): Transport {
  const WS = opts.WebSocket ?? globalThis.WebSocket;
  const backoff = opts.backoff ?? ((n: number) => Math.min(5000, 100 * 2 ** n) * (0.5 + Math.random() / 2));
  let ws: WebSocket | null = null;
  let handlers: TransportHandlers | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (stopped || !handlers) return;
    const h = handlers;
    const sock = new WS(url);
    ws = sock;
    let opened = false;
    sock.onopen = () => {
      opened = true;
      attempt = 0;
      h.open();
    };
    sock.onmessage = (ev) => {
      if (typeof ev.data === "string") h.message(codec.decode(ev.data));
    };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      if (opened) h.close();
      if (!stopped) timer = setTimeout(connect, backoff(attempt++));
    };
    sock.onerror = () => {};
  };

  return {
    start(h) {
      handlers = h;
      stopped = false;
      connect();
    },
    send(m) {
      if (ws && ws.readyState === WS.OPEN) ws.send(codec.encode(m));
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      ws?.close();
      ws = null;
    },
  };
}
