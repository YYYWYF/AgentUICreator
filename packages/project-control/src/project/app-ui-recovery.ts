import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import { appUIModelDiagnostics } from "./app-ui-diagnostics";
import { collectPluginProjectFacts } from "./registry-generator";
import { admitAppUIModelCandidate, validateAppUIModelCandidateStructure } from "./app-ui-admission";
import { collectPluginAssets } from "./plugin-assets";
import { readAgentUIProjectConfig } from "./project-mode";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "./agent-ui-project-paths";
import { AppUITransactionError, commitFiles, recoverPendingAppUITransaction, withProjectLock, type AppUITransactionTestOptions } from "./app-ui-transaction";
import { creatorCancelMarkerSchemaPattern } from "./creator-cancel-marker";

export const appUIRepairInputSchema = z.strictObject({
  expectedRawHash: z.string().regex(/^[a-f0-9]{64}$/u),
  candidateModel: z.record(z.string(), z.unknown()),
  cancelMarker: z.string().regex(creatorCancelMarkerSchemaPattern).optional(),
});
const hash = (source: string) => createHash("sha256").update(source).digest("hex");
export type RecoveryStatus = "valid" | "syntax_invalid" | "schema_invalid" | "composition_invalid";

async function context(projectRoot: string) {
  const { config } = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, config);
  return { paths, config: projectControlConfigForPaths(paths) };
}
export async function inspectAppUIModelSource(projectRoot: string) {
  const { paths, config } = await context(projectRoot);
  const source = await readFile(paths.appUIModelPath, "utf8");
  const raw = { source, rawHash: hash(source) };
  const invalid = async (error: unknown, status: "syntax_invalid" | "schema_invalid", value?: unknown) => ({
    ...raw, pluginInventory: await collectPluginAssets(projectRoot, paths, config), status,
    diagnostics: appUIModelDiagnostics(error, status === "syntax_invalid" ? "syntax" : "schema", value),
  });
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (error) { return invalid(error, "syntax_invalid"); }
  let model;
  try { model = parseAppUIModel(value); }
  catch (error) { return invalid(error, "schema_invalid", value); }
  const facts = await collectPluginProjectFacts(projectRoot, config, paths);
  const result = { ...raw, pluginInventory: { assets: facts.assets, errors: facts.inventoryIssues } };
  try { validateAppUIModelCandidateStructure(model, facts); }
  catch (error) {
    if ((error as { details?: { workspaceIntegrity?: boolean } }).details?.workspaceIntegrity) {
      throw new AppUITransactionError("APP_UI_MODEL_WORKSPACE_INTEGRITY", "Workspace declarations prevent model health classification; repair their owning source first.", {
        ...raw, diagnostics: appUIModelDiagnostics(error, "workspace"),
      });
    }
    return { ...result, status: "composition_invalid" as const, diagnostics: appUIModelDiagnostics(error, "composition") };
  }
  return { ...result, status: "valid" as const, diagnostics: [] };

}
export async function repairAppUIModel(projectRoot: string, rawInput: unknown, options: AppUITransactionTestOptions = {}) {
  const input = appUIRepairInputSchema.parse(rawInput);
  projectRoot = path.resolve(projectRoot);
  return withProjectLock(projectRoot, async () => {
    await recoverPendingAppUITransaction(projectRoot);
    const current = await inspectAppUIModelSource(projectRoot);
    if (current.rawHash !== input.expectedRawHash) throw new AppUITransactionError(
      "APP_UI_MODEL_RECOVERY_HASH_CONFLICT", "AppUIModel source changed; inspect source again.",
      { expectedRawHash: input.expectedRawHash, actualRawHash: current.rawHash });
    if (current.status === "valid") throw new AppUITransactionError(
      "APP_UI_MODEL_RECOVERY_NOT_REQUIRED", "Use semantic mutation for a valid AppUIModel.");
    const { paths, config } = await context(projectRoot);
    let admitted;
    try { admitted = await admitAppUIModelCandidate(projectRoot, input.candidateModel, config, paths); }
    catch (error) {
      const failure = error as { code?: string; details?: { workspaceIntegrity?: boolean } };
      const code = failure.code;
      const workspaceIntegrity = code === "PLUGIN_CHILD_SLOT_CONTRACT_INVALID" || failure.details?.workspaceIntegrity === true;
      throw new AppUITransactionError(
        workspaceIntegrity ? "APP_UI_MODEL_REPAIR_WORKSPACE_INTEGRITY" : "APP_UI_MODEL_REPAIR_CANDIDATE_INVALID",
        "Recovery candidate admission failed.", { diagnostics: appUIModelDiagnostics(error, workspaceIntegrity ? "workspace" : "candidate", input.candidateModel) });
    }
    const afterSource = `${JSON.stringify(admitted.model, null, 2)}\n`;
    const afterHash = hash(afterSource);
    const transactionId = randomUUID();
    const revisionPath = path.join(path.dirname(paths.appUIModelPath), "composition-revision.generated.json");
    const optionalRead = async (file: string) => {
      try { return await readFile(file, "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    };
    const changes = [
      { relativePath: path.relative(projectRoot, paths.appUIModelPath), before: current.source, after: afterSource },
      { relativePath: path.relative(projectRoot, paths.generatedPluginRegistryPath), before: await optionalRead(paths.generatedPluginRegistryPath), after: admitted.generation.capabilityCatalog.source },
      { relativePath: path.relative(projectRoot, revisionPath), before: await optionalRead(revisionPath), after: `${JSON.stringify({ transactionId, appUIModelHash: afterHash, capabilityCatalogRevision: admitted.generation.capabilityCatalog.revision }, null, 2)}\n` },
    ].filter(change => change.before !== change.after);
    try { await commitFiles(projectRoot, transactionId, changes, {
      ...options,
      recoveryStrategy: "rollback",
      beforeCommit: async () => {
        await options.beforeCommit?.();
        for (const change of changes) {
          if (await optionalRead(path.join(projectRoot, change.relativePath)) !== change.before) {
            throw new AppUITransactionError("APP_UI_MODEL_RECOVERY_HASH_CONFLICT", "Recovery inputs changed before commit; inspect source again.");
          }
        }
      },
    }, input.cancelMarker); }
    catch (error) {
      await recoverPendingAppUITransaction(projectRoot);
      if ((error as { code?: string }).code === "APP_UI_MODEL_RECOVERY_HASH_CONFLICT") throw error;
      throw new AppUITransactionError("APP_UI_MODEL_REPAIR_COMMIT_FAILED", "Recovery transaction failed.", { cause: error instanceof Error ? error.message : String(error) }); }
    return { transactionId, changed: true, changedPaths: changes.map(change => change.relativePath).sort(), appUIModel: { beforeHash: current.rawHash, afterHash } };
  });
}
