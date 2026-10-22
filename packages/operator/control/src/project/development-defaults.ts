import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { API } from "typescript/unstable/sync";
import { getTokenPosOfNode } from "typescript/unstable/ast";
import { isExportAssignment } from "typescript/unstable/ast/is";
import { assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { localEnvViteSource, localEnvViteDeclaration } from "./development-env-template";

export const DEVELOPMENT_ENV_PATH = ".env.agentui.local";
export const DEVELOPMENT_ENV_ADAPTER_PATH = "agentui.vite-env.mjs";

async function readOptional(root: string, name: string): Promise<string | undefined> {
  await assertNoSymbolicLinkTraversal(root, name);
  try { return await readFile(path.join(root, name), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

/** Preserve existing configuration; this file is shared with server-only Creator settings. */
export async function installDevelopmentDefaults(projectRoot: string): Promise<readonly string[]> {
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local", DEVELOPMENT_ENV_PATH]) {
    const content = await readOptional(projectRoot, name);
    if (content !== undefined && (name === DEVELOPMENT_ENV_PATH || /^\s*(?:export\s+)?VITE_AGENT_ENDPOINT\s*=/m.test(content))) return [];
  }
  try {
    await writeFile(path.join(projectRoot, DEVELOPMENT_ENV_PATH),
      "# Agent UI local development configuration. Never commit this file.\n# Only VITE_AGENT_ENDPOINT is passed to the development frontend.\nVITE_AGENT_ENDPOINT=http://127.0.0.1:47831/agent\n",
      { flag: "wx" });
    return [DEVELOPMENT_ENV_PATH];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return [];
    throw error;
  }
}

/** Initialization owns these edits until commit; rollback preserves subsequent user edits. */
export function createDevelopmentEnvironmentInstaller() {
  const edits = new Map<string, { before: string; after: string }>();
  return {
    async install(projectRoot: string): Promise<readonly string[]> {
      projectRoot = path.resolve(projectRoot);
      const created: string[] = [];
      try {
        created.push(...await installDevelopmentDefaults(projectRoot));
        const helper = await readOptional(projectRoot, DEVELOPMENT_ENV_ADAPTER_PATH);
        if (helper !== undefined && helper !== localEnvViteSource) throw new Error("AGENT_UI_ENV_ADAPTER_ALREADY_EXISTS");
        if (helper === undefined) {
          await writeFile(path.join(projectRoot, DEVELOPMENT_ENV_ADAPTER_PATH), localEnvViteSource, { flag: "wx" });
          created.push(DEVELOPMENT_ENV_ADAPTER_PATH);
        }
        const declarationPath = "agentui.vite-env.d.mts";
        const declaration = localEnvViteDeclaration;
        const existingDeclaration = await readOptional(projectRoot, declarationPath);
        if (existingDeclaration !== undefined && existingDeclaration !== declaration) throw new Error("AGENT_UI_ENV_ADAPTER_ALREADY_EXISTS");
        if (existingDeclaration === undefined) {
          await writeFile(path.join(projectRoot, declarationPath), declaration, { flag: "wx" });
          created.push(declarationPath);
        }
        const ignore = await readOptional(projectRoot, ".gitignore");
        if (!ignore?.split(/\r?\n/u).includes(DEVELOPMENT_ENV_PATH)) {
          const after = (ignore ?? "") + (ignore && !ignore.endsWith("\n") ? "\n" : "") + DEVELOPMENT_ENV_PATH + "\n";
          const absolute = path.join(projectRoot, ".gitignore");
          if (ignore === undefined) {
            await writeFile(absolute, after, { flag: "wx" });
            created.push(".gitignore");
          } else {
            edits.set(absolute, { before: ignore, after });
            await writeFile(absolute, after);
          }
        }
        // Vite's documented config discovery order. Never modify a CJS config as ESM.
        let configName: string | undefined;
        let before: string | undefined;
        for (const name of ["vite.config.js", "vite.config.mjs", "vite.config.ts", "vite.config.cjs", "vite.config.mts", "vite.config.cts"]) {
          const content = await readOptional(projectRoot, name);
          if (content !== undefined) { configName = name; before = content; break; }
        }
        if (!configName) {
          configName = "vite.config.mjs";
          await writeFile(path.join(projectRoot, configName), 'import { withAgentUILocalEnv } from "./agentui.vite-env.mjs";\nexport default withAgentUILocalEnv({});\n', { flag: "wx" });
          created.push(configName);
        } else if (!before!.includes('"./agentui.vite-env.mjs"')) {
          const absolute = path.join(projectRoot, configName);
          let after: string;
          if (configName.endsWith(".cjs") || configName.endsWith(".cts")) {
            after = before! + '\nconst __agentUILocalConfig = module.exports;\nmodule.exports = import("./agentui.vite-env.mjs").then(({ withAgentUILocalEnv }) => withAgentUILocalEnv(__agentUILocalConfig));\n';
          } else {
            const api = new API();
            try {
              const snapshot = api.updateSnapshot({ openFiles: [absolute] });
              try {
                const file = snapshot.getDefaultProjectForFile(absolute)?.program.getSourceFile(absolute);
                const assignment = file?.statements.find(isExportAssignment);
                if (!file || file.text !== before || !assignment || assignment.isExportEquals) throw new Error("AGENT_UI_ENV_VITE_CONFIG_UNSUPPORTED");
                const start = getTokenPosOfNode(assignment.expression, file);
                after = 'import { withAgentUILocalEnv as __withAgentUILocalEnv } from "./agentui.vite-env.mjs";\n'
                  + before!.slice(0, start) + "__withAgentUILocalEnv(" + before!.slice(start, assignment.expression.end) + ")" + before!.slice(assignment.expression.end);
              } finally { snapshot.dispose(); }
            } finally { api.close(); }
          }
          if (await readFile(absolute, "utf8") !== before) throw new Error("AGENT_UI_ENV_VITE_CONFIG_CHANGED");
          edits.set(absolute, { before: before!, after });
          await writeFile(absolute, after);
        }
        return created;
      } catch (error) {
        await this.rollback(projectRoot);
        for (const name of created.reverse()) await unlink(path.join(projectRoot, name));
        throw error;
      }
    },
    async rollback(projectRoot: string) {
      projectRoot = path.resolve(projectRoot);
      for (const [absolute, edit] of edits) {
        if (path.dirname(absolute) !== projectRoot) continue;
        if (await readFile(absolute, "utf8") !== edit.after) throw new Error("AGENT_UI_ENV_VITE_CONFIG_CHANGED");
        await writeFile(absolute, edit.before);
        edits.delete(absolute);
      }
    },
  };
}
