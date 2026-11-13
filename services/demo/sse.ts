// Streams that survive a phone leaving at any moment. A tab that closes cancels the response body;
// after that every enqueue or close on its controller throws, and a throw out of a stream callback
// takes the whole demo process down. These helpers never throw and say when the client is gone.

const enc = new TextEncoder();

export type Sse = { send(event: string, data: unknown): void; readonly gone: boolean; readonly signal: AbortSignal };

/** An event stream: `run` writes with `send` and may stop early when `signal` aborts (the client left). */
export function sseStream(run: (sse: Sse) => Promise<void>): ReadableStream<Uint8Array> {
  const ac = new AbortController();
  let ctl: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;
  const sse: Sse = {
    send(event, data) {
      if (closed) return;
      try {
        ctl!.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      } catch {
        closed = true;
      }
    },
    get gone() {
      return closed;
    },
    signal: ac.signal,
  };
  const finish = () => {
    if (closed) return;
    closed = true;
    try {
      ctl?.close();
    } catch {}
  };
  return new ReadableStream<Uint8Array>({
    start(c) {
      ctl = c;
      void run(sse)
        .catch((e) => console.warn(`stream: ${(e as Error)?.stack ?? e}`))
        .finally(finish);
    },
    cancel() {
      closed = true;
      ac.abort();
    },
  });
}

/**
 * Split a body in two without `tee()`: `client` goes to the phone, `tap` is only watched. The tap
 * never holds the client back and never errors; when the client leaves, the source is cancelled
 * (which aborts the upstream request) and the tap ends.
 */
export function splitBody(body: ReadableStream<Uint8Array>): { client: ReadableStream<Uint8Array>; tap: ReadableStream<Uint8Array> } {
  const reader = body.getReader();
  let tapCtl: ReadableStreamDefaultController<Uint8Array> | null = null;
  let tapOpen = true;
  const endTap = () => {
    if (!tapOpen) return;
    tapOpen = false;
    try {
      tapCtl?.close();
    } catch {}
  };
  const tap = new ReadableStream<Uint8Array>({
    start(c) {
      tapCtl = c;
    },
    cancel() {
      tapOpen = false;
    },
  });
  const client = new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          endTap();
          c.close();
          return;
        }
        if (tapOpen) {
          try {
            tapCtl!.enqueue(value);
          } catch {
            tapOpen = false;
          }
        }
        c.enqueue(value);
      } catch {
        endTap();
        try {
          c.close();
        } catch {}
      }
    },
    cancel() {
      endTap();
      reader.cancel().catch(() => {});
    },
  });
  return { client, tap };
}
