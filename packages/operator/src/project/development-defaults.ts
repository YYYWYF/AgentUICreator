import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEVELOPMENT_ENV_PATH = ".env.development.local";

/** Vite reads this file only in development; production keeps the Host endpoint. */
export async function installDevelopmentDefaults(projectRoot: string): Promise<readonly string[]> {
  for (const name of [".env", ".env.local", ".env.development", DEVELOPMENT_ENV_PATH]) {
    try {
      const content = await readFile(path.join(projectRoot, name), "utf8");
      if (name === DEVELOPMENT_ENV_PATH || /^\s*(?:export\s+)?VITE_AGENT_ENDPOINT\s*=/m.test(content)) return [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  try {
    await writeFile(path.join(projectRoot, DEVELOPMENT_ENV_PATH),
      "# Local Mock Agent for development. Start it from the Creator Mock Agent panel.\nVITE_AGENT_ENDPOINT=http://127.0.0.1:47831/agent\n",
      { flag: "wx" });
    return [DEVELOPMENT_ENV_PATH];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return [];
    throw error;
  }
}
