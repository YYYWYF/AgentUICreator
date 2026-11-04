import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, appendFile } from "node:fs/promises";
import path from "node:path";
/** A run owns its event log; HTTP responses are disposable subscribers. */
export class CreatorRunStream {
    threadId;
    inputHash;
    #file;
    #subscribers = new Set();
    #size = 0;
    #finished = false;
    #writes = Promise.resolve();
    constructor(threadId, input, directory) {
        this.threadId = threadId;
        this.inputHash = CreatorRunStream.hash(input);
        this.#file = path.join(directory, `${randomUUID()}.sse`);
    }
    static hash(input) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
    publish(event) {
        const bytes = Buffer.from(`data: ${JSON.stringify(event)}\n\n`);
        this.#writes = this.#writes.then(async () => {
            await mkdir(path.dirname(this.#file), { recursive: true });
            await appendFile(this.#file, bytes, { mode: 0o600 });
            this.#size += bytes.length;
            for (const subscriber of this.#subscribers)
                this.#pump(subscriber);
        });
        return this.#writes;
    }
    finish() {
        this.#finished = true;
        for (const subscriber of this.#subscribers)
            this.#pump(subscriber);
    }
    attach(response, offset = 0) {
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
    #pump(subscriber) {
        if (subscriber.pumping || subscriber.response.destroyed)
            return;
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
                        if (!bytesRead)
                            throw new Error("CREATOR_RUN_STREAM_INCOMPLETE");
                        subscriber.offset += bytesRead;
                        // write() may retain the buffer until drain; never reuse that memory.
                        if (!response.write(Buffer.from(buffer.subarray(0, bytesRead)))) {
                            await new Promise(resolve => {
                                const done = () => { response.off("drain", done); response.off("close", done); resolve(); };
                                response.once("drain", done);
                                response.once("close", done);
                            });
                        }
                    }
                }
                finally {
                    await file.close();
                }
            }
            if (this.#finished && !response.destroyed && subscriber.offset === this.#size)
                response.end();
        })().catch(error => subscriber.response.destroy(error instanceof Error ? error : undefined)).finally(() => {
            subscriber.pumping = false;
            if (!subscriber.response.destroyed && !subscriber.response.writableEnded &&
                (subscriber.offset < this.#size || this.#finished))
                this.#pump(subscriber);
        });
    }
}
//# sourceMappingURL=runStream.js.map