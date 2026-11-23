export type SseMessage = { event?: string; data: string };

/** Minimal SSE parser for provider streaming responses. */
export async function* readSse(
  response: Response,
): AsyncGenerator<SseMessage> {
  if (!response.body) {
    throw new Error("Provider response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");

      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf("\n\n");

        let event: string | undefined;
        const dataLines: string[] = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length) {
          yield { event, data: dataLines.join("\n") };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
