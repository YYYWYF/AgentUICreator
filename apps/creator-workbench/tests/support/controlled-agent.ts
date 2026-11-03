import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./agent-connection-host.js";

import type { ControlledRunInput } from "./controlled-agent-protocol.js";
export { startRun, finishRun, writeEvent, type ControlledRunInput } from "./controlled-agent-protocol.js";

/** Test-owned local HTTP service and disposable generated application. */
export async function createControlledAgentHost(options: {
  run: (input: ControlledRunInput, response: ServerResponse, index: number) => void | Promise<void>;
  other?: (request: IncomingMessage, response: ServerResponse, body: Buffer) => void | Promise<void>;
  application?: (origin: string) => { imports?: string; declarations?: string; props?: string };
  prepareHost?: (root: string, origin: string) => Promise<void>;
}) {
  const requests: ControlledRunInput[] = [];
  const failures: string[] = [];
  const streams = new Set<ServerResponse>();
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    streams.add(response); response.once("close", () => streams.delete(response));
    try {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      if (request.method === "POST" && request.url === "/agent") {
        const input = JSON.parse(body.toString()) as ControlledRunInput;
        requests.push(input); await options.run(input, response, requests.length);
      } else if (options.other) await options.other(request, response, body);
      else { response.writeHead(404); response.end(); }
    } catch (error) {
      failures.push(String(error));
      if (!response.headersSent) response.writeHead(500);
      response.end("Controlled fixture failed");
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const closeServer = async () => {
    for (const stream of streams) stream.destroy();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  };
  try {
    const fixture = await createConnectionHostFixture({ prepareHost: async root => {
      const application = options.application?.(origin) ?? {};
      await writeFile(path.join(root, "src/main.tsx"), `
        import {createRoot} from "react-dom/client";
        import {Agent} from "./agent-ui"; import "./host.css";
        ${application.imports ?? ""}
        ${application.declarations ?? ""}
        createRoot(document.getElementById("root")!).render(<Agent endpoint={${JSON.stringify(`${origin}/agent`)}} ${application.props ?? ""}/>);
      `);
      await options.prepareHost?.(root, origin);
    } });
    return { ...fixture, origin, requests, failures, async close() { await closeServer(); await fixture.close(); } };
  } catch (error) { await closeServer(); throw error; }
}
