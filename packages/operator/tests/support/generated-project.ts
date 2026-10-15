import { rm, cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeGeneratedPluginRegistry } from "../../src/generate-plugin-registry";
import { loadAgentUISourceRegistry, officialPackagePlugin } from "@za38.03/agent-ui-source-registry";
import { sourceItemLock } from "../../src/project/source-registry/installer";
import { existsSync } from "node:fs";
const supportRoot = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(supportRoot, "../../../..");
const fixtureRoot = path.resolve(supportRoot, "../fixtures/project");
let generated: Promise<string> | undefined;
/** Materialize a disposable project fixture from Source Registry templates. */
export function generatedProjectFixture(): Promise<string> {
  return generated ??= (async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agent-ui-contract-fixture-"));
    await cp(fixtureRoot, root, { recursive: true });
    const files = JSON.parse(await readFile(path.join(fixtureRoot, "registry-files.json"), "utf8")) as Record<string, string>;
    for (const [target, source] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, target)), { recursive: true });
      await cp(path.join(repositoryRoot, source), path.join(root, target));
      // Registry targets are relative to the configured Agent UI source root.
      // Keep legacy fixture paths above, and materialize the canonical tree too.
      await mkdir(path.dirname(path.join(root, "agent-ui", target)), { recursive: true });
      await cp(path.join(repositoryRoot, source), path.join(root, "agent-ui", target));
    }
    for (const directory of ["framework", "plugins", "app-ui", "application", "runtime", "services", "agent-contract", "conversation", "integrations"]) {
      await cp(path.join(root, directory), path.join(root, "agent-ui", directory), { recursive: true, force: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    await mkdir(path.join(root, "src"), { recursive: true });
    const registry = await loadAgentUISourceRegistry();
    for (const item of registry.items.filter(item => item.kind === "foundation")) {
      for (const file of item.loadedFiles) {
        await mkdir(path.dirname(path.join(root, "agent-ui", file.target)), { recursive: true });
        await writeFile(path.join(root, "agent-ui", file.target), file.content);
      }
    }
    await cp(path.join(root, "agent-ui/application/Agent.tsx"), path.join(root, "src/App.tsx"));
    await cp(path.join(repositoryRoot, "examples/creator-host-sandbox/src/host.css"), path.join(root, "src/preview-shell.css"));
    await cp(path.join(repositoryRoot, "packages/operator/presets"), path.join(root, "presets"), { recursive: true });
    await writeFile(path.join(root, "agent-ui/application/runtime-config.generated.ts"), 'export const agentUIRuntimeConfig = { mode: "platform" } as const;\n');
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    pkg.dependencies["@za38.03/agent-ui-plugins"] = "workspace:*";
    await writeFile(path.join(root, "package.json"), JSON.stringify(pkg, null, 2));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (name === "@za38.03/agent-ui-plugins") continue;
      const link = path.join(root, "node_modules", name);
      await mkdir(path.dirname(link), { recursive: true });
      const candidates = ["creator-host-sandbox", "creator-assistant-host"].map(host => path.join(repositoryRoot, "examples", host, "node_modules", name));
      candidates.push(...["react", "runtime", "operator", "creator"].map(owner => path.join(repositoryRoot, "packages", owner, "node_modules", name)));
      const source = candidates.find(existsSync);
      if (source) await symlink(source, link, "dir");
    }
    await rm(path.join(root, "agent-ui/plugins/assistant-ui-composer"), { recursive: true, force: true });
    await mkdir(path.join(root, "node_modules/@za38.03"), { recursive: true });
    await symlink(path.join(repositoryRoot, "packages/plugins"), path.join(root, "node_modules/@za38.03/agent-ui-plugins"), "dir");
    const managed = registry.items.filter(item => item.loadedFiles.length > 0 &&
      !(item.id.startsWith("plugin/") && officialPackagePlugin(item.id.slice(7))) &&
      item.loadedFiles.every(file => existsSync(path.join(root, "agent-ui", file.target))));
    await writeFile(path.join(root, ".agent-ui/source-lock.json"), JSON.stringify({
      sourceRoot: "agent-ui", items: Object.fromEntries(managed.map(item => [item.id, sourceItemLock(item, registry)])),
    }));
    await writeGeneratedPluginRegistry(root);
    // Legacy template imports use the same freshly generated catalog as agent-ui.
    await cp(path.join(root, "agent-ui/plugins/registry.generated.ts"),
      path.join(root, "plugins/registry.generated.ts"));
    return root;
  })();
}
