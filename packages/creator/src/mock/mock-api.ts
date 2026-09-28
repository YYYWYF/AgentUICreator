import { randomUUID } from "node:crypto";
import { resolveOfficialResource, inspectOfficialResourceImplementation, OfficialResourceError } from "@agent-ui/project-control/resources";
import type { IncomingMessage, ServerResponse } from "node:http";
import { inspectMockProjectThroughControl } from "./project-inspector.js";
import { CreatorMockService, isLocalMockOrigin } from "./CreatorMockService.js";
import { inspectMockProjectCompatibility, installableMockResourceIds, mockDemoRequirements, type MockProjectTarget, type MockProjectInspector, type MockDemoCompatibility } from "./demo-compatibility.js";

const diagnostics = new WeakMap<CreatorMockService, Map<string, { diagnosticId: string; technicalDetails: unknown }>>();

export async function handleCreatorMockRequest(
  request: IncomingMessage, response: ServerResponse, service: CreatorMockService,
  resolveProject?: () => MockProjectTarget | undefined,
  installPlugin?: (projectId: string, pluginId: string) => Promise<void>,
  inspector: MockProjectInspector = inspectMockProjectThroughControl,
  installResources?: (projectId: string, resourceId: string) => Promise<void>,
  supportsResource?: (resourceId: string) => boolean,
): Promise<void> {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  const origin = request.headers.origin;
  if (origin !== undefined && !isLocalMockOrigin(origin)) {
    response.statusCode = 403;
    response.end(JSON.stringify({ error: "Mock 控制仅允许本机开发页面访问。" }));
    return;
  }
  const route = (request.url ?? "/").split("?", 1)[0];
  let installingResource: string | undefined;
  let installingProject: string | undefined;
  const projectCompatibility = async (target: MockProjectTarget | undefined): Promise<MockDemoCompatibility> => {
    const result = await inspectMockProjectCompatibility(target, inspector);
    return { ...result, canInstall: installPlugin !== undefined, canInstallResources: installResources !== undefined,
      requirements: result.requirements.map(requirement => ({ ...requirement, installable: requirement.installable &&
        ((installResources !== undefined && supportsResource?.(requirement.id) !== false) || (resolveOfficialResource(requirement.id).implementation.type === "plugin" && installPlugin !== undefined)) })),
    };
  };
  try {
    if (route === "/compatibility" && request.method === "GET") {
      response.end(JSON.stringify(await projectCompatibility(resolveProject?.()))); return;
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
    if (route === "/resource-diagnostics") {
      const fields = input as { projectId?: unknown; resourceId?: unknown };
      const project = resolveProject?.();
      if (!project || fields.projectId !== project.id) throw new Error("当前项目已改变，请刷新后重试。");
      if (typeof fields.resourceId !== "string" || !installableMockResourceIds.has(fields.resourceId)) throw new Error("不支持的官方资源。");
      const resource = resolveOfficialResource(fields.resourceId);
      const stored = diagnostics.get(service)?.get(`${project.id}:${resource.id}`);
      const facts = await inspector(project);
      const technicalDetails = inspectOfficialResourceImplementation(resource, facts.composition, facts.sources);
      if (resolveProject?.()?.id !== project.id) throw new Error("项目已切换，请刷新资源状态。");
      response.end(JSON.stringify({ resourceId: resource.id, technicalDetails, ...(stored ? { installation: stored } : {}) })); return;
    }
    if (route === "/install-resources") {
      const fields = input as { projectId?: unknown; resourceId?: unknown; sourceItemId?: unknown };
      const project = resolveProject?.();
      if (!project || fields.projectId !== project.id) throw new Error("当前项目已改变，请刷新后重试。");
      if (fields.sourceItemId !== undefined || typeof fields.resourceId !== "string" || !installableMockResourceIds.has(fields.resourceId)) throw new Error("不支持的官方资源，请使用 resourceId。");
      const resource = resolveOfficialResource(fields.resourceId);
      installingResource = resource.id; installingProject = project.id;
      const before = await projectCompatibility(project);
      if (before.status !== "checked") throw new Error("Resource inspection unavailable.");
      if (before.requirements.find(item => item.id === resource.id)?.status === "conflict") throw new OfficialResourceError("RESOURCE_CONFLICT", "Resource inspection found a conflict.");
      if (installResources && supportsResource?.(resource.id) !== false) await installResources(project.id, resource.id);
      else if (resource.implementation.type === "plugin" && installPlugin) await installPlugin(project.id, resource.implementation.pluginId);
      else throw new Error("Host resource installer unavailable.");
      const current = resolveProject?.();
      if (current?.id !== project.id) throw new Error("项目已切换，请刷新资源状态。");
      const compatibility = await projectCompatibility(current);
      if (compatibility.requirements.find(item => item.id === resource.id)?.status !== "ready") throw new Error("Resource is not ready after installation.");
      diagnostics.get(service)?.delete(`${project.id}:${resource.id}`);
      response.end(JSON.stringify(compatibility)); return;
    }
    if (route === "/install-plugin") {
      const fields = input as { projectId?: unknown; pluginId?: unknown };
      const project = resolveProject?.();
      if (!project || fields.projectId !== project.id) throw new Error("当前项目已改变，请刷新面板后重试。");
      if (typeof fields.pluginId !== "string" || !mockDemoRequirements.some(requirement => { const implementation = resolveOfficialResource(requirement.id).implementation; return implementation.type === "plugin" && implementation.pluginId === fields.pluginId; })) throw new Error("此插件不支持从 Mock 面板引入。");
      installingResource = mockDemoRequirements.find(requirement => { const implementation = resolveOfficialResource(requirement.id).implementation; return implementation.type === "plugin" && implementation.pluginId === fields.pluginId; })!.id;
      installingProject = project.id;
      if (!installPlugin) throw new Error("当前 Creator 宿主尚未配置一键引入。");
      await installPlugin(project.id, fields.pluginId);
      const current = resolveProject?.();
      if (current?.id !== project.id) throw new Error("项目已切换，请查看当前项目的插件状态。");
      const compatibility = await projectCompatibility(current);
      if (compatibility.requirements.find(requirement => { const implementation = resolveOfficialResource(requirement.id).implementation; return implementation.type === "plugin" && implementation.pluginId === fields.pluginId; })?.status !== "ready") {
        throw new Error("插件操作已完成，但尚未确认启用成功，请重新检查项目后重试。");
      }
      response.end(JSON.stringify(compatibility)); return;
    }
    let state;
    if (route === "/start") state = await service.start();
    else if (route === "/stop") state = await service.stop();
    else if (route === "/select") {
      const selection = input as { scenarioId?: unknown; speed?: unknown };
      const scenario = service.getState().scenarios.find(item => item.id === selection.scenarioId);
      if (scenario?.resources?.length) {
        const compatibility = await inspectMockProjectCompatibility(resolveProject?.(), inspector);
        if (compatibility.status !== "checked" || scenario.resources.some(resourceId => !compatibility.requirements.some(item => item.id === resourceId && item.status === "ready"))) throw new Error("请先安装所需的 Agent UI 资源，再运行场景。");
      }
      state = service.select(selection.scenarioId, selection.speed);
    } else { response.statusCode = 404; response.end(JSON.stringify({ error: "未知 Mock 操作。" })); return; }
    response.end(JSON.stringify(state));
  } catch (error) {
    response.statusCode = 400;
    if (installingResource && installingProject) {
      const resource = resolveOfficialResource(installingResource);
      const code = error instanceof Error && "code" in error && error.code === "RESOURCE_CONFLICT" ? "RESOURCE_CONFLICT" : "RESOURCE_INSTALL_FAILED";
      const message = code === "RESOURCE_CONFLICT" ? `${resource.label} 资源与当前项目存在兼容性冲突。` : `${resource.label} 资源安装失败，请重试。`;
      const diagnosticId = randomUUID();
      const technicalDetails = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack,
        ...("code" in error ? { code: error.code } : {}), ...("details" in error ? { details: error.details } : {}), ...("technicalDetails" in error ? { details: error.technicalDetails } : {}),
      } : String(error);
      const stored = diagnostics.get(service) ?? new Map();
      if (stored.size >= 100) stored.delete(stored.keys().next().value!);
      stored.set(`${installingProject}:${resource.id}`, { diagnosticId, technicalDetails });
      diagnostics.set(service, stored);
      console.error(`[Creator resource ${diagnosticId}]`, error);
      response.end(JSON.stringify({ code, message, error: message, diagnosticId }));
    } else response.end(JSON.stringify({ error: route === "/resource-diagnostics" ? "无法读取资源技术详情，请刷新后重试。" : error instanceof Error ? error.message : "Mock 操作失败。" }));
  }
}
