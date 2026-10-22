import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeAgentUIProject, suggestAgentUISourceRoot, validateAgentUIProjectSetup } from "@za38.03/agent-ui-operator/bootstrap";
import {
  createAgentUIInitializationHost, handleUIOperatorRequest, inspectCreatorProject,
  installDemoPlugin,
} from "@za38.03/agent-ui-operator/project/host";
import { inspectScenarioResources, installOfficialAgentUIResource, mergeOptionalResourceInspection } from "@za38.03/agent-ui-operator/project/resources";
import { createCreatorHttpService, type CreatorMiddleware, type CreatorMiddlewareRegistry } from "./creatorHttpService.js";
import { PythonCreatorProcessManager } from "./PythonCreatorProcessManager.js";
import { CreatorWorkspaceManager } from "./workspace/CreatorWorkspaceManager.js";
import type { MockProjectInspector } from "./mock/demo-compatibility.js";

function defaultService(configRoot: string) {
  const initializationHost = createAgentUIInitializationHost();
  const workspaceManager = new CreatorWorkspaceManager({
    compatibility: true,
    inspectProject: inspectCreatorProject,
    initializeProject: input => initializeAgentUIProject(input, initializationHost),
    validateProjectSetup: validateAgentUIProjectSetup,
    suggestSourceRoot: suggestAgentUISourceRoot,
    createPythonManager: projectRoot => new PythonCreatorProcessManager({ projectRoot, configRoot, allowExternalEndpoint: false }),
  });
  const service = createCreatorHttpService({
    configRoot, workspaceManager, installMockPlugin: async (root, id) => { await installDemoPlugin(root, id); },
    installOfficialAgentUIResource: async (root, id) => { await installOfficialAgentUIResource(root, id); },
    inspectMockProject: async target => {
      const composition = await handleUIOperatorRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, target.projectRoot);
      const sources = await handleUIOperatorRequest({ operation: "inspect_agent_ui_sources", input: {} }, target.projectRoot);
      if (!composition.ok || !sources.ok) {
        const failure = !composition.ok ? composition.error : !sources.ok ? sources.error : undefined;
        throw Object.assign(new Error("CREATOR_WORKSPACE_INSPECTION_FAILED"), { code: failure?.code });
      }
      const result = { composition: composition.result, sources: sources.result } as Awaited<ReturnType<MockProjectInspector>>;
      return { ...result, sources: await mergeOptionalResourceInspection(result.sources, await inspectScenarioResources(target.projectRoot)) };
    },
  });
  return { service, workspaceManager };
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

/** Both builders must emit index.html and its relative assets into dist/browser. */
export async function startCreatorWorkbench(options: {
  configRoot?: string;
  projectRoot?: string;
  port?: number;
  browserRoot?: string;
  service?: Pick<ReturnType<typeof createCreatorHttpService>, "mount" | "dispose">;
} = {}) {
  const browserRoot = await realpath(options.browserRoot ?? fileURLToPath(new URL("./browser/", import.meta.url)));
  await stat(path.join(browserRoot, "index.html"));
  const defaultRuntime = options.service ? undefined : defaultService(path.resolve(options.configRoot ?? process.cwd()));
  const service = options.service ?? defaultRuntime!.service;
  const stack: Array<{ route: string; handler: CreatorMiddleware }> = [];
  const middlewares: CreatorMiddlewareRegistry = {
    use(routeOrHandler: string | CreatorMiddleware, handler?: CreatorMiddleware) {
      stack.push(typeof routeOrHandler === "string" ? { route: routeOrHandler, handler: handler! } : { route: "", handler: routeOrHandler });
    },
  };
  service.mount(middlewares);
  let port = 0;
  const server = createServer((request, response) => {
    const fail = (error: unknown) => {
      if (response.headersSent) { response.destroy(); return; }
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ code: "CREATOR_HTTP_REQUEST_FAILED" }));
      console.error(error);
    };
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(request.headers.host ?? "")) {
      response.writeHead(403).end(); return;
    }
    if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) {
      response.writeHead(403).end(); return;
    }
    let index = 0;
    const next = (error?: unknown): void => {
      if (error) { fail(error); return; }
      const url = request.url ?? "/";
      const pathname = url.split("?", 1)[0]!;
      let entry: typeof stack[number] | undefined;
      while ((entry = stack[index++])) {
        if (entry.route && pathname !== entry.route && !pathname.startsWith(`${entry.route}/`)) continue;
        if (entry.route) request.url = url.slice(entry.route.length) || "/";
        try {
          Promise.resolve(entry.handler(request, response, error => { request.url = url; next(error); })).catch(fail);
        } catch (error) { fail(error); }
        return;
      }
      void serveBrowser(request, response, browserRoot).catch(fail);
    };
    next();
  });
  let closed: Promise<void> | undefined;
  const close = () => closed ??= (async () => {
    // Stop accepting first, then abort streaming work before waiting for HTTP close.
    const httpClosed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await Promise.all([httpClosed, service.dispose()]);
  })();
  try {
    const requestedPort = options.port ?? 47832;
    const listen = (value: number) => new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(value, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    try { await listen(requestedPort); }
    catch (error) {
      if (options.port === undefined && (error as NodeJS.ErrnoException).code === "EADDRINUSE") await listen(0);
      else throw error;
    }
    port = (server.address() as { port: number }).port;
    if (options.projectRoot) await defaultRuntime?.workspaceManager.selectProject(options.projectRoot);
    return { url: `http://127.0.0.1:${port}/`, close };
  } catch (error) {
    if (server.listening) await close();
    else await service.dispose();
    throw error;
  }
}

async function serveBrowser(request: IncomingMessage, response: ServerResponse, root: string) {
  if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405).end(); return; }
  let logicalPath: string;
  try { logicalPath = decodeURIComponent((request.url ?? "/").split("?", 1)[0]!); }
  catch { response.writeHead(400).end(); return; }
  if (logicalPath.includes("\\") || logicalPath.includes("\0") || logicalPath.split("/").includes("..")) {
    response.writeHead(403).end(); return;
  }
  try {
    const file = await realpath(path.resolve(root, logicalPath === "/" ? "index.html" : `.${logicalPath}`));
    const relative = path.relative(root, file);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) { response.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) { response.writeHead(404).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store", "Content-Length": content.length });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) { response.writeHead(404).end(); return; }
    throw error;
  }
}
