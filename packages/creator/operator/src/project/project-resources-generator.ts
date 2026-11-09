import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { readAgentUIProjectConfig } from "./project-mode";
import { projectRelativePath, resolveAgentUIProjectPaths } from "./agent-ui-project-paths";
import { assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";

export const projectResourcesTarget = "application/resources.generated.ts";
const resourceTargets = [
  "agent-contract/frontend-tools.generated.ts",
  "agent-ui/conversation/frontend-tool-uis.generated.ts",
  "agent-ui/conversation/integrations.generated.tsx",
] as const;

/** Resolve optional resources in development tooling, never with bundler-specific browser APIs. */
export async function generateProjectResources(sourceRoot: string): Promise<string> {
  const imports: string[] = [];
  for (const target of resourceTargets) {
    await assertNoSymbolicLinkTraversal(sourceRoot, target);
    try { await readFile(path.join(sourceRoot, target)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    imports.push(target);
  }
  return [
    "// Generated from explicitly installed Agent UI resources.",
    "import { resolveAgentUIProjectResources } from '@za38.03/agent-ui-runtime/ui';",
    ...imports.map((target, index) => `import * as resource${index} from '${path.posix.relative("application", target).replace(/\.tsx?$/u, "")}';`),
    "",
    `export const projectResources = resolveAgentUIProjectResources({${imports.map((_, index) => ` resource${index}`).join(",")}${imports.length ? " " : ""}});`,
    "",
  ].join("\n");
}

/** Existing legacy applications retain their resource loading until explicitly migrated. */
export async function writeGeneratedProjectResources(projectRoot: string): Promise<{ changedPaths: string[] }> {
  const { config } = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, config);
  await assertNoSymbolicLinkTraversal(paths.sourceRoot, projectResourcesTarget);
  const destination = path.join(paths.sourceRoot, projectResourcesTarget);
  let old: string;
  try { old = await readFile(destination, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { changedPaths: [] };
    throw error;
  }
  const source = await generateProjectResources(paths.sourceRoot);
  if (old === source) return { changedPaths: [] };
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, source);
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
  return { changedPaths: [projectRelativePath(projectRoot, destination)] };
}
