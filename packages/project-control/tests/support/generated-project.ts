import { cp, mkdir, mkdtemp, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeGeneratedPluginRegistry } from "../../src/generate-plugin-registry";
const repositoryRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const fixtureRoot = fileURLToPath(new URL("../fixtures/project/", import.meta.url));
let generated: Promise<string> | undefined;
/** Materialize a disposable legacy contract fixture from Source Registry templates. */
export function generatedProjectFixture(): Promise<string> {
  return generated ??= (async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agent-ui-contract-fixture-"));
    await cp(fixtureRoot, root, { recursive: true });
    const files = JSON.parse(await readFile(path.join(fixtureRoot, "registry-files.json"), "utf8")) as Record<string, string>;
    for (const [target, source] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, target)), { recursive: true });
      await cp(path.join(repositoryRoot, source), path.join(root, target));
    }
    await mkdir(path.join(root, "src"), { recursive: true });
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
    return root;
  })();
}
