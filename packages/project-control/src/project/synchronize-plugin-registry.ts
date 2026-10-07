import { readFile } from "node:fs/promises";
import path from "node:path";
import { withProjectLock, recoverPendingAppUITransaction } from "./app-ui-transaction";
import { resourcePaths } from "./optional-resource-paths";
import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { generatePluginRegistry } from "./registry-generator";
import { writeGeneratedPluginRegistry } from "../generate-plugin-registry";

/** Host maintenance reads current facts while holding the existing project lock. */
export async function synchronizeAgentUIPluginRegistry(projectRoot: string) {
  return withProjectLock(projectRoot, async () => {
    await recoverPendingAppUITransaction(projectRoot);
    const result = await writeGeneratedPluginRegistry(projectRoot);
    const published = await readFile(path.join(projectRoot, result.path), "utf8");
    const { paths, config } = await resourcePaths(projectRoot);
    const model = parseAppUIModelJson(await readFile(paths.appUIModelPath, "utf8"));
    const expected = await generatePluginRegistry(projectRoot, model, { paths, config });
    if (expected.errors.length || published !== expected.capabilityCatalog.source) {
      throw new Error("PLUGIN_REGISTRY_POSTCONDITION_FAILED");
    }
    return result;
  });
}
