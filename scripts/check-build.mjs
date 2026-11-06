import { fileURLToPath } from "node:url";
import { checkDependencyPins } from "./check-dependency-pins.mjs";
import { syncPackageReleaseMetadata } from "./sync-package-release-metadata.mjs";
import { hostPackages } from "./preparation-state.mjs";
import { spawnPnpmSync } from "./pnpm-process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
await checkDependencyPins(root);
for (const name of [...hostPackages, "creator"]) {
  await syncPackageReleaseMetadata(name, root, { checkOnly: true });
}
for (const [name, command] of [["plugins", "check:build"], ["runtime", "check:public-boundary"]]) {
  const result = spawnPnpmSync(["--filter", `@za38.03/agent-ui-${name}`, command], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} ${command} failed`);
}
