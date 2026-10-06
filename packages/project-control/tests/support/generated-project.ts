import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeGeneratedPluginRegistry } from "../../src/generate-plugin-registry";
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
    }
    for (const directory of ["framework", "plugins", "app-ui", "application", "runtime", "services", "agent-contract", "conversation", "integrations"]) {
      await cp(path.join(root, directory), path.join(root, "agent-ui", directory), { recursive: true, force: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    await mkdir(path.join(root, "src"), { recursive: true });
    await cp(path.join(root, "agent-ui/application/Agent.tsx"), path.join(root, "src/App.tsx"));
    await cp(path.join(repositoryRoot, "examples/creator-host-sandbox/src/host.css"), path.join(root, "src/preview-shell.css"));
    await cp(path.join(repositoryRoot, "packages/bootstrap/presets"), path.join(root, "presets"), { recursive: true });
    await writeFile(path.join(root, "agent-ui/application/runtime-config.generated.ts"), 'export const agentUIRuntimeConfig = { mode: "platform" } as const;\n');
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const link = path.join(root, "node_modules", name);
      await mkdir(path.dirname(link), { recursive: true });
      const candidates = ["creator-host-sandbox", "creator-assistant-host"].map(host => path.join(repositoryRoot, "examples", host, "node_modules", name));
      candidates.push(...["react", "runtime-conversation", "project-control", "bootstrap"].map(owner => path.join(repositoryRoot, "packages", owner, "node_modules", name)));
      const { existsSync } = await import("node:fs");
      const source = candidates.find(existsSync);
      if (source) await symlink(source, link, "dir");
    }
    await writeGeneratedPluginRegistry(root);
    // Legacy template imports use the same freshly generated catalog as agent-ui.
    await cp(path.join(root, "agent-ui/plugins/registry.generated.ts"),
      path.join(root, "plugins/registry.generated.ts"));
    return root;
  })();
}
