import type { Response } from "express";

export type SseWriter = {
  send: (event: string, data: unknown) => void;
  close: () => void;
};

export function openSseStream(res: Response): SseWriter {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;

  const heartbeat = setInterval(() => {
    if (!closed) res.write(": keep-alive\n\n");
  }, 15_000);

  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      res.write("event: end\ndata: {}\n\n");
      res.end();
    },
  };
}
