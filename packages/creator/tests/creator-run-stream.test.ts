import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { CreatorRunStream } from "../src/agent/runStream.js";

it("keeps producing after disconnect and replays exact bytes, including a partial Unicode frame", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "creator 流 spaces-"));
  const run = new CreatorRunStream("thread", { request: "一次" }, directory);
  const server = createServer((req, res) => run.attach(res, Number(new URL(req.url!, "http://localhost").searchParams.get("offset") ?? 0)));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const response = await fetch(base);
    const reader = response.body!.getReader();
    const first = { type: "TEXT_MESSAGE_CONTENT", delta: "小招你好" };
    await run.publish(first);
    const bytes = (await reader.read()).value!;
    await reader.cancel();
    // No HTTP subscriber is attached while execution publishes its remaining events.
    const last = { type: "RUN_FINISHED", threadId: "thread", runId: "run" };
    await run.publish(last); run.finish();
    const expected = new TextEncoder().encode([first, last].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
    expect(bytes).toEqual(expected.slice(0, bytes.length));
    const offset = Buffer.from(expected).indexOf(Buffer.from("小")) + 1;
    const replay = new Uint8Array(await (await fetch(`${base}?offset=${offset}`)).arrayBuffer());
    expect(replay).toEqual(expected.slice(offset));
    expect(new Uint8Array(await (await fetch(base)).arrayBuffer())).toEqual(expected);
    expect((await fetch(`${base}?offset=${expected.length + 1}`)).status).toBe(409);
    expect((await fetch(`${base}?offset=-1`)).status).toBe(409);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
