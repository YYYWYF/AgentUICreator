import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer, type ViteDevServer } from "vite";
import { initializeAgentUIProject } from "@za38.03/agent-ui-creator/bootstrap";
import { createAgentUIInitializationHost } from "@za38.03/agent-ui-creator/project/dev";
import { CreatorWorkspaceManager } from "../../../../packages/creator/src/workspace/CreatorWorkspaceManager.js";
import { CreatorProcessManager } from "../../../../packages/creator/src/CreatorProcessManager.js";
import { inspectCreatorProject } from "@za38.03/agent-ui-creator/project/host";
import { suggestAgentUISourceRoot, validateAgentUIProjectSetup } from "@za38.03/agent-ui-creator/bootstrap";
import { createCreatorDevServerPlugin } from "../../../../packages/creator/src/vitePlugin.js";
import { createCreatorHostPreviewPlugin } from "../../../../packages/creator/src/host-preview/vite.js";
const repository = fileURLToPath(new URL("../../../../", import.meta.url));

/** Disposable generated Host: no mock package or Mock Vite plugin is installed. */
export async function createConnectionHostFixture(options: { extraOptimizeDeps?: string[]; mode?: "platform" | "assistant" | "embedded"; creatorPort?: number; hostPort?: number; themeCommands?: boolean; webSearchCommands?: boolean; liveModel?: boolean; verificationMode?: "static_only" | "static_and_runtime"; projectChecks?: boolean; sourceDependencies?: boolean; pluginsPackageRoot?: string; packageRoots?: Record<string, string>; existingHostRoot?: string; prepareHost?: (hostRoot: string) => Promise<void> } = {}) {
  const verificationMode = options.verificationMode ?? "static_only";
  // Explicit opt-in for isolated upstream repair experiments. Production builds
  // and the default fixture continue resolving the installed dependency.
  const coreCandidate = process.env.AGENT_UI_TEST_CORE_CANDIDATE;
  const coreAliases: { find: string; replacement: string }[] = [];
  if (coreCandidate) {
    const candidateRoot = realpathSync(coreCandidate);
    const metadata = JSON.parse(await readFile(path.join(candidateRoot, "package.json"), "utf8"));
    if (metadata.name !== "@assistant-ui/core") throw new Error("Invalid upstream core test candidate");
    for (const [subpath, entry] of Object.entries(metadata.exports as Record<string, { default: string }>)) {
      coreAliases.push({ find: `@assistant-ui/core${subpath === "." ? "" : subpath.slice(1)}`, replacement: path.resolve(candidateRoot, entry.default) });
    }
    // Vite string aliases match prefixes; prefer specific public subpaths.
    coreAliases.sort((a, b) => b.find.length - a.find.length);
  }
  const root = realpathSync(await mkdtemp(path.join(tmpdir(), "creator-connection-host-")));
  const hostRoot = options.existingHostRoot ? realpathSync(options.existingHostRoot) : path.join(root, "host");
  const creatorRoot = path.join(root, "creator");
  const servers: ViteDevServer[] = [];
  let liveWorkspace: CreatorWorkspaceManager | undefined;
  const pending = new Set<ServerResponse>();
  let runs = 0;
  const runUrls: string[] = [];
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
    if (request.method !== "POST" || new URL(request.url ?? "/", "http://agent.local").pathname !== "/agent") { response.writeHead(405); response.end(); return; }
    let body = ""; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body) as { threadId: string; runId: string };
    // The direct-browser CORS probe sends {}; it must not create a fake run.
    if (typeof input.threadId !== "string" || typeof input.runId !== "string") {
      response.writeHead(400); response.end(); return;
    }
    runs++;
    runUrls.push(request.url!);
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
      ...(options.packageRoots?.[name] ? [options.packageRoots[name]!] : []),
      ...(name === "@za38.03/agent-ui-plugins" && options.pluginsPackageRoot ? [options.pluginsPackageRoot] : []),
      // Workspace packages must use the current release, never an older installed tarball.
      ...(name.startsWith("@za38.03/agent-ui-") ? [path.join(repository, "packages", name.slice("@za38.03/agent-ui-".length))] : []),
      ...["react", "runtime", "creator", "plugins", "core", "renderer"].map(owner => path.join(repository, "packages", owner, "node_modules", name)),
    ];
    const source = candidates.find(existsSync);
    if (!source) throw new Error(`Missing prepared fixture dependency: ${name}`);
    const destination = path.join(projectRoot, "node_modules", name);
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
  };
  try {
    if (!options.existingHostRoot) await mkdir(hostRoot); await mkdir(creatorRoot);
    const template = JSON.parse(await readFile(path.join(repository, "packages/creator/operator/tests/fixtures/project/package.json"), "utf8"));
    const packageManager = JSON.parse(await readFile(path.join(repository,"package.json"),"utf8")).packageManager;
    template.dependencies["@za38.03/agent-ui-plugins"] = "workspace:*";
    if (options.sourceDependencies) {
      const packageRoot = options.pluginsPackageRoot ?? options.packageRoots?.["@za38.03/agent-ui-plugins"] ?? path.join(repository, "packages/plugins");
      const catalog = JSON.parse(await readFile(path.join(packageRoot, "dist/catalog.json"), "utf8"));
      for (const plugin of catalog.plugins) for (const [name, range] of Object.entries(plugin.takeover?.requiredDependencies ?? {})) {
        template.dependencies[name] ??= range;
      }
    }
    const projectChecks = options.liveModel || options.projectChecks;
    const devDependencies = Object.fromEntries(["tailwindcss", "tw-animate-css", "@tailwindcss/vite", ...(projectChecks ? ["vite", "@vitejs/plugin-react", "typescript", "tsx", "@types/react", "@types/react-dom", "@types/node"] : [])].map(name => [name, template.devDependencies[name]]));
    if (!options.existingHostRoot) {
    await writeFile(path.join(hostRoot, "package.json"), JSON.stringify({ name: "ordinary-preview-host", private: true, type: "module", dependencies: template.dependencies, devDependencies, ...(projectChecks ? {packageManager, scripts: { build: "node validate-build.mjs", typecheck:"node node_modules/typescript/bin/tsc --noEmit", "verify:ui":"node verify-ui.mjs" } } : {}) }));
    for (const name of Object.keys({ ...template.dependencies, ...devDependencies })) await link(hostRoot, name);
    await link(hostRoot, "html-to-image");
    await mkdir(path.join(hostRoot, "src"), { recursive: true });
    await initializeAgentUIProject({ projectRoot: hostRoot, mode: options.mode ?? "platform", sourceRoot: "src/agent-ui" }, createAgentUIInitializationHost());
    if (existsSync(path.join(hostRoot, "node_modules/@za38.03/agent-ui-creator"))) throw new Error("Host fixture must not install Mock infrastructure.");
    await writeFile(path.join(hostRoot, "index.html"), '<div id="root"></div><script type="module" src="/src/main.tsx"></script><script type="module" src="/@fs/' + path.join(repository, "apps/creator-workbench/tests/support/creator-dock.ts").replaceAll("\\", "/") + '"></script>');
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
    if (projectChecks && !options.existingHostRoot) {
      // Dependencies are linked from this prepared workspace, without a pnpm
      // lockfile. Never let pnpm's dependency-status precheck install over them.
      await writeFile(path.join(hostRoot, ".npmrc"), "verify-deps-before-run=false\n");
      await writeFile(path.join(hostRoot, "pnpm-workspace.yaml"), "verifyDepsBeforeRun: false\n");
      await writeFile(path.join(hostRoot, "tsconfig.json"), JSON.stringify({compilerOptions:{target:"ES2022",module:"ESNext",moduleResolution:"Bundler",jsx:"react-jsx",strict:true,skipLibCheck:true,noEmit:true,resolveJsonModule:true,esModuleInterop:true,lib:["ES2022","DOM","DOM.Iterable"],types:["node","vite/client"]},include:["src"]}));
      await writeFile(path.join(hostRoot, "verify-ui.mjs"), 'import {runUIProjectVerificationCli} from '+JSON.stringify(pathToFileURL(path.join(repository, "packages/creator/dist/operator/dist/runtime/operator-runtime.mjs")).href)+'; await runUIProjectVerificationCli(process.cwd());');
      await writeFile(path.join(hostRoot, "validate-build.mjs"), `import {build} from "vite"; import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite"; await build({configFile:false,plugins:[react(),tailwind()],logLevel:"error",resolve:{dedupe:["react","react-dom"]},build:{write:false,lib:{entry:"src/agent-ui/application/Agent.tsx",formats:["es"]}}});`);
      await options.prepareHost?.(hostRoot);
    }
    if (options.liveModel) {
      const environment = { ...process.env, CREATOR_VERIFICATION_MODE: verificationMode, CREATOR_HOT_RELOAD: "0" };
      const initializationHost = createAgentUIInitializationHost();
      liveWorkspace = new CreatorWorkspaceManager({
        inspectProject: inspectCreatorProject,
        initializeProject: input => initializeAgentUIProject(input, initializationHost),
        validateProjectSetup: validateAgentUIProjectSetup, suggestSourceRoot: suggestAgentUISourceRoot,
        createRuntimeManager: projectRoot => new CreatorProcessManager({ projectRoot, configRoot: repository,
          allowExternalEndpoint:false, environment,
          log: message => console.log("[live Creator]", message.replace(/^(.*(?:api.?key|authorization|auth.?token).*)$/gim, "[redacted configuration line]")),
        }),
      });
      await liveWorkspace.selectProject(hostRoot);
      const ready = liveWorkspace.getState();
      if (ready.status !== "ready" || ready.runtime.status !== "ready") throw new Error("Live Creator startup failed: " + JSON.stringify(ready.status === "ready" ? ready.runtime : ready.status));
    }
    if (!projectChecks && !options.existingHostRoot) await options.prepareHost?.(hostRoot);
    const creator = await createServer({ configFile: false, root: creatorRoot, optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "@za38.03/agent-ui-creator/ui", "@za38.03/agent-ui-creator/host-preview"] }, plugins: [react(), createCreatorDevServerPlugin({ ...(options.liveModel ? { workspaceManager:liveWorkspace,configRoot:repository } : { projectRoot:hostRoot }), runtime: { environment: options.liveModel ? { ...process.env, CREATOR_VERIFICATION_MODE: verificationMode } : { CREATOR_VERIFICATION_MODE: verificationMode },
      ...(options.themeCommands ? { allowExternalEndpoint: false } : {}), log: () => undefined } })], server: { host: "127.0.0.1", port: options.creatorPort ?? 0, strictPort: options.creatorPort !== undefined, hmr: false, fs: { allow: [root, hostRoot, repository, ...(options.pluginsPackageRoot ? [options.pluginsPackageRoot] : [])] } }, resolve: { dedupe: ["react", "react-dom"] } });
    servers.push(creator); await creator.listen();
    const creatorOrigin = creator.resolvedUrls!.local[0]!;
    const host = await createServer({ configFile: false, root: hostRoot,
      define: { "import.meta.env.VITE_CREATOR_DOCK_URL": JSON.stringify(`${creatorOrigin}dock.html`) },
      // Keep linked product/deep imports in one Context graph, and prepare
      // preview-client dependencies up front so optimizer reloads cannot split React.
      optimizeDeps: {
        noDiscovery: true,
        exclude: ["@za38.03/agent-ui-plugins", "@za38.03/agent-ui-runtime", "@za38.03/agent-ui-core", "@za38.03/agent-ui-renderer"],
        include: [...(options.extraOptimizeDeps ?? []), "react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "html-to-image",
          "@za38.03/agent-ui-runtime > @assistant-ui/react",
          "@za38.03/agent-ui-runtime > @assistant-ui/core",
          ...(coreCandidate ? ["@za38.03/agent-ui-runtime > @assistant-ui/core > assistant-stream > secure-json-parse"] : []),
          "@za38.03/agent-ui-plugins > @assistant-ui/store",
          "@za38.03/agent-ui-runtime > @assistant-ui/react-ag-ui",
          "@za38.03/agent-ui-runtime > @assistant-ui/react-langgraph",
          "@za38.03/agent-ui-runtime > @assistant-ui/react > @assistant-ui/tap/react-shim",
          "@za38.03/agent-ui-plugins > @assistant-ui/react-markdown",
          "@za38.03/agent-ui-plugins > @assistant-ui/generative-ui/react",
          "@za38.03/agent-ui-plugins > react-markdown",
          "@za38.03/agent-ui-plugins > fast-deep-equal/es6/index.js",
          "@base-ui/react/avatar", "@base-ui/react/button", "@base-ui/react/collapsible", "@base-ui/react/dialog", "@base-ui/react/input", "@base-ui/react/merge-props", "@base-ui/react/popover", "@base-ui/react/separator", "@base-ui/react/tooltip", "@base-ui/react/use-render",
          "lexical", "@lexical/react/LexicalComposerContext", "@lexical/react/LexicalContentEditable", "@lexical/react/LexicalExtensionComposer", "@lexical/history", "@lexical/plain-text", "@lexical/utils", "lucide-react", "zod", "zustand"],
      },
      plugins: [react(), tailwindcss(), createCreatorHostPreviewPlugin({ creatorOrigin, workspaceId })], server: { host: "127.0.0.1", port: options.hostPort ?? 0, strictPort: options.hostPort !== undefined, fs: { allow: [root, hostRoot, repository, ...(coreCandidate ? [realpathSync(coreCandidate)] : []), ...(options.pluginsPackageRoot ? [options.pluginsPackageRoot] : [])] } }, resolve: { dedupe: ["react", "react-dom"], alias: coreAliases } });
    servers.push(host); await host.listen();
    const hostOrigin = host.resolvedUrls!.local[0]!;
    // Real Creator UI and its real iframe/source bridge. Only unrelated Creator
    // workspace metadata is supplied by the spec, avoiding an Agent/model dependency.
    await writeFile(path.join(creatorRoot, "main.tsx"), `
      import { useEffect, useRef, useState } from "react";
      import { createRoot } from "react-dom/client";
      import { CreatorWorkbench } from "@za38.03/agent-ui-creator/ui";
      import { connectCreatorHostPreview } from "@za38.03/agent-ui-creator/host-preview";
      function Preview({threadId, workspaceId}) {
        const ref = useRef(null); const [revision, setRevision] = useState(0);
        useEffect(() => ref.current ? connectCreatorHostPreview(ref.current, {threadId, workspaceId, runtimeDiagnostics:${options.liveModel && verificationMode === 'static_and_runtime' ? 'true' : 'false'}, visualObservation:false}) : undefined, [threadId, workspaceId, revision]);
        return <iframe ref={ref} title="Host Application" src=${JSON.stringify(`${hostOrigin}?creator-preview`)} allow="clipboard-write" onLoad={() => setRevision(value => value + 1)} style={{width:"100%",height:"100%",border:0}} />;
      }
      createRoot(document.getElementById("root")).render(<CreatorWorkbench previewWorkspaceId=${JSON.stringify(workspaceId)}>{context => <Preview {...context} />}</CreatorWorkbench>);
    `);
    await new Promise<void>(resolve => agent.listen(0, "127.0.0.1", resolve));
    const address = agent.address();
    if (!address || typeof address === "string") throw new Error("Missing Agent address");
    // These tests measure connection/command behavior, not a cold Vite module
    // graph. Prepare the static imports before the browser starts its UI waits.
    for (const [server, entry] of [[creator, "/main.tsx"], [host, "/src/main.tsx"]] as const) {
      await server.environments.client.warmupRequest(entry);
      await server.environments.client.waitForRequestsIdle();
    }
    const writeHostEntry = async (source: string) => {
      const entry = path.join(hostRoot, "src/main.tsx");
      const changed = new Promise<void>(resolve => {
        const listener = (file: string) => {
          if (path.relative(entry, path.resolve(file)) !== "") return;
          host.watcher.off("change", listener);
          resolve();
        };
        host.watcher.on("change", listener);
      });
      await writeFile(entry, source);
      await changed;
      host.environments.client.moduleGraph.invalidateAll();
      await host.environments.client.warmupRequest("/src/main.tsx");
      await host.environments.client.waitForRequestsIdle();
    };
    return { creatorOrigin, hostOrigin, workspaceId, hostRoot, writeHostEntry, agentEndpoint: `http://127.0.0.1:${address.port}/agent`, runUrls: () => [...runUrls], enableCors: () => { corsEnabled = true; }, finishRun: () => finishRun(), runCount: () => runs, pendingCount: () => pending.size, close };
  } catch (error) { await close(); throw error; }
}
