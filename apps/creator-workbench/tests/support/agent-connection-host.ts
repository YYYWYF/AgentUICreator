import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer, type ViteDevServer } from "vite";
import { initializeAgentUIProject } from "@agent-ui/bootstrap";
import { createAgentUIInitializationHost } from "@agent-ui/project-control/dev";
import { createCreatorDevServerPlugin } from "../../../../packages/creator/src/vitePlugin.js";
import { createCreatorHostPreviewPlugin } from "../../../../packages/creator/src/host-preview/vite.js";
const repository = fileURLToPath(new URL("../../../../", import.meta.url));

/** Disposable generated Host: no mock package or Mock Vite plugin is installed. */
export async function createConnectionHostFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "creator-connection-host-"));
  const hostRoot = path.join(root, "host");
  const creatorRoot = path.join(root, "creator");
  const servers: ViteDevServer[] = [];
  const pending = new Set<ServerResponse>();
  let runs = 0;
  let finishRun: () => void = () => { throw new Error("Agent has not started a run."); };
  // Intentionally no CORS headers, and no preflight support.
  const agent = createHttpServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/agent") { response.writeHead(405); response.end(); return; }
    let body = ""; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body) as { threadId: string; runId: string };
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
      event({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId });
      response.end();
    };
  });
  const close = async () => {
    for (const response of pending) response.destroy();
    await Promise.all(servers.map(server => server.close()));
    await new Promise<void>(resolve => { agent.closeAllConnections(); agent.close(() => resolve()); });
    await rm(root, { recursive: true, force: true });
  };
  const link = async (projectRoot: string, name: string) => {
    const candidates = [
      ...["creator-host-sandbox", "creator-assistant-host"].map(owner => path.join(repository, "examples", owner, "node_modules", name)),
      ...["react", "runtime-conversation", "project-control", "bootstrap", "creator"].map(owner => path.join(repository, "packages", owner, "node_modules", name)),
      ...(name.startsWith("@agent-ui/") ? [path.join(repository, "packages", name.slice("@agent-ui/".length))] : []),
    ];
    const source = candidates.find(existsSync);
    if (!source) throw new Error(`Missing prepared fixture dependency: ${name}`);
    const destination = path.join(projectRoot, "node_modules", name);
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(source, destination, "dir");
  };
  try {
    await mkdir(hostRoot); await mkdir(creatorRoot);
    const template = JSON.parse(await readFile(path.join(repository, "packages/project-control/tests/fixtures/project/package.json"), "utf8"));
    const devDependencies = Object.fromEntries(["tailwindcss", "tw-animate-css", "@tailwindcss/vite"].map(name => [name, template.devDependencies[name]]));
    await writeFile(path.join(hostRoot, "package.json"), JSON.stringify({ name: "ordinary-preview-host", private: true, type: "module", dependencies: template.dependencies, devDependencies }));
    for (const name of Object.keys({ ...template.dependencies, ...devDependencies })) await link(hostRoot, name);
    await initializeAgentUIProject({ projectRoot: hostRoot, mode: "platform", sourceRoot: "src/agent-ui" }, createAgentUIInitializationHost());
    if (existsSync(path.join(hostRoot, "node_modules/@agent-ui/mock-agent"))) throw new Error("Host fixture must not install Mock infrastructure.");
    await writeFile(path.join(hostRoot, "index.html"), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
    await writeFile(path.join(hostRoot, "src/main.tsx"), 'import { createRoot } from "react-dom/client"; import { Agent } from "./agent-ui"; import "./host.css"; createRoot(document.getElementById("root")!).render(<Agent />);');
    await writeFile(path.join(hostRoot, "src/host.css"), "html,body,#root { margin:0; width:100%; height:100%; } #root { height:100dvh; }");
    const workspaceId = createHash("sha256").update(realpathSync(hostRoot)).digest("hex");
    await writeFile(path.join(creatorRoot, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: { react: template.dependencies.react, "react-dom": template.dependencies["react-dom"], "@agent-ui/creator": "workspace:*" } }));
    for (const name of ["react", "react-dom", "@agent-ui/creator"]) await link(creatorRoot, name);
    await writeFile(path.join(creatorRoot, "index.html"), '<div id="root"></div><script type="module" src="/main.tsx"></script>');
    const creator = await createServer({ configFile: false, root: creatorRoot, plugins: [react(), createCreatorDevServerPlugin({ projectRoot: hostRoot, python: { environment: { CREATOR_VERIFICATION_MODE: "static_only" }, log: () => undefined } })], server: { host: "127.0.0.1", port: 0, fs: { allow: [root, repository] } }, resolve: { dedupe: ["react", "react-dom"] } });
    servers.push(creator); await creator.listen();
    const creatorOrigin = creator.resolvedUrls!.local[0]!;
    const host = await createServer({ configFile: false, root: hostRoot, plugins: [react(), tailwindcss(), createCreatorHostPreviewPlugin({ creatorOrigin, workspaceId })], server: { host: "127.0.0.1", port: 0, fs: { allow: [root, repository] } }, resolve: { dedupe: ["react", "react-dom"] } });
    servers.push(host); await host.listen();
    const hostOrigin = host.resolvedUrls!.local[0]!;
    // Real Creator UI and its real iframe/source bridge. Only unrelated Creator
    // workspace metadata is supplied by the spec, avoiding a Python/model dependency.
    await writeFile(path.join(creatorRoot, "main.tsx"), `
      import { useEffect, useRef, useState } from "react";
      import { createRoot } from "react-dom/client";
      import { CreatorWorkbench } from "@agent-ui/creator/ui";
      import { connectCreatorHostPreview } from "@agent-ui/creator/host-preview";
      function Preview({threadId, workspaceId}) {
        const ref = useRef(null); const [revision, setRevision] = useState(0);
        useEffect(() => ref.current ? connectCreatorHostPreview(ref.current, {threadId, workspaceId, runtimeDiagnostics:false, visualObservation:false}) : undefined, [threadId, workspaceId, revision]);
        return <iframe ref={ref} title="Host Application" src=${JSON.stringify(`${hostOrigin}?creator-preview`)} onLoad={() => setRevision(value => value + 1)} style={{width:"100%",height:"100%",border:0}} />;
      }
      createRoot(document.getElementById("root")).render(<CreatorWorkbench previewWorkspaceId=${JSON.stringify(workspaceId)}>{context => <Preview {...context} />}</CreatorWorkbench>);
    `);
    await new Promise<void>(resolve => agent.listen(0, "127.0.0.1", resolve));
    const address = agent.address();
    if (!address || typeof address === "string") throw new Error("Missing Agent address");
    return { creatorOrigin, hostOrigin, workspaceId, hostRoot, agentEndpoint: `http://127.0.0.1:${address.port}/agent`, finishRun: () => finishRun(), runCount: () => runs, pendingCount: () => pending.size, close };
  } catch (error) { await close(); throw error; }
}
