import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AgentUIUpdateService, type UpdateSourceProvider } from "@agent-ui/project-control/updates";
import type { CreatorWorkspaceManager } from "../workspace/CreatorWorkspaceManager.js";

export const CREATOR_UPDATES_API_PATH = "/__creator/updates";
export function createCreatorUpdateHandler(workspaceManager?: CreatorWorkspaceManager, projectRoot?: string, provider?: UpdateSourceProvider) {
  const creatorVersion = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version as string;
  const service = new AgentUIUpdateService(provider, creatorVersion);
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    try {
      const origin = request.headers.origin;
      if (origin && new URL(origin).host !== request.headers.host) throw new Error("更新控制仅允许当前开发页面访问。");
      if (request.method !== "POST" || !request.headers["content-type"]?.startsWith("application/json")) { response.statusCode = 405; response.end(JSON.stringify({ error: "更新请求需要 JSON POST。" })); return; }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 16384) throw new Error("请求过大。"); chunks.push(buffer); }
      const input = JSON.parse(Buffer.concat(chunks).toString());
      if (!input || typeof input !== "object" || typeof input.workspaceId !== "string") throw new Error("缺少项目标识。");
      const route = request.url?.split("?")[0];
      const run = async (root: string) => {
        if (route !== "/check" && route !== "/plan" && workspaceManager?.hasActiveCreatorRequests()) throw new Error("请等待当前 Creator 请求完成后再更新插件。");
        if (route === "/check") return service.inspect(root);
        if (route === "/plan") {
          if (!Array.isArray(input.pluginIds) || input.pluginIds.some((id: unknown) => typeof id !== "string") || typeof input.releaseVersion !== "string") throw new Error("无效升级请求。");
          return service.plan(root, input.pluginIds, input.releaseVersion);
        }
        if (typeof input.planId !== "string") throw new Error("缺少升级计划。");
        if (route === "/execute" && input.confirmed === true) return service.execute(root, input.planId);
        if (route === "/merge" && input.confirmed === true) return service.merge(root, input.planId);
        if (route === "/manual" && input.confirmed === true) return service.startManualMerge(root, input.planId);
        if (route === "/adopt" && input.confirmed === true) return service.adopt(root, input.planId);
        throw new Error("未知更新操作或尚未确认。");
      };
      const result = workspaceManager ? await workspaceManager.runProjectOperation(input.workspaceId, run) :
        projectRoot && input.workspaceId === projectRoot ? await run(projectRoot) : (() => { throw new Error("当前项目已改变。"); })();
      response.end(JSON.stringify(result));
    } catch (error) { response.statusCode = 409; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
  };
}
