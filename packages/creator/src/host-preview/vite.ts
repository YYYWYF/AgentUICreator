import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

/** Inject one shared adapter into real Hosts; no Creator client is included in builds. */
export function createCreatorHostPreviewPlugin(options: { creatorOrigin?: string; workspaceId?: string } = {}): Plugin {
  const clientPath = createRequire(import.meta.url).resolve("@agent-ui/creator/host-preview/client");
  return {
    name: "agent-ui-creator-host-preview",
    apply: "serve",
    config(config) {
      const creatorOrigin = options.creatorOrigin ?? process.env.VITE_CREATOR_DOCK_URL ?? "http://127.0.0.1:5174";
      const workspaceId = options.workspaceId ?? createHash("sha256").update(realpathSync(config.root ?? process.cwd())).digest("hex");
      const proxy = { target: new URL(creatorOrigin).origin, changeOrigin: true, headers: { [CREATOR_WORKSPACE_ID_HEADER]: workspaceId } };
      return { server: { proxy: {
        "/__agent-ui/agent-proxy": proxy,
        "/__agent-ui/backend": proxy,
        "/__agent-ui/mock-data": proxy,
        "/__agent-ui/mock": proxy,
      } } };
    },
    handleHotUpdate(context) {
      // Theme providers initialize from canonical config. Recreate their service lifecycle
      // after persistent changes, including undo/reapply, rather than retaining an old service.
      if (context.file.replaceAll("\\", "/").endsWith("/agent-ui/theme/theme-config.ts")) {
        // Returning [] suppresses Vite's default update propagation. Invalidate the
        // canonical module first so a new iframe/reload cannot reuse its old transform.
        for (const module of context.modules) context.server.moduleGraph.invalidateModule(module);
        context.server.ws.send({ type: "full-reload" });
        return [];
      }
    },
    transformIndexHtml() {
      return [{ tag: "script", attrs: { type: "module", src: `/@fs/${clientPath}` }, injectTo: "head-prepend" }];
    },
  };
}
