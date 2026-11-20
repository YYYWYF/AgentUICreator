import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getAgentUIAvailablePluginIds, getAgentUIPluginInstances, setAgentUIPluginEnabled, addAgentUIPlugin, getAgentUIPluginPlacementGuide, synchronizeAgentUIPluginRegistry, preparePluginEnablement, completePluginEnablement, type PluginEnablementPreparation } from "@za38.03/agent-ui-creator/project/commands";
import type { CreatorWorkspaceManager } from "../workspace/CreatorWorkspaceManager.js";
import type { CreatorProcessManager } from "../CreatorProcessManager.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { inspectIntegrationHost } from "@za38.03/agent-ui-creator/project/resources";
import type { CreatorCommandExecuteRequest } from "./types.js";
import { pluginCategory } from "./plugin-categories.js";
import { creatorCommandRegistry } from "./registry.js";
import { pluginPlacementIssue } from "./plugin-placement-issue.js";
import { getAgentUIPluginSourceTargets, planAgentUIPluginSourceTakeover, applyAgentUIPluginSourceTakeover, type PluginSourceTakeoverPlan } from "@za38.03/agent-ui-creator/project/commands";

export function createCreatorCommandHandler(workspaces: CreatorWorkspaceManager | undefined, root: string | undefined, legacy: CreatorProcessManager | undefined) {
  const preparations = new Map<string, { root: string; workspaceId: string; target: string; expires: number; preparation: PluginEnablementPreparation }>();
  const takeovers = new Map<string, { root: string; workspaceId: string; expires: number; plan: PluginSourceTakeoverPlan }>();
  const legacyWorkspaceId = root ? createHash("sha256").update(realpathSync(root)).digest("hex") : undefined;
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    try {
      if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) throw new Error("CREATOR_COMMAND_ORIGIN_INVALID");
      const workspaceId = request.headers[CREATOR_WORKSPACE_ID_HEADER];
      if (typeof workspaceId !== "string") throw new Error("CREATOR_WORKSPACE_CHANGED");
      const route = request.url?.split("?")[0];
      const catalog = request.method === "GET" && (route === "/" || route === "");
      if (!catalog && (request.method !== "POST" || route !== "/execute" || !request.headers["content-type"]?.startsWith("application/json"))) throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
      let input: CreatorCommandExecuteRequest | undefined;
      if (!catalog) {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 4096) throw new Error("CREATOR_COMMAND_REQUEST_INVALID"); chunks.push(buffer); }
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        if (!payload || typeof payload !== "object" || typeof payload.id !== "string" || !creatorCommandRegistry.has(payload.id)) throw new Error("UNKNOWN_COMMAND");
        const keys = payload.id === "takeover" || payload.id === "enable" && Object.hasOwn(payload.args ?? {}, "pluginId") ? ["pluginId"] : ["enable", "disable"].includes(payload.id) ? ["instanceId"] : [];
        if (["enable", "takeover"].includes(payload.id) && Object.hasOwn(payload.args ?? {}, "preparationId")) keys.push("preparationId");
        if (Object.keys(payload).sort().join(",") !== "args,id" || !payload.args || typeof payload.args !== "object" || Array.isArray(payload.args) ||
          Object.keys(payload.args).sort().join(",") !== [...keys].sort().join(",") || keys.some(key => typeof payload.args[key] !== "string" || !payload.args[key].trim())) throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
        input = payload as CreatorCommandExecuteRequest;
      }
      const run = async (projectRoot: string) => {
        let prepared = false;
        let preparationFiles: string[] = [];
        // Fixed commands share Creator's write guard, without starting an Agent run.
        const withMutationGuard = async <T>(operation: () => Promise<T>): Promise<T> => {
          const manager = workspaces?.ensureCreatorRuntime() ?? legacy;
          if (!manager) throw new Error("CREATOR_RUNTIME_UNAVAILABLE");
          const endpoint = await manager.ensureStarted();
          const guard = async (body: object) => {
            const response = await fetch(`http://${endpoint.host}:${endpoint.port}/creator-command-mutation`, {
              method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.authToken}` }, body: JSON.stringify(body),
            });
            const result = await response.json() as { token: string; code?: string };
            if (!response.ok) throw new Error(result.code ?? "CREATOR_COMMAND_BUSY");
            return result;
          };
          const { token } = await guard({ action: "acquire" });
          try { return await operation(); }
          finally { await guard({ action: "release", token }); }
        };
        if (catalog) {
          const host = await inspectIntegrationHost(projectRoot);
          const plugins = host.framework === "react" ? await getAgentUIPluginInstances(projectRoot) : [];
          const available = host.framework === "react" ? await getAgentUIAvailablePluginIds(projectRoot) : [];
          const sourceTargets = host.framework === "react" ? await getAgentUIPluginSourceTargets(projectRoot) : [];
          const present = new Set(plugins.map(plugin => plugin.pluginId));
          return { commands: [
            { ...creatorCommandRegistry.get("sync")!, options: [] },
            { ...creatorCommandRegistry.get("takeover")!, options: sourceTargets.map(pluginId => ({ id: pluginId, pluginId, category: pluginCategory(pluginId) })) },
            ...(["enable", "disable"] as const).map(id => ({ ...creatorCommandRegistry.get(id)!, options: [
              ...plugins.filter(plugin => plugin.enabled !== (id === "enable"))
                .map(plugin => ({ id: plugin.id, pluginId: plugin.pluginId, category: pluginCategory(plugin.pluginId),
                  status: plugin.enabled ? "installed" : "disabled" })),
              ...(id === "enable" ? available.filter(pluginId => !present.has(pluginId)).map(pluginId => ({
                id: `add:${pluginId}`, pluginId, category: pluginCategory(pluginId), action: "add", status: "available",
              })) : []),
            ] })),
          ] };
        }
        if (workspaces?.hasActiveCreatorRequests()) throw new Error("CREATOR_COMMAND_BUSY");
        if (input?.id === "takeover") {
          if ((await inspectIntegrationHost(projectRoot)).framework !== "react") throw new Error("PLUGIN_REACT_PRODUCER_REQUIRED");
          const { pluginId, preparationId } = input.args;
          if (preparationId) {
            const saved = takeovers.get(preparationId);
            takeovers.delete(preparationId);
            if (!saved || saved.root !== projectRoot || saved.workspaceId !== workspaceId || saved.plan.pluginId !== pluginId || saved.expires < Date.now()) throw new Error("PLUGIN_SOURCE_PLAN_STALE");
            return withMutationGuard(async () => {
              const result = await applyAgentUIPluginSourceTakeover(projectRoot, { pluginId, planHash: saved.plan.planHash });
              return { value: pluginId, changed: true, receipt: {
                files: result.changedPaths.map(path => ({ path, status: saved.plan.files.some(file => path.endsWith(`/${file}`)) ? "created" : "modified", diff: "", truncated: false })),
                validations: [],
                verification: { status: "changed-unverified", projectRevision: 1, auditAttempts: 0, checks: [], runtimeStatus: "not-run" },
              } };
            });
          }
          if (!(await getAgentUIPluginSourceTargets(projectRoot)).includes(pluginId)) throw new Error("PLUGIN_SOURCE_UNAVAILABLE");
          const plan = await planAgentUIPluginSourceTakeover(projectRoot, { pluginId });
          const id = randomUUID();
          for (const [key, value] of takeovers) if (value.expires < Date.now()) takeovers.delete(key);
          if (takeovers.size >= 64) takeovers.delete(takeovers.keys().next().value!);
          takeovers.set(id, { root: projectRoot, workspaceId, expires: Date.now() + 10 * 60_000, plan });
          return { status: "confirmation-required", takeover: { id, plan }, changed: false,
            receipt: { files: [], validations: [], verification: { status: "no-project-change", projectRevision: 0, auditAttempts: 0, checks: [], runtimeStatus: "not-run" } },
          };
        }
        if (input?.id === "enable") {
          if ("pluginId" in input.args && (await inspectIntegrationHost(projectRoot)).framework !== "react") throw new Error("PLUGIN_REACT_PRODUCER_REQUIRED");
          const instances = await getAgentUIPluginInstances(projectRoot);
          const target = "pluginId" in input.args ? input.args.pluginId : input.args.instanceId;
          const pluginId = "pluginId" in input.args ? input.args.pluginId : instances.find(instance => instance.id === target)?.pluginId;
          if (!pluginId) throw new Error("PLUGIN_INSTANCE_UNKNOWN");
          if ("pluginId" in input.args && instances.some(instance => instance.pluginId === pluginId)) throw new Error("PLUGIN_COMMAND_STALE");
          // Custom instances retain the existing toggle path; official Plugins use
          // the target's installed catalog for dependency/application preparation.
          const available = await getAgentUIAvailablePluginIds(projectRoot);
          if (available.includes(pluginId)) {
            const preparation = await preparePluginEnablement(projectRoot, pluginId);
            const preparationId = input.args.preparationId;
            if (preparationId) {
              const saved = preparations.get(preparationId);
              preparations.delete(preparationId);
              if (!saved || saved.root !== projectRoot || saved.workspaceId !== workspaceId || saved.target !== target || saved.preparation.pluginId !== pluginId || saved.expires < Date.now() || saved.preparation.stateHash !== preparation.stateHash) throw new Error("PLUGIN_ENABLEMENT_PREPARATION_STALE");
              await withMutationGuard(async () => {
                const result = await completePluginEnablement(projectRoot, saved.preparation);
                prepared = result.changed || saved.preparation.packages.length > 0;
                preparationFiles = result.createdPaths;
              });
            } else if (preparation.files.length || preparation.packages.length) {
              const id = randomUUID();
              for (const [key, value] of preparations) if (value.expires < Date.now()) preparations.delete(key);
              if (preparations.size >= 64) preparations.delete(preparations.keys().next().value!);
              preparations.set(id, { root: projectRoot, workspaceId, target, expires: Date.now() + 10 * 60_000, preparation });
              return { status: "confirmation-required" as const, changed: false,
                preparation: { id, pluginId, files: preparation.files, packages: preparation.packages },
                receipt: { files: [], validations: [], verification: { status: "no-project-change", projectRevision: 0, auditAttempts: 0, checks: [], runtimeStatus: "not-run" } },
              };
            }
          } else if (input.args.preparationId) throw new Error("PLUGIN_ENABLEMENT_PREPARATION_STALE");
        }
        if (input?.id === "enable" && "pluginId" in input.args) {
          const pluginId = input.args.pluginId;
          let result: Awaited<ReturnType<typeof addAgentUIPlugin>>;
          try {
            result = await withMutationGuard(() => addAgentUIPlugin(projectRoot, pluginId));
          } catch (error) {
            const issue = pluginPlacementIssue(error);
            if (!issue) throw error;
            const placementGuide = await getAgentUIPluginPlacementGuide(projectRoot, pluginId);
            return { status: "placement-required" as const, value: pluginId, changed: prepared, placementGuide,
              receipt: {
                files: preparationFiles.map(path => ({ path, status: "created", diff: "", truncated: false })),
                validations: [],
                verification: { status: prepared ? "changed-unverified" : "no-project-change", projectRevision: prepared ? 1 : 0,
                  auditAttempts: 0, checks: [{ id: "default-placement", status: "unavailable", evidence: JSON.stringify(issue) }], runtimeStatus: "not-run" },
              } };
          }
          return { value: pluginId, changed: result.changed || prepared,
            receipt: {
              files: [...preparationFiles.map(path => ({ path, status: "created", diff: "", truncated: false })),
                ...result.changedPaths.map(path => ({ path, status: "modified", diff: "", truncated: false }))],
              validations: [{ command: "mutate_app_ui_model", status: "passed", exitCode: 0, output: JSON.stringify(result), truncated: false }],
              verification: { status: "changed-and-statically-verified", projectRevision: 1, auditAttempts: 0,
                checks: [{ id: "composition-validation", status: "passed", evidence: JSON.stringify(result) }], verificationMode: "static_only", runtimeStatus: "not-run" },
            } };
        }
        if (!input) throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
        if (input.id === "sync") {
          return withMutationGuard(async () => {
            const result = await synchronizeAgentUIPluginRegistry(projectRoot);
            return { changed: result.changed, receipt: { files: [],
              validations: [{ command: "synchronize_plugin_registry", status: "passed", exitCode: 0, output: JSON.stringify(result), truncated: false }],
              verification: { status: result.changed ? "changed-unverified" : "no-project-change", projectRevision: result.changed ? 1 : 0,
                auditAttempts: 0, checks: [], runtimeStatus: "not-run" },
            } };
          });
        }
        const manager = workspaces?.ensureCreatorRuntime() ?? legacy;
        if (!manager) throw new Error("CREATOR_RUNTIME_UNAVAILABLE");
        const endpoint = await manager.ensureStarted();
        let diff = "";
        let committedReceipt: import("../receiptTypes.js").CreatorRunReceipt | undefined;
        const commit = async (change: import("@za38.03/agent-ui-creator/project/commands").ThemeChange) => {
          if (change.before !== change.after) diff = `--- a/${change.path}\n+++ b/${change.path}\n@@ -1,${change.before.trimEnd().split("\n").length} +1,${change.after.trimEnd().split("\n").length} @@\n` + change.before.trimEnd().split("\n").map(line => `-${line}\n`).join("") + change.after.trimEnd().split("\n").map(line => `+${line}\n`).join("");
          const commit = await fetch(`http://${endpoint.host}:${endpoint.port}/creator-command-commit`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.authToken}` }, body: JSON.stringify(change),
          });
          const body = await commit.json() as { runId?: string; error?: string; code?: string; receipt?: import("../receiptTypes.js").CreatorRunReceipt; verification?: import("@za38.03/agent-ui-creator/project/commands").ThemeVerification };
          if (!commit.ok) throw new Error(body.code === "CREATOR_COMMAND_BUSY" ? body.code : body.error ?? "CREATOR_COMMAND_COMMIT_FAILED");
          if (!body.verification) throw new Error("THEME_VERIFICATION_RESULT_INVALID");
          committedReceipt = body.receipt;
          return { ...body, verification: body.verification };
        };
        const result = await setAgentUIPluginEnabled(projectRoot, "instanceId" in input.args ? input.args.instanceId : (() => { throw new Error("CREATOR_COMMAND_REQUEST_INVALID"); })(), input.id === "enable", commit);
        return { value: result.current, changed: result.changed || prepared, receipt: !prepared && committedReceipt ? committedReceipt : {
          files: [...preparationFiles.map(file => ({ path: file, status: "created", diff: "", truncated: false })), ...result.changedPaths.map(path => ({ path, status: "modified", diff, truncated: false }))],
          validations: [{ command: "verify_ui_project", status: result.validation, exitCode: result.validation === "passed" ? 0 : 1, output: JSON.stringify(result.verification), truncated: false }],
          verification: { status: result.changed || prepared ? "changed-and-statically-verified" : "no-project-change", projectRevision: result.changed || prepared ? 1 : 0, auditAttempts: 0, checks: [{ id: "static-project-validation", status: result.verification.status, evidence: JSON.stringify(result.verification) }], verificationMode: "static_only", runtimeStatus: "not-run" },
          ...(!prepared && result.runId ? { transaction: { runId: result.runId, undoable: true, reapplyable: true } } : {}),
        } };
      };
      const result = workspaces ? await workspaces.runProjectOperation(workspaceId, run, { mutation: !catalog }) : root && legacyWorkspaceId === workspaceId ? await run(root) : (() => { throw new Error("CREATOR_WORKSPACE_CHANGED"); })();
      response.end(JSON.stringify(result));
    } catch (error) {
      const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "CREATOR_COMMAND_FAILED";
      response.statusCode = 409;
      response.end(JSON.stringify({ code, error: code }));
    }
  };
}
