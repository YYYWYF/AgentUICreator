import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import pluginDeliveries from "../../../../packages/plugins/src/catalog/plugin-delivery.json";
import tailwindcss from "@tailwindcss/vite";
import { createServer, type ViteDevServer } from "vite";
import { initializeAgentUIProject } from "@za38.03/agent-ui-operator/bootstrap";
import { createAgentUIInitializationHost } from "@za38.03/agent-ui-operator/dev";
import { CreatorWorkspaceManager } from "../../../../packages/creator/src/workspace/CreatorWorkspaceManager.js";
import { PythonCreatorProcessManager } from "../../../../packages/creator/src/PythonCreatorProcessManager.js";
import { inspectCreatorProject } from "@za38.03/agent-ui-operator/host";
import { suggestAgentUISourceRoot, validateAgentUIProjectSetup } from "@za38.03/agent-ui-operator/bootstrap";
import { createCreatorDevServerPlugin } from "../../../../packages/creator/src/vitePlugin.js";
import { createCreatorHostPreviewPlugin } from "../../../../packages/creator/src/host-preview/vite.js";
const repository = fileURLToPath(new URL("../../../../", import.meta.url));

/** Disposable generated Host: no mock package or Mock Vite plugin is installed. */
export async function createConnectionHostFixture(options: { mode?: "platform" | "assistant"; themeCommands?: boolean; webSearchCommands?: boolean; liveModel?: boolean; pluginsPackageRoot?: string; existingHostRoot?: string; prepareHost?: (hostRoot: string) => Promise<void> } = {}) {
  const root = realpathSync(await mkdtemp(path.join(tmpdir(), "creator-connection-host-")));
  const hostRoot = options.existingHostRoot ? realpathSync(options.existingHostRoot) : path.join(root, "host");
  const creatorRoot = path.join(root, "creator");
  const servers: ViteDevServer[] = [];
  let liveWorkspace: CreatorWorkspaceManager | undefined;
  const pending = new Set<ServerResponse>();
  let runs = 0;
  let corsEnabled = false;
  let finishRun: () => void = () => { throw new Error("Agent has not started a run."); };
  // Intentionally no CORS headers, and no preflight support.
  const agent = createHttpServer(async (request, response) => {
    if (corsEnabled) {
      response.setHeader("Access-Control-Allow-Origin", request.headers.origin ?? "*");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    }
    if (request.method !== "POST" || request.url !== "/agent") { response.writeHead(405); response.end(); return; }
    let body = ""; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body) as { threadId: string; runId: string };
    // The direct-browser CORS probe sends {}; it must not create a fake run.
    if (typeof input.threadId !== "string" || typeof input.runId !== "string") {
      response.writeHead(400); response.end(); return;
    }
    runs++;
    const messageId = `connected-${input.runId}`;
    const event = (value: object) => response.write(`data: ${JSON.stringify(value)}\n\n`);
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    event({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
    event({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
    event({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: "wire:first" });
    pending.add(response);
    response.once("close", () => pending.delete(response));
    finishRun = () => {
      event({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: " wire:finished" });
      event({ type: "TEXT_MESSAGE_END", messageId });
      if (options.webSearchCommands) {
        const toolCallId = `search-${input.runId}`;
        event({ type: "TOOL_CALL_START", toolCallId, toolCallName: "web_search", parentMessageId: messageId });
        event({ type: "TOOL_CALL_ARGS", toolCallId, delta: JSON.stringify({ query: "command capability" }) });
        event({ type: "TOOL_CALL_END", toolCallId });
        event({ type: "TOOL_CALL_RESULT", toolCallId, messageId: `result-${input.runId}`, role: "tool", content: JSON.stringify({ results: [{ title: "Installed search capability", domain: "example.com" }] }) });
      }
      event({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId });
      response.end();
    };
  });
  const close = async () => {
    await liveWorkspace?.clear();
    for (const response of pending) response.destroy();
    await Promise.all(servers.map(server => server.close()));
    await new Promise<void>(resolve => { agent.closeAllConnections(); agent.close(() => resolve()); });
    await rm(root, { recursive: true, force: true });
  };
  const link = async (projectRoot: string, name: string) => {
    const candidates = [
      ...(name === "@za38.03/agent-ui-plugins" && options.pluginsPackageRoot ? [options.pluginsPackageRoot] : []),
      // Workspace packages must use the current release, never an older installed tarball.
      ...(name.startsWith("@za38.03/agent-ui-") ? [path.join(repository, "packages", name.slice("@za38.03/agent-ui-".length))] : []),
      ...["creator-host-sandbox", "creator-assistant-host"].map(owner => path.join(repository, "examples", owner, "node_modules", name)),
      ...["react", "runtime", "operator", "creator", "plugins", "core", "renderer"].map(owner => path.join(repository, "packages", owner, "node_modules", name)),
    ];
    const source = candidates.find(existsSync);
    if (!source) throw new Error(`Missing prepared fixture dependency: ${name}`);
    const destination = path.join(projectRoot, "node_modules", name);
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
  };
  try {
    if (!options.existingHostRoot) await mkdir(hostRoot); await mkdir(creatorRoot);
    const template = JSON.parse(await readFile(path.join(repository, "packages/operator/tests/fixtures/project/package.json"), "utf8"));
    const packageManager = JSON.parse(await readFile(path.join(repository,"package.json"),"utf8")).packageManager;
    template.dependencies["@za38.03/agent-ui-plugins"] = "workspace:*";
    const devDependencies = Object.fromEntries(["tailwindcss", "tw-animate-css", "@tailwindcss/vite", ...(options.liveModel ? ["vite", "@vitejs/plugin-react", "typescript", "tsx", "@types/react", "@types/react-dom", "@types/node", "@za38.03/agent-ui-operator"] : [])].map(name => [name, template.devDependencies[name]]));
    if (!options.existingHostRoot) {
    await writeFile(path.join(hostRoot, "package.json"), JSON.stringify({ name: "ordinary-preview-host", private: true, type: "module", dependencies: template.dependencies, devDependencies, ...(options.liveModel ? {packageManager, scripts: { build: "node validate-build.mjs", typecheck:"node node_modules/typescript/bin/tsc --noEmit", "verify:ui":"node verify-ui.mjs" } } : {}) }));
    for (const name of Object.keys({ ...template.dependencies, ...devDependencies })) await link(hostRoot, name);
    await mkdir(path.join(hostRoot, "src"), { recursive: true });
    await initializeAgentUIProject({ projectRoot: hostRoot, mode: options.mode ?? "platform", sourceRoot: "src/agent-ui" }, createAgentUIInitializationHost());
    if (existsSync(path.join(hostRoot, "node_modules/@za38.03/agent-ui-creator"))) throw new Error("Host fixture must not install Mock infrastructure.");
    await writeFile(path.join(hostRoot, "index.html"), '<div id="root"></div><script type="module" src="/src/main.tsx"></script><script type="module" src="/@fs/' + path.join(repository, "examples/creator-host-sandbox/dev/creator-dock.ts").replaceAll("\\", "/") + '"></script>');
    await writeFile(path.join(hostRoot, "src/main.tsx"), 'import { createRoot } from "react-dom/client"; import { Agent } from "./agent-ui"; import "./host.css"; createRoot(document.getElementById("root")!).render(<Agent />);');
    await writeFile(path.join(hostRoot, "src/host.css"), "html,body,#root { margin:0; width:100%; height:100%; } #root { height:100dvh; }");
    }
    const workspaceId = createHash("sha256").update(realpathSync(hostRoot)).digest("hex");
    await writeFile(path.join(creatorRoot, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: { react: template.dependencies.react, "react-dom": template.dependencies["react-dom"], "@za38.03/agent-ui-creator": "workspace:*" } }));
    for (const name of ["react", "react-dom", "@za38.03/agent-ui-creator"]) await link(creatorRoot, name);
    await writeFile(path.join(creatorRoot, "index.html"), '<div id="root"></div><script type="module" src="/main.tsx"></script>');
    await writeFile(path.join(creatorRoot, "dock.html"), '<div id="root"></div><script type="module" src="/dock.tsx"></script>');
    const dockSource = await readFile(path.join(repository, "apps/creator-workbench/src/dock.tsx"), "utf8");
    await writeFile(path.join(creatorRoot, "dock.tsx"), dockSource.replace("declare const __CREATOR_HOST_WORKSPACE_ID__: string;", `const __CREATOR_HOST_WORKSPACE_ID__ = ${JSON.stringify(workspaceId)};`));
    if (options.liveModel) {
      if (!options.existingHostRoot) {
      // Dependencies are linked from this prepared workspace, without a pnpm
      // lockfile. Never let pnpm's dependency-status precheck install over them.
      await writeFile(path.join(hostRoot, ".npmrc"), "verify-deps-before-run=false\n");
      await writeFile(path.join(hostRoot, "pnpm-workspace.yaml"), "verifyDepsBeforeRun: false\n");
      await writeFile(path.join(hostRoot, "tsconfig.json"), JSON.stringify({compilerOptions:{target:"ES2022",module:"ESNext",moduleResolution:"Bundler",jsx:"react-jsx",strict:true,skipLibCheck:true,noEmit:true,resolveJsonModule:true,esModuleInterop:true,lib:["ES2022","DOM","DOM.Iterable"],types:["node","vite/client"]},include:["src"]}));
      await writeFile(path.join(hostRoot, "verify-ui.mjs"), 'import {runUIProjectVerificationCli} from "@za38.03/agent-ui-operator/dev"; await runUIProjectVerificationCli(process.cwd());');
      await writeFile(path.join(hostRoot, "validate-build.mjs"), `import {build} from "vite"; import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite"; await build({configFile:false,plugins:[react(),tailwind()],logLevel:"error",resolve:{dedupe:["react","react-dom"]},build:{write:false,lib:{entry:"src/agent-ui/application/Agent.tsx",formats:["es"]}}});`);
      await options.prepareHost?.(hostRoot);
      }
      const environment = { ...process.env, CREATOR_VERIFICATION_MODE: "static_and_runtime", CREATOR_PYTHON_HOT_RELOAD: "0", CREATOR_SELECTOR_MAX_TOKENS: "2048" };
      const initializationHost = createAgentUIInitializationHost();
      liveWorkspace = new CreatorWorkspaceManager({
        inspectProject: inspectCreatorProject,
        initializeProject: input => initializeAgentUIProject(input, initializationHost),
        validateProjectSetup: validateAgentUIProjectSetup, suggestSourceRoot: suggestAgentUISourceRoot,
        createPythonManager: projectRoot => new PythonCreatorProcessManager({ projectRoot, configRoot: repository,
          allowExternalEndpoint:false, pythonExecutable:path.join(repository,"packages/creator/python/.venv", ...(process.platform === "win32" ? ["Scripts","python.exe"] : ["bin","python"])),
          pythonPackageRoot:path.join(repository,"packages/creator/python"), environment,
          log: message => console.log("[live Creator]", message.replace(/^(.*(?:api.?key|authorization|auth.?token).*)$/gim, "[redacted configuration line]")),
        }),
      });
      await liveWorkspace.selectProject(hostRoot);
      const ready = liveWorkspace.getState();
      if (ready.status !== "ready" || ready.runtime.status !== "ready") throw new Error("Live Creator startup failed: " + JSON.stringify(ready.status === "ready" ? ready.runtime : ready.status));
    }
    const creator = await createServer({ configFile: false, root: creatorRoot, optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "@za38.03/agent-ui-creator/ui", "@za38.03/agent-ui-creator/host-preview"] }, plugins: [react(), createCreatorDevServerPlugin({ ...(options.liveModel ? { workspaceManager:liveWorkspace,configRoot:repository } : { projectRoot:hostRoot }), python: { environment: options.liveModel ? { ...process.env, CREATOR_VERIFICATION_MODE: "static_and_runtime" } : { CREATOR_VERIFICATION_MODE: "static_only" },
      ...(options.themeCommands ? { allowExternalEndpoint: false, pythonExecutable: process.env.CREATOR_THEME_TEST_PYTHON ?? path.join(repository, "packages/creator/python/.venv/bin/python"), pythonPackageRoot: path.join(repository, "packages/creator/python") } : {}), log: () => undefined } })], server: { host: "127.0.0.1", port: 0, hmr: false, fs: { allow: [root, hostRoot, repository, ...(options.pluginsPackageRoot ? [options.pluginsPackageRoot] : [])] } }, resolve: { dedupe: ["react", "react-dom"] } });
    servers.push(creator); await creator.listen();
    const creatorOrigin = creator.resolvedUrls!.local[0]!;
    const host = await createServer({ configFile: false, root: hostRoot,
      define: { "import.meta.env.VITE_CREATOR_DOCK_URL": JSON.stringify(`${creatorOrigin}dock.html`) },
      // Lazy plugin imports must not trigger dependency reloads mid-test.
      optimizeDeps: { noDiscovery: !options.liveModel, include: ["react", "react-dom/client", "@za38.03/agent-ui-plugins", "@za38.03/agent-ui-plugins/lexical", ...new Set(pluginDeliveries.map(delivery => `@za38.03/agent-ui-plugins/${delivery.supportEntry}`)), "@za38.03/agent-ui-runtime", "@za38.03/agent-ui-core", "@za38.03/agent-ui-renderer", "@base-ui/react/**", "@assistant-ui/react-lexical", "lexical", "zod", "zustand"] },
      plugins: [react(), tailwindcss(), createCreatorHostPreviewPlugin({ creatorOrigin, workspaceId })], server: { host: "127.0.0.1", port: 0, fs: { allow: [root, hostRoot, repository, ...(options.pluginsPackageRoot ? [options.pluginsPackageRoot] : [])] } }, resolve: { dedupe: ["react", "react-dom"] } });
    servers.push(host); await host.listen();
    const hostOrigin = host.resolvedUrls!.local[0]!;
    // Real Creator UI and its real iframe/source bridge. Only unrelated Creator
    // workspace metadata is supplied by the spec, avoiding a Python/model dependency.
    await writeFile(path.join(creatorRoot, "main.tsx"), `
      import { useEffect, useRef, useState } from "react";
      import { createRoot } from "react-dom/client";
      import { CreatorWorkbench } from "@za38.03/agent-ui-creator/ui";
      import { connectCreatorHostPreview } from "@za38.03/agent-ui-creator/host-preview";
      function Preview({threadId, workspaceId}) {
        const ref = useRef(null); const [revision, setRevision] = useState(0);
        useEffect(() => ref.current ? connectCreatorHostPreview(ref.current, {threadId, workspaceId, runtimeDiagnostics:${options.liveModel ? 'true' : 'false'}, visualObservation:false}) : undefined, [threadId, workspaceId, revision]);
        return <iframe ref={ref} title="Host Application" src=${JSON.stringify(`${hostOrigin}?creator-preview`)} onLoad={() => setRevision(value => value + 1)} style={{width:"100%",height:"100%",border:0}} />;
      }
      createRoot(document.getElementById("root")).render(<CreatorWorkbench previewWorkspaceId=${JSON.stringify(workspaceId)}>{context => <Preview {...context} />}</CreatorWorkbench>);
    `);
    await new Promise<void>(resolve => agent.listen(0, "127.0.0.1", resolve));
    const address = agent.address();
    if (!address || typeof address === "string") throw new Error("Missing Agent address");
    return { creatorOrigin, hostOrigin, workspaceId, hostRoot, agentEndpoint: `http://127.0.0.1:${address.port}/agent`, enableCors: () => { corsEnabled = true; }, finishRun: () => finishRun(), runCount: () => runs, pendingCount: () => pending.size, close };
  } catch (error) { await close(); throw error; }
}
