import { createRequire } from "node:module";
import type { Plugin } from "vite";

/** Inject one shared adapter into real Hosts; no Creator client is included in builds. */
export function createCreatorHostPreviewPlugin(): Plugin {
  const clientPath = createRequire(import.meta.url).resolve("@agent-ui/creator/host-preview/client");
  return {
    name: "agent-ui-creator-host-preview",
    apply: "serve",
    transformIndexHtml() {
      return [{ tag: "script", attrs: { type: "module", src: `/@fs/${clientPath}` }, injectTo: "head-prepend" }];
    },
  };
}
