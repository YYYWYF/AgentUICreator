import { fileURLToPath } from "node:url";
import { spawnPnpmSync } from "./pnpm-process.mjs";
export const publicModules = ["runtime-core", "react", "runtime", "renderer", "source-registry", "plugins", "operator", "creator", "web-component"];
export const publicPackageName = name => `@za38.03/agent-ui-${name}`;
export function buildPublicPackages() {
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  for (const name of publicModules) {
    const result = spawnPnpmSync(["--filter", publicPackageName(name), "build"], { cwd, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Public package build failed: ${name}`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) buildPublicPackages();
