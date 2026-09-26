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
it("prefers the generic host installer and forwards pluginless resource identity", async () => {
  const installMockResource = vi.fn(async () => {});
  const legacy = vi.fn(async () => {});
  const install = resourceInstaller({ projectRoot: "/test/project", installMockResource, installScenarioResources: legacy });
  await install("/test/project", "integration/react-hook-form");
  expect(installMockResource).toHaveBeenCalledWith("/test/project", "integration/react-hook-form");
  expect(legacy).not.toHaveBeenCalled();
  await expect(install("/test/other", "integration/react-hook-form")).rejects.toThrow("当前项目已改变");
});
it("preserves the old host option for one compatibility cycle", async () => {
  const legacy = vi.fn(async () => {});
  await resourceInstaller({ projectRoot: "/test/project", installScenarioResources: legacy })("/test/project", "demo/frontend-tool-form");
  expect(legacy).toHaveBeenCalledWith("/test/project", "demo/frontend-tool-form");
});
