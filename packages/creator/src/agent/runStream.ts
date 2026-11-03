import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, appendFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";

/** A run owns its event log; HTTP responses are disposable subscribers. */
export class CreatorRunStream {
  readonly inputHash: string;
  readonly #file: string;
  readonly #subscribers = new Set<{ response: ServerResponse; offset: number; pumping: boolean }>();
  #size = 0;
  #finished = false;
  #writes: Promise<void> = Promise.resolve();

  constructor(readonly threadId: string, input: unknown, directory: string) {
    this.inputHash = CreatorRunStream.hash(input);
    this.#file = path.join(directory, `${randomUUID()}.sse`);
  }

  static hash(input: unknown): string { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }

  publish(event: object): Promise<void> {
    const bytes = Buffer.from(`data: ${JSON.stringify(event)}\n\n`);
    this.#writes = this.#writes.then(async () => {
      await mkdir(path.dirname(this.#file), { recursive: true });
      await appendFile(this.#file, bytes, { mode: 0o600 });
      this.#size += bytes.length;
      for (const subscriber of this.#subscribers) this.#pump(subscriber);
    });
    return this.#writes;
  }

  finish(): void {
    this.#finished = true;
    for (const subscriber of this.#subscribers) this.#pump(subscriber);
  }

  attach(response: ServerResponse, offset = 0): void {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > this.#size) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ code: "CREATOR_RUN_CURSOR_INVALID" }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
    response.flushHeaders();
    const subscriber = { response, offset, pumping: false };
    this.#subscribers.add(subscriber);
    response.once("close", () => this.#subscribers.delete(subscriber));
    this.#pump(subscriber);
  }

  #pump(subscriber: { response: ServerResponse; offset: number; pumping: boolean }): void {
    if (subscriber.pumping || subscriber.response.destroyed) return;
    subscriber.pumping = true;
    void (async () => {
      const response = subscriber.response;
      // Open only while reading, so idle subscriptions hold no Windows file lock.
      if (subscriber.offset < this.#size) {
        const file = await open(this.#file, "r");
        try {
          const buffer = Buffer.alloc(64 * 1024);
          while (!response.destroyed && subscriber.offset < this.#size) {
            const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, this.#size - subscriber.offset), subscriber.offset);
            if (!bytesRead) throw new Error("CREATOR_RUN_STREAM_INCOMPLETE");
            subscriber.offset += bytesRead;
            // write() may retain the buffer until drain; never reuse that memory.
            if (!response.write(Buffer.from(buffer.subarray(0, bytesRead)))) {
              await new Promise<void>(resolve => {
                const done = () => { response.off("drain", done); response.off("close", done); resolve(); };
                response.once("drain", done); response.once("close", done);
              });
            }
          }
        } finally { await file.close(); }
      }
      if (this.#finished && !response.destroyed && subscriber.offset === this.#size) response.end();
    })().catch(error => subscriber.response.destroy(error instanceof Error ? error : undefined)).finally(() => {
      subscriber.pumping = false;
      if (!subscriber.response.destroyed && !subscriber.response.writableEnded &&
          (subscriber.offset < this.#size || this.#finished)) this.#pump(subscriber);
    });
  }
}
