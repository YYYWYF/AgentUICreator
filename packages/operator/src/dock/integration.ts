import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";

export interface CreatorDockIntegrationOptions {
  creatorUrl?: string;
  projectRoot?: string;
  locale?: "en-US" | "zh-CN";
}
export interface CreatorDockHtmlTag {
  tag: string;
  attrs: Record<string, string | boolean>;
}

export function creatorDockIntegration(options: CreatorDockIntegrationOptions = {}) {
  const origin = new URL(options.creatorUrl ?? process.env.CREATOR_DOCK_URL ?? "http://127.0.0.1:47832").origin;
  if (!/^https?:\/\//u.test(origin)) throw new Error("CREATOR_DOCK_URL_INVALID");
  const workspaceId = createHash("sha256").update(realpathSync(options.projectRoot ?? process.cwd())).digest("hex");
  const script: CreatorDockHtmlTag = { tag: "script", attrs: {
    src: new URL("/dock-client.js", origin).href, defer: true,
    "data-creator-workspace": workspaceId,
    ...(options.locale ? { "data-creator-locale": options.locale } : {}),
  } };
  const proxy = { target: origin, changeOrigin: true, headers: {
    [CREATOR_WORKSPACE_ID_HEADER]: workspaceId, origin,
  } };
  const proxies = Object.fromEntries([
    "/__agent-ui/agent-proxy", "/__agent-ui/backend", "/__agent-ui/mock-data", "/__agent-ui/mock",
  ].map(route => [route, proxy]));
  return { script, proxies, workspaceId };
}
