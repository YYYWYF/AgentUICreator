import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import { admitAppUIModelCandidate } from "./app-ui-admission";
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

function diagnostics(error: unknown, phase: string, value?: unknown): unknown[] {
  if (error instanceof z.ZodError) {
    const flatten = (issues: readonly z.core.$ZodIssue[], prefix: string[] = []): unknown[] => issues.flatMap(issue => {
      const segments = [...prefix, ...issue.path.map(String)];
      if (issue.code === "invalid_union") {
        // Zod union branches carry relative paths. Report the closest grammar
        // branch instead of asserting every alternative discriminant is required.
        let node = value;
        for (const segment of segments) node = node !== null && typeof node === "object"
          ? (node as Record<string, unknown>)[segment] : undefined;
        const discriminant = node !== null && typeof node === "object"
          ? (node as Record<string, unknown>).type : undefined;
        const matching = typeof discriminant === "string"
          ? issue.errors.filter(branch => !branch.some(problem =>
              problem.code === "invalid_value" && problem.path.length === 1 &&
              problem.path[0] === "type" && !problem.values.includes(discriminant)))
          : issue.errors;
        if (matching.length === 0) return [{ phase, path: "/" + segments.join("/"),
          code: issue.code, message: issue.message, actual: "object" }];
        const branch = [...matching].sort((left, right) => left.length - right.length)[0] ?? [];
        return flatten(branch, segments);
      }
      let actual = value;
      for (const segment of segments) actual = actual !== null && typeof actual === "object"
        ? (actual as Record<string, unknown>)[segment] : undefined;
      return [{ phase, path: "/" + segments.map(s => s.replaceAll("~", "~0").replaceAll("/", "~1")).join("/"),
        code: issue.code, message: issue.message,
        ...("expected" in issue ? { expected: issue.expected } : {}),
        actual: actual === undefined ? "missing" : Array.isArray(actual) ? "array" : actual === null ? "null" : typeof actual }];
    });
    return flatten(error.issues);
  }
  const detail = error as { code?: string; details?: unknown };
  return [{ phase, path: "", code: detail?.code ?? `${phase}_invalid`,
    message: error instanceof Error ? error.message : String(error),
    ...(detail?.details === undefined ? {} : { details: detail.details }) }];
}
async function context(projectRoot: string) {
  const { config } = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, config);
  return { paths, config: projectControlConfigForPaths(paths) };
}
export async function inspectAppUIModelSource(projectRoot: string) {
  const { paths, config } = await context(projectRoot);
  const source = await readFile(paths.appUIModelPath, "utf8");
  const inventory = await collectPluginAssets(projectRoot, paths, config);
  const result = { source, rawHash: hash(source), pluginInventory: inventory };
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (error) { return { ...result, status: "syntax_invalid" as RecoveryStatus, diagnostics: diagnostics(error, "syntax") }; }
  let model;
  try { model = parseAppUIModel(value); }
  catch (error) { return { ...result, status: "schema_invalid" as RecoveryStatus, diagnostics: diagnostics(error, "schema", value) }; }
  try { await admitAppUIModelCandidate(projectRoot, model, config, paths); }
  catch (error) { return { ...result, status: "composition_invalid" as RecoveryStatus, diagnostics: diagnostics(error, "composition") }; }
  return { ...result, status: "valid" as RecoveryStatus, diagnostics: [] };
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
    if (current.diagnostics.some(item => {
      const issue = item as { code?: string; details?: { workspaceIntegrity?: boolean } };
      return issue.code === "PLUGIN_CHILD_SLOT_CONTRACT_INVALID" || issue.details?.workspaceIntegrity === true;
    })) throw new AppUITransactionError("APP_UI_MODEL_REPAIR_WORKSPACE_INTEGRITY", "Current workspace source contracts cannot be repaired by model replacement.", { diagnostics: current.diagnostics });
    const { paths, config } = await context(projectRoot);
    let admitted;
    try { admitted = await admitAppUIModelCandidate(projectRoot, input.candidateModel, config, paths); }
    catch (error) {
      const failure = error as { code?: string; details?: { workspaceIntegrity?: boolean } };
      const code = failure.code;
      throw new AppUITransactionError(
        code === "PLUGIN_CHILD_SLOT_CONTRACT_INVALID" || failure.details?.workspaceIntegrity === true ? "APP_UI_MODEL_REPAIR_WORKSPACE_INTEGRITY" : "APP_UI_MODEL_REPAIR_CANDIDATE_INVALID",
        "Recovery candidate admission failed.", { diagnostics: diagnostics(error, "candidate", input.candidateModel) });
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
