import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sourceRoot, projectCommandPaths, readTransaction, restoreTransaction } from "./activity.js";
import { readCreatorFileState as read, creatorContentHash as hash } from "./files/creatorFileState.js";
import { requestOperator } from "./operator.js";
import { inspectRuntime } from "./runtime-evidence.js";
import type { ToolContext } from "./tools.js";

type Add = (name: string, description: string, schema: any, invoke: (input: any) => any) => void;
export function addExtraTools(context: ToolContext, add: Add) {
  const inspected = new Map<string, string>();
  const runSchema = z.object({ run_id: z.string().optional(), runId: z.string().optional(), page: z.number().int().min(1).default(1) });
  const runId = (input: any): string => { const value = input.run_id ?? input.runId; if (typeof value !== "string" || !value) throw new Error("CREATOR_RUN_ID_REQUIRED"); return value; };
  const transaction = async (id: string) => {
    const record = await readTransaction(context.root, id);
    const digest = hash(JSON.stringify(record));
    const conflicts = [];
    const undone = (await read(context.root, `.agent-ui/creator/transactions/${hash(id)}.json.undone`)).exists;
    for (const file of record.files) {
      const current = await read(context.root, file.path), expected = undone ? file.before : file.after;
      if (current.hash !== expected.hash || current.exists !== expected.exists) conflicts.push({ path: file.path, expectedHash: expected.hash, actualHash: current.hash });
    }
    return { record, digest, conflicts, undone };
  };
  add("inspect_creator_transactions", "Page through recorded run summaries. Recency alone does not select a recovery target; inspect its full scope before undo.", z.object({ offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(20).default(10) }), async input => {
    let names: string[];
    try { names = (await readdir(path.join(context.root, ".agent-ui/creator/transactions"))).filter(name => /^[a-f0-9]{64}\.json$/u.test(name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "evidence_missing", transactions: [] }; throw error; }
    const records: any[] = [];
    for (const name of names.slice(0, 500)) {
      const saved = await read(context.root, `.agent-ui/creator/transactions/${name}`);
      const raw = JSON.parse(saved.content ?? "{}");
      const record = await readTransaction(context.root, raw.runId);
      records.push({ runId: record.runId, createdAt: record.createdAt, changedPaths: [...record.files.map(file => file.path), ...(record.unrecoverablePaths ?? [])], fileCount: record.files.length + (record.unrecoverablePaths?.length ?? 0) });
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { status: records.length ? "available" : "evidence_missing", transactions: records.slice(input.offset, input.offset + input.limit), total: records.length, nextOffset: input.offset + input.limit < records.length ? input.offset + input.limit : null };
  });
  add("inspect_creator_transaction", "Inspect the complete recorded scope and current conflicts before recovery. Saved before-state content is not an original-template reset.", runSchema, async input => {
    const id = runId(input), value = await transaction(id);
    inspected.set(id, value.digest);
    return { status: "available", runId: id, transactionId: value.digest, page: 1, pageComplete: true, nextPage: null, changedPaths: [...value.record.files.map(file => file.path), ...(value.record.unrecoverablePaths ?? [])], files: value.record.files.map(file => ({ path: file.path, status: file.status, beforeHash: file.before.hash, afterHash: file.after.hash })), recovery: { undoable: !value.undone && !value.conflicts.length && !value.record.unrecoverablePaths?.length && value.record.files.every(file => !file.before.exists || file.before.content !== undefined), alreadyUndone: value.undone, conflicts: value.conflicts, ...(value.record.unrecoverablePaths?.length ? { unavailablePaths: value.record.unrecoverablePaths } : {}) } };
  });
  add("inspect_creator_transaction_change", "Read a bounded saved before/after change for one recorded path.", z.object({ run_id: z.string(), path: z.string() }), async input => {
    const value = await transaction(input.run_id);
    if (value.record.unrecoverablePaths?.length) throw new Error("CREATOR_TRANSACTION_CONTENT_UNAVAILABLE");
    const file = value.record.files.find(item => item.path === input.path);
    if (!file) throw new Error("CREATOR_TRANSACTION_PATH_NOT_FOUND");
    return { runId: input.run_id, path: file.path, before: file.before.content?.slice(0, 24000), after: file.after.content?.slice(0, 24000), truncated: (file.before.content?.length ?? 0) > 24000 || (file.after.content?.length ?? 0) > 24000 };
  });
  add("inspect_creator_baseline", "Read recorded before-state evidence for a specific run. Never claim an original-template reset without such evidence.", z.object({ path: z.string(), run_id: z.string().optional() }), async input => {
    if (!input.run_id) return { status: "evidence_missing", nextAction: "inspect_creator_transactions_and_select_requested_scope" };
    const record = await readTransaction(context.root, input.run_id);
    const file = record.files.find(item => item.path === input.path);
    return file ? { status: "available", runId: input.run_id, path: file.path, before: file.before } : { status: "evidence_missing" };
  });
  add("undo_creator_run", "Undo the explicitly requested whole run only after full scope inspection. A partial path set or stale transaction digest is rejected.", z.object({ run_id: z.string(), transaction_id: z.string(), requested_paths: z.array(z.string()).min(1).max(500) }), async input => {
    if (context.readOnly) throw new Error("TOOL_PERMISSION_DENIED");
    const value = await transaction(input.run_id);
    if (inspected.get(input.run_id) !== input.transaction_id || value.digest !== input.transaction_id) throw new Error("CREATOR_TRANSACTION_CHANGED");
    if (JSON.stringify([...new Set(input.requested_paths)].sort()) !== JSON.stringify(value.record.files.map(file => file.path).sort())) throw new Error("CREATOR_RECOVERY_SCOPE_MISMATCH");
    const result = await restoreTransaction(context.root, input.run_id, "undo", context.signal);
    await context.activity.recordRecovery(input.run_id, "undo", result.changedPaths);
    return { ...result, completion: { status: value.undone ? "already_recovered" : "recovered" } };
  });
  add("verify_ui_plugin_behavior", "Run project Playwright interactions for an existing Plugin or a newly created Plugin. Verification needs no development approval. Missing, skipped, flaky, stale or failed tests never prove completion.", z.object({ pluginId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/u).optional(), interactions: z.array(z.string().min(1).max(1000)).max(100).optional() }), async input => {
    const pluginId = input.pluginId ?? context.activePluginId ?? context.editingSelection?.target?.pluginId;
    if (!pluginId) throw new Error("PLUGIN_VERIFICATION_TARGET_REQUIRED");
    const definition = await read(context.root, `${await sourceRoot(context.root)}/plugins/${pluginId}/definition.ts`);
    if (!definition.exists) throw new Error("PLUGIN_NOT_FOUND");
    const plan = context.pluginPlans?.get(pluginId);
    const interactions = input.interactions ?? plan?.contract.interactions ?? [];
    const result = await context.validation!.behavior(pluginId, interactions);
    (context.behavior ??= new Map()).set(pluginId, { ...result, interactionHash: hash(JSON.stringify(interactions)) });
    return result;
  });
  add("inspect_ui_plugin_delivery", "Inspect actual creation, registry, composition, static validation, runtime geometry and browser-test evidence for approved Plugin deliveries.", z.object({}), async () => {
    const source = await sourceRoot(context.root);
    const project = await requestOperator(context.root, "inspect_ui_project", {}, context.signal);
    const deliveries = [];
    for (const [pluginId, plan] of context.pluginPlans ?? []) {
      const files = await Promise.all(["manifest.json", "definition.ts", "index.tsx"].map(name => read(context.root, `${source}/plugins/${pluginId}/${name}`)));
      let created = files.every(file => file.exists && file.content?.trim());
      try { created = Boolean(created && JSON.parse(files[0]!.content!).id === pluginId); } catch { created = false; }
      // The generated Runtime catalog intentionally includes selected Plugins.
      // Source-only delivery is registered in the Host's authoring inventory;
      // it must not create a composition instance to force a Runtime import.
      const inventoried = (project.pluginAssets ?? []).some((asset: any) => asset.pluginId === pluginId && asset.ownership === "project_source");
      const registered = created && (plan.sourceOnly ? inventoried : (project.capabilityCatalog?.pluginIds ?? []).includes(pluginId)) && project.capabilityCatalog?.generatedFileFresh === true;
      const instances = (project.plugins ?? []).filter((item: any) => item.pluginId === pluginId && item.enabled !== false);
      const applicationIds = new Set(JSON.parse((await read(context.root, (await projectCommandPaths(context.root)).model)).content ?? "{}").applicationPlugins?.map((item: any) => item.id) ?? []);
      const composed = instances.length > 0 && (plan.contract.renderingCategory !== "application" || instances.every((item: any) => applicationIds.has(item.id)));
      const staticPassed = context.activity.validationRevision === context.activity.revision && context.activity.revision > 0;
      const behavior = context.behavior?.get(pluginId);
      const behaviorPassed = behavior?.status === "passed" && behavior.revision === context.activity.revision && behavior.interactionHash === hash(JSON.stringify(plan.contract.interactions ?? []));
      let runtimePassed = false;
      if (context.verificationMode === "static_and_runtime" && !plan.sourceOnly) {
        const runtime = await inspectRuntime(context, { instanceIds: instances.map((item: any) => item.id) });
        runtimePassed = runtime.compositionFresh && runtime.currentErrors.length === 0;
        for (const geometry of plan.contract.geometry ?? []) {
          const instance = runtime.instances?.find((item: any) => item.instanceId === geometry.instanceId);
          const actual = instance?.rect?.[geometry.property];
          if (typeof actual !== "number" || Math.abs(actual - geometry.expected) > (geometry.tolerance ?? 1)) runtimePassed = false;
        }
      }
      const blockers = [];
      if (!created) blockers.push("PLUGIN_SOURCE_MISSING"); if (!registered) blockers.push("PLUGIN_NOT_REGISTERED"); if (!plan.sourceOnly && !composed) blockers.push("PLUGIN_NOT_COMPOSED"); if (!staticPassed) blockers.push("PLUGIN_STATIC_VERIFICATION_MISSING");
      if (context.verificationMode === "static_and_runtime" && !plan.sourceOnly && !runtimePassed) blockers.push("PLUGIN_RUNTIME_VERIFICATION_MISSING");
      if (context.verificationMode === "static_and_runtime" && !plan.sourceOnly && (plan.contract.interactions?.length || plan.contract.verificationMethod === "browser-test") && !behaviorPassed) blockers.push("PLUGIN_BEHAVIOR_VERIFICATION_MISSING");
      deliveries.push({ pluginId, projectRevision: context.activity.revision, deliveryScope: plan.sourceOnly ? "source-only" : "full", registrationScope: plan.sourceOnly ? "authoring-inventory" : "runtime-catalog", decision: { type: plan.workKind }, authorization: { status: plan.status }, contract: plan.contract,
        delivery: { status: blockers.length ? "blocked" : context.verificationMode === "static_only" ? "statically-verified" : "completed", lastSuccessfulStage: !blockers.length ? "verified" : composed ? "composed" : registered ? "registered" : created ? "created" : "planning", stages: { created, registered, composed, verified: !blockers.length && context.verificationMode === "static_and_runtime" }, blockers, instanceIds: instances.map((item: any) => item.id) },
        verification: { static: staticPassed ? "pass" : "not-passed", runtime: context.verificationMode === "static_only" ? "not-run" : runtimePassed ? "pass" : "not-passed", interaction: behaviorPassed ? "pass" : "not-run" } });
    }
    return { deliveries };
  });
  add("prepare_plugin_responsive_repair", "Prepare read-only exact CSS proposals for an existing project-owned Plugin. Static warnings are hints; present diffs and obtain confirmation before editing. Browser acceptance remains separate.", z.object({ pluginId: z.string(), slotWidth: z.number().positive(), slotRef: z.string().min(1), edits: z.array(z.object({ file: z.string(), before: z.string().min(1), after: z.string(), reason: z.string().min(1) })).default([]) }), async input => {
    const inspected = await requestOperator(context.root, "inspect_ui_plugin", { pluginId: input.pluginId }, context.signal);
    if (inspected.asset?.ownership === "official_package") throw new Error("PLUGIN_SOURCE_TAKEOVER_REQUIRED");
    const check = await requestOperator(context.root, "verify_ui_project", {}, context.signal);
    const prefix = `${await sourceRoot(context.root)}/plugins/${input.pluginId}/`;
    const sources: Record<string, string> = {}, diffs: Record<string, string> = {};
    for (const edit of input.edits) {
      if (!edit.file.startsWith(prefix) || !edit.file.endsWith(".css")) throw new Error("RESPONSIVE_REPAIR_SCOPE_INVALID");
      const current = await context.activity.observations.assertFreshForEdit(edit.file);
      const content = current.content ?? "";
      if (content.split(edit.before).length !== 2 || edit.before === edit.after) throw new Error("RESPONSIVE_REPAIR_ANCHOR_INVALID");
      sources[edit.file] = content;
      diffs[edit.file] = `--- before/${edit.file}\n+++ after/${edit.file}\n-${edit.before}\n+${edit.after}`;
    }
    const risks = (check.warnings ?? []).filter((item: any) => item.pluginId === input.pluginId && String(item.code).startsWith("PLUGIN_RESPONSIVE_"));
    return { pluginId: input.pluginId, slot: { width: input.slotWidth, ref: input.slotRef }, risks, responsiveRiskCount: risks.length, sources, sourceHashes: Object.fromEntries(Object.entries(sources).map(([file, content]) => [file, hash(content)])), edits: input.edits, diffs, status: input.edits.length ? "awaiting-user-confirmation" : "analysis-required", writeAuthorized: false, browserAcceptance: "NOT_RUN" };
  });
}
