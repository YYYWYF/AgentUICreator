import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import type { RunAgentInput } from "@ag-ui/core";
import { EventSchemas } from "@ag-ui/core/schemas";
import { createServer as createViteServer } from "vite";
import * as api from "../../src/mock-agent/index.js";

const input: RunAgentInput = { threadId: "official-thread", runId: "official-run", messages: [], tools: [], context: [], state: {}, forwardedProps: {} };

describe("public Mock API boundary", () => {
  it("exports only official Mock and JSONL playback APIs", () => {
    expect(Object.keys(api).sort()).toEqual([
      "listOfficialMockScenarios", "runOfficialMockScenario", "createMockAgentHttpHandler", "createMockAgentVitePlugin",
      "createMockConversationApiVitePlugin", "parseMockRecording", "validateMockRecording", "runMockRecording",
      "MAX_MOCK_RECORDING_BYTES", "MAX_MOCK_RECORDING_EVENTS",
    ].sort());
    const catalog = api.listOfficialMockScenarios();
    expect(catalog.some(item => item.id === "simple-chat")).toBe(true);
    expect(catalog.some(item => item.id === "resumable-long-run" || item.id === "resumable-agent-plan")).toBe(false);
    expect(catalog.every(item => !("steps" in item) && !("prepareRun" in item))).toBe(true);
    catalog[0]!.title = "consumer mutation";
    expect(api.listOfficialMockScenarios()[0]!.title).not.toBe("consumer mutation");
  });

  it("rejects removed injection options and unknown official IDs", () => {
    for (const option of ["scenarios", "registry", "resolveRun", "durableStore"]) {
      const options = { [option]: [] };
      expect(() => api.createMockAgentHttpHandler(options)).toThrow("Unsupported official Mock option");
      expect(() => api.createMockAgentVitePlugin(options)).toThrow("Unsupported official Mock option");
    }
    expect(() => api.runOfficialMockScenario(input, "custom-user-scenario")).toThrow();
    expect(() => api.runOfficialMockScenario(input, "quote-reply")).toThrow();
    for (const id of ["resumable-long-run", "resumable-agent-plan"]) {
      expect(() => api.runOfficialMockScenario(input, id)).toThrow();
      expect(() => api.createMockAgentVitePlugin({ defaultScenarioId: id })).toThrow();
    }
    // @ts-expect-error custom scenario definitions are not part of the public API
    expect(() => api.runOfficialMockScenario(input, { id: "custom", steps: [] })).toThrow();
    // @ts-expect-error registries cannot be supplied by consumers
    expect(() => api.createMockAgentHttpHandler({ registry: {} })).toThrow();
  });

  it("serves official scenes through the Vite development integration", async () => {
    const plugin = api.createMockAgentVitePlugin({ endpoint: "/agent", defaultScenarioId: "simple-chat" });
    expect(plugin.apply).toBe("serve");
    const server = await createViteServer({ configFile: false, plugins: [plugin],
      server: { host: "127.0.0.1", port: 0, watch: null, ws: false },
    });
    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === "string") throw new Error("Missing Vite address");
      const response = await fetch(`http://127.0.0.1:${address.port}/agent?speed=0`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"TEXT_MESSAGE_CONTENT"');
    } finally { await server.close(); }
  });

  it("runs the official HTTP endpoint and rejects unknown scene requests", async () => {
    const handler = api.createMockAgentHttpHandler({ defaultScenarioId: "simple-chat" });
    const server = createServer((request, response) => { void handler(request, response); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing address");
      const url = `http://127.0.0.1:${address.port}/agent`;
      const catalog = await (await fetch(`${url}/scenarios`)).json();
      expect(catalog.scenarios.some((item: { id: string }) => item.id === "simple-chat")).toBe(true);
      const response = await fetch(`${url}?speed=0`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const body = await response.text();
      expect(body).toContain('"RUN_STARTED"');
      expect(body).toContain('"TEXT_MESSAGE_CONTENT"');
      expect(body).toContain('"RUN_FINISHED"');
      for (const scene of api.listOfficialMockScenarios()) {
        const result = await fetch(`${url}?speed=0&scenario=${scene.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, threadId: `scene-${scene.id}` }) });
        const events = (await result.text()).split("\n").filter(line => line.startsWith("data: ")).map(line => EventSchemas.parse(JSON.parse(line.slice(6))));
        expect(events[0]?.type, scene.id).toBe("RUN_STARTED");
        expect(["RUN_FINISHED", "RUN_ERROR"], scene.id).toContain(events.at(-1)?.type);
        if (scene.id === "context-retrieval") {
          expect(events.at(-1)?.type).toBe("RUN_FINISHED");
          expect(events.filter(event => event.type === "CUSTOM").map(event => event.value)).toEqual([null, expect.any(Object), null]);
        }
      }
      const unknown = await fetch(`${url}?scenario=custom`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      expect(unknown.status).toBe(404);
      for (const id of ["resumable-long-run", "resumable-agent-plan"]) {
        const hidden = await fetch(`${url}?scenario=${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
        expect(hidden.status).toBe(404);
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it("executes official IDs directly and exposes JSONL playback independently", async () => {
    const official = [];
    for await (const event of api.runOfficialMockScenario(input, "simple-chat", { timingScale: 0 })) official.push(event);
    expect(official.at(-1)?.type).toBe("RUN_FINISHED");
    const jsonl = official.map(event => JSON.stringify({ atMs: 0, event })).join("\n");
    const recording = api.parseMockRecording(jsonl, { id: "local-test" });
    const replay = [];
    for await (const event of api.runMockRecording(input, recording, { timingScale: 0 })) replay.push(event);
    expect(replay.map(event => event.type)).toEqual(official.map(event => event.type));
  });
});
