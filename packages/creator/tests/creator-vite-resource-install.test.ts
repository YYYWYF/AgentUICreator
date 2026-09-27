import { expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleCreatorMockRequest } from "../src/mock/mock-api.js";
import { CREATOR_MOCK_API_PATH } from "../src/mock/types.js";
import { createCreatorDevServerPlugin } from "../src/vitePlugin.js";

vi.mock("../src/mock/mock-api.js", () => ({ handleCreatorMockRequest: vi.fn(async () => {}) }));
function resourceInstaller(options: Parameters<typeof createCreatorDevServerPlugin>[0]) {
  const middlewares = new Map<string, (request: IncomingMessage, response: ServerResponse) => void>();
  const plugin = createCreatorDevServerPlugin(options);
  const configure = plugin.configureServer as (server: unknown) => void;
  configure({ httpServer: { once: vi.fn() }, watcher: { once: vi.fn() }, middlewares: { use(path: string, middleware: (request: IncomingMessage, response: ServerResponse) => void) { middlewares.set(path, middleware); } } });
  middlewares.get(CREATOR_MOCK_API_PATH)!({} as IncomingMessage, {} as ServerResponse);
  return vi.mocked(handleCreatorMockRequest).mock.calls.at(-1)![6]!;
}
it("prefers the Official Resource installer and forwards the stable resource ID", async () => {
  const official = vi.fn(async () => {});
  const legacy = vi.fn(async () => {});
  const install = resourceInstaller({ projectRoot: "/test/project", installOfficialAgentUIResource: official, installMockResource: legacy });
  await install("/test/project", "a2ui");
  expect(official).toHaveBeenCalledWith("/test/project", "a2ui");
  expect(legacy).not.toHaveBeenCalled();
  await expect(install("/test/other", "a2ui")).rejects.toThrow("当前项目已改变");
});
it("resolves IDs internally for the old Host option for one compatibility cycle", async () => {
  const legacy = vi.fn(async () => {});
  const install = resourceInstaller({ projectRoot: "/test/project", installScenarioResources: legacy });
  await install("/test/project", "frontend-tool-form-demo");
  expect(legacy).toHaveBeenCalledWith("/test/project", "demo/frontend-tool-form");
  await install("/test/project", "a2ui");
  expect(legacy).toHaveBeenCalledWith("/test/project", "integration/a2ui");
});
