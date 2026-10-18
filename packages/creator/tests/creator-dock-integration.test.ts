import { expect, it, vi } from "vitest";
import { creatorDockIntegration } from "../src/dock/integration.js";
import { createCreatorDockRsbuildPlugin } from "../src/dock/rsbuild.js";
import { createCreatorDockVitePlugin } from "../src/dock/vite.js";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

it("injects a packaged classic script with project identity and no source paths", () => {
  const root = process.cwd();
  const integration = creatorDockIntegration({ projectRoot: root, creatorUrl: "http://127.0.0.1:48111", locale: "en-US" });
  expect(integration.workspaceId).toBe(createHash("sha256").update(realpathSync(root)).digest("hex"));
  expect(integration.script.attrs.src).toBe("http://127.0.0.1:48111/dock-client.js");
  expect(integration.script.attrs.type).toBeUndefined();
  expect(JSON.stringify(integration.script)).not.toContain(root);
  expect(integration.proxies["/__agent-ui/agent-proxy"]!.headers.origin).toBe("http://127.0.0.1:48111");
  expect(() => creatorDockIntegration({ creatorUrl: "file:///C:/Creator" })).toThrow("CREATOR_DOCK_URL_INVALID");
});

it("Vite applies the dock and proxy only to the dev server", () => {
  const plugin = createCreatorDockVitePlugin({ projectRoot: process.cwd() });
  expect(plugin.apply).toBe("serve");
  const config = plugin.config as (config: object) => { server: { proxy: object } };
  const transform = plugin.transformIndexHtml as unknown as () => Array<{ attrs: object; injectTo: string }>;
  expect(config({}).server.proxy).toHaveProperty("/__agent-ui/mock");
  expect(transform()[0]!.injectTo).toBe("body");
  expect(transform()[0]!.attrs).toMatchObject({
    src: "/__agent-ui/creator-dock/client.js",
    "data-creator-url": "http://127.0.0.1:47832",
    "data-creator-status": "/__agent-ui/creator-dock/status",
  });
});

it("Rsbuild injects after dev startup and omits the dock during production build", () => {
  const plugin = createCreatorDockRsbuildPlugin({ projectRoot: process.cwd() });
  type API = Parameters<typeof plugin.setup>[0];
  let start!: () => void;
  let build!: () => void;
  let close!: () => void;
  let modify!: Parameters<API["modifyHTMLTags"]>[0];
  let config!: Parameters<API["modifyRsbuildConfig"]>[0];
  plugin.setup({
    onBeforeStartDevServer: callback => { start = callback; },
    onBeforeBuild: callback => { build = callback; },
    onCloseDevServer: callback => { close = callback; },
    modifyHTMLTags: callback => { modify = callback; },
    modifyRsbuildConfig: callback => { config = callback; },
  });
  const existing = { server: { proxy: { "/existing": "http://existing.test" } } };
  config(existing);
  expect(existing.server.proxy).toHaveProperty("/existing");
  const arrayConfig = { server: { proxy: [{ pathFilter: "/existing", target: "http://existing.test" }] } };
  config(arrayConfig);
  expect(arrayConfig.server.proxy).toHaveLength(5);
  expect(arrayConfig.server.proxy[1]!.pathFilter).toBe("/__agent-ui/agent-proxy");
  const tags = { headTags: [], bodyTags: [] };
  expect(modify(tags).bodyTags).toHaveLength(0);
  start();
  expect(modify(tags).bodyTags).toHaveLength(1);
  expect(tags.bodyTags).toHaveLength(0);
  build();
  expect(modify(tags).bodyTags).toHaveLength(0);
  start(); close();
  expect(modify(tags).bodyTags).toHaveLength(0);
});


it("Vite probes only the configured Creator and requires the same project identity", async () => {
  const integration = creatorDockIntegration({ projectRoot: process.cwd() });
  const plugin = createCreatorDockVitePlugin({ projectRoot: process.cwd() });
  (plugin.config as Function)({});
  let middleware!: Function;
  (plugin.configureServer as Function)({ middlewares: { use: (handler: Function) => { middleware = handler; } } });
  const fetchStatus = vi.fn();
  vi.stubGlobal("fetch", fetchStatus);
  try {
    const response = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    await middleware({ url: "/business", method: "GET" }, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(fetchStatus).not.toHaveBeenCalled();
    for (const [id, online] of [[integration.workspaceId, true], ["another-project", false], [undefined, false]] as const) {
      fetchStatus.mockResolvedValueOnce({ ok: true, json: async () => ({ workspace: { id } }) });
      await middleware({ url: "/__agent-ui/creator-dock/status", method: "GET" }, response, next);
      expect(response.end).toHaveBeenLastCalledWith(JSON.stringify({ online }));
    }
    fetchStatus.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await middleware({ url: "/__agent-ui/creator-dock/status", method: "GET" }, response, next);
    expect(response.end).toHaveBeenLastCalledWith('{"online":false}');
    expect(String(fetchStatus.mock.calls[0]![0])).toBe("http://127.0.0.1:47832/__agent-ui/creator/workspace");
  } finally { vi.unstubAllGlobals(); }
});
