import type { IncomingMessage, ServerResponse } from "node:http";
import { inspectMockProjectThroughControl } from "./project-inspector.js";
import { CreatorMockService, isLocalMockOrigin } from "./CreatorMockService.js";
import { inspectMockProjectCompatibility, mockDemoRequirements, type MockProjectTarget, type MockProjectInspector } from "./demo-compatibility.js";

export async function handleCreatorMockRequest(
  request: IncomingMessage, response: ServerResponse, service: CreatorMockService,
  resolveProject?: () => MockProjectTarget | undefined,
  installPlugin?: (projectId: string, pluginId: string) => Promise<void>,
  inspector: MockProjectInspector = inspectMockProjectThroughControl,
  installResources?: (projectId: string, sourceItemId: string) => Promise<void>,
): Promise<void> {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  const origin = request.headers.origin;
  if (origin !== undefined && !isLocalMockOrigin(origin)) {
    response.statusCode = 403;
    response.end(JSON.stringify({ error: "Mock 控制仅允许本机开发页面访问。" }));
    return;
  }
  const route = (request.url ?? "/").split("?", 1)[0];
  try {
    if (route === "/compatibility" && request.method === "GET") {
      response.end(JSON.stringify({ ...await inspectMockProjectCompatibility(resolveProject?.(), inspector), canInstall: installPlugin !== undefined, canInstallResources: installResources !== undefined })); return;
    }
    if ((route === "/" || route === "") && request.method === "GET") {
      response.end(JSON.stringify(service.getState())); return;
    }
    if (request.method !== "POST") {
      response.statusCode = 405; response.end(JSON.stringify({ error: "此操作需要 POST 请求。" })); return;
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      response.statusCode = 415; response.end(JSON.stringify({ error: "请求必须使用 JSON。" })); return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > 8192) throw new Error("Mock 控制请求过大。");
      chunks.push(buffer);
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("无效的 Mock 配置。");
    if (route === "/install-resources") {
      const fields = input as { projectId?: unknown; sourceItemId?: unknown };
      const project = resolveProject?.();
      if (!project || fields.projectId !== project.id) throw new Error("当前项目已改变，请刷新后重试。");
      if (typeof fields.sourceItemId !== "string" || !mockDemoRequirements.some(item => item.sourceItemId === fields.sourceItemId)) throw new Error("不支持的 Demo 资源包。");
      if (!installResources) throw new Error("当前宿主未配置 Demo 资源安装。");
      await installResources(project.id, fields.sourceItemId);
      const current = resolveProject?.();
      if (current?.id !== project.id) throw new Error("项目已切换，请刷新资源状态。");
      const compatibility = await inspectMockProjectCompatibility(current, inspector);
      if (compatibility.requirements.find(item => item.sourceItemId === fields.sourceItemId)?.status !== "ready") throw new Error("Demo 资源尚未就绪，请刷新并检查依赖与组合。");
      response.end(JSON.stringify({ ...compatibility, canInstall: installPlugin !== undefined, canInstallResources: true })); return;
    }
    if (route === "/install-plugin") {
      const fields = input as { projectId?: unknown; pluginId?: unknown };
      const project = resolveProject?.();
      if (!project || fields.projectId !== project.id) throw new Error("当前项目已改变，请刷新面板后重试。");
      if (typeof fields.pluginId !== "string" || !mockDemoRequirements.some(requirement => requirement.plugin?.id === fields.pluginId && !requirement.sourceItemId)) throw new Error("此插件不支持从 Mock 面板引入。");
      if (!installPlugin) throw new Error("当前 Creator 宿主尚未配置一键引入。");
      await installPlugin(project.id, fields.pluginId);
      const current = resolveProject?.();
      if (current?.id !== project.id) throw new Error("项目已切换，请查看当前项目的插件状态。");
      const compatibility = await inspectMockProjectCompatibility(current, inspector);
      if (compatibility.requirements.find(requirement => requirement.plugin?.id === fields.pluginId && !requirement.sourceItemId)?.status !== "ready") {
        throw new Error("插件操作已完成，但尚未确认启用成功，请重新检查项目后重试。");
      }
      response.end(JSON.stringify({ ...compatibility, canInstall: true, canInstallResources: installResources !== undefined })); return;
    }
    let state;
    if (route === "/start") state = await service.start();
    else if (route === "/stop") state = await service.stop();
    else if (route === "/select") {
      const selection = input as { scenarioId?: unknown; speed?: unknown };
      const scenario = service.getState().scenarios.find(item => item.id === selection.scenarioId);
      if (scenario?.resources?.length) {
        const compatibility = await inspectMockProjectCompatibility(resolveProject?.(), inspector);
        if (compatibility.status !== "checked" || scenario.resources.some(resource => !compatibility.requirements.some(item => item.sourceItemId === resource.sourceItemId && item.status === "ready"))) throw new Error("请先安装并启用 Demo 资源，再运行场景。");
      }
      state = service.select(selection.scenarioId, selection.speed);
    } else { response.statusCode = 404; response.end(JSON.stringify({ error: "未知 Mock 操作。" })); return; }
    response.end(JSON.stringify(state));
  } catch (error) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Mock 操作失败。" }));
  }
}
