import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

/** Logical paths relative to the generated source root, including Windows input. */
export function requiresCreatorHostReload(relativeFile: string): boolean {
  const logical = relativeFile.replaceAll("\\", "/");
  return logical === "agent-ui/theme/theme-config.ts"
    || (logical.startsWith("plugins/") && /\.(?:[cm]?[jt]sx?|json)$/u.test(logical));
}

/** Inject one shared adapter into real Hosts; no Creator client is included in builds. */
export function createCreatorHostPreviewPlugin(options: { creatorOrigin?: string; workspaceId?: string } = {}): Plugin {
  const clientPath = createRequire(import.meta.url).resolve("@za38.03/agent-ui-operator/host-preview/client");
  let projectRoot: string;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  return {
    name: "agent-ui-creator-host-preview",
    apply: "serve",
    configResolved(config) {
      projectRoot = config.root;
    },
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
      // A Host may start before Bootstrap creates its project metadata.
      let sourceRoot: string;
      try {
        const project = JSON.parse(readFileSync(path.join(projectRoot, ".agent-ui/project.json"), "utf8")) as { sourceRoot?: string };
        if (typeof project.sourceRoot !== "string") return;
        sourceRoot = path.resolve(projectRoot, project.sourceRoot);
      } catch { return; }
      // Registries and services initialize outside React refresh boundaries.
      // Recreate them after takeover, local source edits, undo or reapply.
      if (requiresCreatorHostReload(path.relative(sourceRoot, context.file))) {
        // Returning [] suppresses Vite's default update propagation. Invalidate the
        // canonical module first so a new iframe/reload cannot reuse its old transform.
        for (const module of context.modules) context.server.moduleGraph.invalidateModule(module);
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => context.server.ws.send({ type: "full-reload" }), 100);
        return [];
      }
    },
    closeBundle() { clearTimeout(reloadTimer); },
    transformIndexHtml() {
      return [{ tag: "script", attrs: { type: "module", src: `/@fs/${clientPath.replaceAll("\\", "/")}` }, injectTo: "head-prepend" }];
    },
  };
}
