/** Normalize transport framing only; the SDK remains the sole AG-UI parser. */
export function normalizeSseResponse(response: Response): Response {
  if (!response.body || response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "text/event-stream") return response;
  let afterCR = false;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Work on bytes so fragmented UTF-8 and JSON escapes remain untouched.
      // SSE permits CRLF, LF and lone CR, including CRLF split across reads.
      const output = new Uint8Array(chunk.length); let size = 0;
      for (const byte of chunk) {
        if (byte === 10 && afterCR) { afterCR = false; continue; }
        afterCR = byte === 13; output[size++] = afterCR ? 10 : byte;
      }
      if (size) controller.enqueue(output.subarray(0, size));
    },
  }));
  const headers = new Headers(response.headers);
  // These describe the original representation, not the normalized body.
  for (const name of ["content-length", "content-encoding", "content-md5", "digest", "content-digest", "repr-digest", "etag"]) headers.delete(name);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export const fetchWithSseLineEndings: typeof fetch = async (input, init) => normalizeSseResponse(await fetch(input, init));
