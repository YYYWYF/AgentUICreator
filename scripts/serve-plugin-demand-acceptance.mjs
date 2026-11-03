import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const repository = fileURLToPath(new URL("../", import.meta.url));
const fixtures = process.argv[2];
assert(fixtures, "Pass the scratch directory from verify-plugin-demand-build.mjs");
const require = createRequire(path.join(repository, "packages/creator/package.json"));
const { register } = await import(pathToFileURL(require.resolve("tsx/esm/api")).href);
register();
const load = relative => import(pathToFileURL(path.join(repository, relative)).href);
const { writeGeneratedPluginRegistry } = await load("packages/creator/operator/src/generate-plugin-registry.ts");
const { getAgentUIPluginInstances, setAgentUIPluginEnabled } = await load("packages/creator/operator/src/project/plugin-commands.ts");
const { verifyUIProject } = await load("packages/creator/operator/src/verify-ui.ts");
const { resolveAgentUIProjectPaths, operatorConfigForPaths } = await load("packages/creator/operator/src/project/agent-ui-project-paths.ts");
const mocks = await load("packages/creator/src/mock-agent/index.ts");
const host = path.join(repository, "examples/creator-assistant-host");
const hostRequire = createRequire(path.join(host, "package.json"));
const { createServer, build } = await import(pathToFileURL(hostRequire.resolve("vite")).href);
const react = (await import(pathToFileURL(hostRequire.resolve("@vitejs/plugin-react")).href)).default;
const tailwindcss = (await import(pathToFileURL(hostRequire.resolve("@tailwindcss/vite")).href)).default;
const scratch = await mkdtemp(path.join(tmpdir(), "agent-ui-live-compat-"));
const pluginIds = ["reasoning", "tool-group", "export-markdown-action", "lexical-edit-composer", "context-retrieval-message"];
const sessions = [];
async function hashes(root) {
  const result = {};
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".agent-ui", ".vite"].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        const logical = path.relative(root, file).split(path.sep).join("/");
        if (logical.endsWith("app-ui.json") || logical.endsWith("plugins/registry.generated.ts")) continue;
        result[logical] = createHash("sha256").update(await readFile(file)).digest("hex");
      }
    }
  }
  await walk(path.join(root, "src"));
  result["source-lock"] = createHash("sha256").update(await readFile(path.join(root, ".agent-ui/source-lock.json"))).digest("hex");
  return result;
}
const controls = `
const bar = document.createElement('nav');
bar.setAttribute('aria-label','Acceptance controls');
bar.style.cssText='position:fixed;left:12px;bottom:8px;max-width:calc(100vw - 24px);flex-wrap:wrap;z-index:2147483647;background:#fff;color:#13203a;border:1px solid #adb7c8;border-radius:8px;padding:8px;display:flex;gap:8px;align-items:center;font:13px system-ui;box-shadow:0 2px 12px #0002';
const title=document.createElement('strong');title.textContent=location.port+' acceptance';bar.append(title);
const status=document.createElement('output');status.setAttribute('aria-label','Acceptance status');bar.append(status);
async function info(){const s=await fetch('/__acceptance/state').then(r=>r.json()) as {pluginIds:string[];instances:{pluginId:string;enabled:boolean}[]};const selected=s.instances.filter(p=>s.pluginIds.includes(p.pluginId));status.textContent='Active '+selected.filter(p=>p.enabled).length+'/'+selected.length}
for(const [label,enabled] of [['Disable test plugins',false],['Enable test plugins',true]] as const){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{bar.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Validating…';try{const r=await fetch('/__acceptance/toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})});const s=await r.json();if(!r.ok)throw Error(s.error);location.reload()}catch(e){status.textContent=String(e);bar.querySelectorAll('button').forEach(b=>b.disabled=false)}};bar.append(b)}
document.body.append(bar);info();
window.addEventListener('agent-ui:observation',(event:Event)=>{const value=(event as CustomEvent).detail;if(value.type==='runtime-diagnostic'&&value.diagnostic.status==='error'){console.error('ACCEPTANCE_RUNTIME_DIAGNOSTIC',JSON.stringify(value.diagnostic));fetch('/__acceptance/error',{method:'POST',body:JSON.stringify({kind:'runtime-diagnostic',message:JSON.stringify(value.diagnostic)})}).catch(()=>{})}});
for(const kind of ['error','unhandledrejection'])window.addEventListener(kind,event=>{const message=event instanceof ErrorEvent?String(event.message):String((event as PromiseRejectionEvent).reason);fetch('/__acceptance/error',{method:'POST',body:JSON.stringify({kind,message})}).catch(()=>{})});
`;
for (const [mode, fixture, port] of [["legacy", "legacy-reenabled", 5291], ["optimized", "on-demand", 5292]]) {
  const root = path.join(scratch, mode);
  await mkdir(root);
  await cp(path.join(fixtures, fixture), root, { recursive: true, filter: source => !["node_modules", "dist"].includes(path.basename(source)) });
  await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  if (mode === "optimized") for (const file of ["PluginCapabilityCatalog.ts", "RuntimeCompositionBuilder.ts"]) await cp(path.join(repository, "packages/plugins/resources/registry/items/foundation/core-runtime/files/runtime/composition", file), path.join(root, "src/agent-ui/runtime/composition", file));
  const config = path.join(root, "src/agent-ui/agent-ui/conversation/config/conversation-runtime-config.ts");
  await writeFile(config, (await readFile(config, "utf8")).replace("export const conversationDataEndpoint: string | undefined = undefined;", 'export const conversationDataEndpoint: string | undefined = "/__agent-ui/mock-data";'));
  await writeFile(path.join(root, "src/acceptance-controls.ts"), controls + "\nexport {};\n");
  const main = path.join(root, "src/main.tsx");
  await writeFile(main, 'import "./acceptance-controls";\n' + await readFile(main, "utf8"));
  await writeGeneratedPluginRegistry(root, { initializeApplications: false });
  const protectedFiles = await hashes(root);
  const log = [], errors = [];
  const projectConfig = JSON.parse(await readFile(path.join(root, ".agent-ui/project.json"), "utf8"));
  const configPaths = resolveAgentUIProjectPaths(root, projectConfig);
  function typecheck() {
    const result = spawnSync(process.execPath, [path.join(host, "node_modules/typescript/bin/tsc"), "--noEmit"], { cwd: root, encoding: "utf8", shell: false });
    if (result.status !== 0) throw new Error(result.stdout || result.stderr);
  }
  typecheck();
  const plugin = { name: "acceptance-controls", configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split("?", 1)[0];
      if (!pathname?.startsWith("/__acceptance/")) return next();
      void (async () => {
        let body = ""; for await (const chunk of request) body += chunk;
        let result;
        if (pathname === "/__acceptance/state") result = { mode, root, pluginIds, instances: await getAgentUIPluginInstances(root), log, errors };
        else if (pathname === "/__acceptance/error") { errors.push(JSON.parse(body)); result = { ok: true }; }
        else if (pathname === "/__acceptance/toggle") {
          const { enabled } = JSON.parse(body);
          assert.equal(typeof enabled, "boolean");
          const instances = (await getAgentUIPluginInstances(root)).filter(instance => pluginIds.includes(instance.pluginId));
          for (const instance of instances) await setAgentUIPluginEnabled(root, instance.id, enabled, async change => {
            const target = path.join(root, ...change.path.split("/"));
            const registry = path.join(root, "src/agent-ui/plugins/registry.generated.ts");
            const previous = await readFile(registry, "utf8");
            try {
              await writeFile(target, change.after);
              await writeGeneratedPluginRegistry(root, { initializeApplications: false });
              typecheck();
              const verification = await verifyUIProject(root, operatorConfigForPaths(configPaths));
              if (verification.status !== "passed") throw new Error(JSON.stringify(verification.errors));
              log.push({ pluginId: instance.pluginId, enabled, typecheck: "passed", verification: "passed" });
              return { verification };
            } catch (error) { await writeFile(target, change.before); await writeFile(registry, previous); throw error; }
          });
          assert.deepEqual(await hashes(root), protectedFiles, "protected project files changed");
          await writeFile(path.join(root, "acceptance-events.json"), JSON.stringify({ log, errors, protectedFilesUnchanged: true }, null, 2));
          result = { ok: true };
        } else if (pathname === "/__acceptance/build") { typecheck(); await build({ root, configFile: path.join(root, "vite.config.ts"), logLevel: "warn" }); result = { ok: true }; }
        else throw new Error("Unknown acceptance route");
        response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(result));
      })().catch(error => { console.error(mode, error); response.statusCode = 500; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ error: String(error) })); });
    });
  } };
  const server = await createServer({ root, configFile: false, plugins: [react(), tailwindcss(), plugin,
    mocks.createMockAgentVitePlugin({ endpoint: "/agent", defaultScenarioId: "reasoning-tool-success" }),
    mocks.createMockConversationApiVitePlugin({ endpoint: "/__agent-ui/mock-data" }),
  ], server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [repository, await realpath(scratch)] } } });
  await server.listen();
  sessions.push({ mode, root, url: `http://127.0.0.1:${port}` });
}
await writeFile(path.join(scratch, "session.json"), JSON.stringify({ scratch, sessions }, null, 2));
console.log(JSON.stringify({ scratch, sessions }, null, 2));
