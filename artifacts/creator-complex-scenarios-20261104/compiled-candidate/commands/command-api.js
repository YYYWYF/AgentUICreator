import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { getAgentUIAvailablePluginIds, getAgentUIPluginInstances, setAgentUIPluginEnabled, synchronizeAgentUIPluginRegistry, preparePluginEnablement, completePluginEnablement } from "@za38.03/agent-ui-creator/project/commands";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { inspectIntegrationHost } from "@za38.03/agent-ui-creator/project/resources";
import { pluginCategory } from "./plugin-categories.js";
import { creatorCommandRegistry } from "./registry.js";
export function createCreatorCommandHandler(workspaces, root, legacy) {
    const preparations = new Map();
    const legacyWorkspaceId = root ? createHash("sha256").update(realpathSync(root)).digest("hex") : undefined;
    return async (request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        try {
            if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host)
                throw new Error("CREATOR_COMMAND_ORIGIN_INVALID");
            const workspaceId = request.headers[CREATOR_WORKSPACE_ID_HEADER];
            if (typeof workspaceId !== "string")
                throw new Error("CREATOR_WORKSPACE_CHANGED");
            const route = request.url?.split("?")[0];
            const catalog = request.method === "GET" && (route === "/" || route === "");
            if (!catalog && (request.method !== "POST" || route !== "/execute" || !request.headers["content-type"]?.startsWith("application/json")))
                throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
            let input;
            if (!catalog) {
                const chunks = [];
                let size = 0;
                for await (const chunk of request) {
                    const buffer = Buffer.from(chunk);
                    size += buffer.length;
                    if (size > 4096)
                        throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
                    chunks.push(buffer);
                }
                const payload = JSON.parse(Buffer.concat(chunks).toString());
                if (!payload || typeof payload !== "object" || typeof payload.id !== "string" || !creatorCommandRegistry.has(payload.id))
                    throw new Error("UNKNOWN_COMMAND");
                const keys = payload.id === "enable" && Object.hasOwn(payload.args ?? {}, "pluginId") ? ["pluginId"] : ["enable", "disable"].includes(payload.id) ? ["instanceId"] : [];
                if (payload.id === "enable" && Object.hasOwn(payload.args ?? {}, "preparationId"))
                    keys.push("preparationId");
                if (Object.keys(payload).sort().join(",") !== "args,id" || !payload.args || typeof payload.args !== "object" || Array.isArray(payload.args) ||
                    Object.keys(payload.args).sort().join(",") !== [...keys].sort().join(",") || keys.some(key => typeof payload.args[key] !== "string" || !payload.args[key].trim()))
                    throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
                input = payload;
            }
            const run = async (projectRoot) => {
                let prepared = false;
                let preparationFiles = [];
                if (catalog) {
                    const host = await inspectIntegrationHost(projectRoot);
                    const plugins = host.framework === "react" ? await getAgentUIPluginInstances(projectRoot) : [];
                    const available = host.framework === "react" ? await getAgentUIAvailablePluginIds(projectRoot) : [];
                    const present = new Set(plugins.map(plugin => plugin.pluginId));
                    return { commands: [
                            { ...creatorCommandRegistry.get("sync"), options: [] },
                            ...["enable", "disable"].map(id => ({ ...creatorCommandRegistry.get(id), options: [
                                    ...plugins.filter(plugin => plugin.enabled !== (id === "enable"))
                                        .map(plugin => ({ id: plugin.id, pluginId: plugin.pluginId, category: pluginCategory(plugin.pluginId),
                                        status: plugin.enabled ? "installed" : "disabled" })),
                                    ...(id === "enable" ? available.filter(pluginId => !present.has(pluginId)).map(pluginId => ({
                                        id: `add:${pluginId}`, pluginId, category: pluginCategory(pluginId), action: "add", status: "available",
                                    })) : []),
                                ] })),
                        ] };
                }
                if (workspaces?.hasActiveCreatorRequests())
                    throw new Error("CREATOR_COMMAND_BUSY");
                if (input?.id === "enable") {
                    const instances = await getAgentUIPluginInstances(projectRoot);
                    const target = "pluginId" in input.args ? input.args.pluginId : input.args.instanceId;
                    const pluginId = "pluginId" in input.args ? input.args.pluginId : instances.find(instance => instance.id === target)?.pluginId;
                    if (!pluginId)
                        throw new Error("PLUGIN_INSTANCE_UNKNOWN");
                    if ("pluginId" in input.args && instances.some(instance => instance.pluginId === pluginId))
                        throw new Error("PLUGIN_COMMAND_STALE");
                    // Custom instances retain the existing toggle path; official Plugins use
                    // the target's installed catalog for dependency/application preparation.
                    const available = await getAgentUIAvailablePluginIds(projectRoot);
                    if (available.includes(pluginId)) {
                        const preparation = await preparePluginEnablement(projectRoot, pluginId);
                        const preparationId = input.args.preparationId;
                        if (preparationId) {
                            const saved = preparations.get(preparationId);
                            preparations.delete(preparationId);
                            if (!saved || saved.root !== projectRoot || saved.workspaceId !== workspaceId || saved.target !== target || saved.preparation.pluginId !== pluginId || saved.expires < Date.now() || saved.preparation.stateHash !== preparation.stateHash)
                                throw new Error("PLUGIN_ENABLEMENT_PREPARATION_STALE");
                            const manager = workspaces?.ensureCreatorRuntime() ?? legacy;
                            if (!manager)
                                throw new Error("CREATOR_RUNTIME_UNAVAILABLE");
                            const endpoint = await manager.ensureStarted();
                            const guard = async (body) => {
                                const response = await fetch(`http://${endpoint.host}:${endpoint.port}/creator-command-mutation`, {
                                    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.authToken}` }, body: JSON.stringify(body),
                                });
                                if (!response.ok)
                                    throw new Error("CREATOR_COMMAND_BUSY");
                                return await response.json();
                            };
                            const { token } = await guard({ action: "acquire" });
                            try {
                                const result = await completePluginEnablement(projectRoot, saved.preparation);
                                prepared = result.changed || saved.preparation.packages.length > 0;
                                preparationFiles = result.createdPaths;
                            }
                            finally {
                                await guard({ action: "release", token });
                            }
                        }
                        else if (preparation.files.length || preparation.packages.length) {
                            const id = randomUUID();
                            for (const [key, value] of preparations)
                                if (value.expires < Date.now())
                                    preparations.delete(key);
                            if (preparations.size >= 64)
                                preparations.delete(preparations.keys().next().value);
                            preparations.set(id, { root: projectRoot, workspaceId, target, expires: Date.now() + 10 * 60_000, preparation });
                            return { status: "confirmation-required", changed: false,
                                preparation: { id, pluginId, files: preparation.files, packages: preparation.packages },
                                receipt: { files: [], validations: [], verification: { status: "no-project-change", projectRevision: 0, auditAttempts: 0, checks: [], runtimeStatus: "not-run" } }, };
                        }
                    }
                    else if (input.args.preparationId)
                        throw new Error("PLUGIN_ENABLEMENT_PREPARATION_STALE");
                }
                if (input?.id === "enable" && "pluginId" in input.args) {
                    const pluginId = input.args.pluginId;
                    if ((await inspectIntegrationHost(projectRoot)).framework !== "react")
                        throw new Error("PLUGIN_REACT_PRODUCER_REQUIRED");
                    const available = await getAgentUIAvailablePluginIds(projectRoot);
                    if (!available.includes(pluginId))
                        throw new Error("PLUGIN_UNAVAILABLE");
                    const instances = await getAgentUIPluginInstances(projectRoot);
                    if (instances.some(plugin => plugin.pluginId === pluginId))
                        throw new Error("PLUGIN_COMMAND_STALE");
                    return { status: "agent-required", addPluginId: pluginId, value: pluginId, changed: prepared,
                        receipt: { files: preparationFiles.map(file => ({ path: file, status: "created", diff: "", truncated: false })), validations: [], verification: { status: prepared ? "changed-unverified" : "no-project-change", projectRevision: prepared ? 1 : 0,
                                auditAttempts: 0, checks: [], runtimeStatus: "not-run" } } };
                }
                const manager = workspaces?.ensureCreatorRuntime() ?? legacy;
                if (!manager)
                    throw new Error("CREATOR_RUNTIME_UNAVAILABLE");
                const endpoint = await manager.ensureStarted();
                if (!input)
                    throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
                if (input.id === "sync") {
                    // Creator owns pending questions and the writing lock. Hold it for the entire
                    // deterministic Host mutation; no Creator run or model invocation occurs.
                    const guard = async (body) => {
                        const response = await fetch(`http://${endpoint.host}:${endpoint.port}/creator-command-mutation`, {
                            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.authToken}` }, body: JSON.stringify(body),
                        });
                        const result = await response.json();
                        if (!response.ok)
                            throw new Error(result.code ?? "CREATOR_COMMAND_BUSY");
                        return result;
                    };
                    const { token } = await guard({ action: "acquire" });
                    try {
                        const result = await synchronizeAgentUIPluginRegistry(projectRoot);
                        return { changed: result.changed, receipt: { files: [],
                                validations: [{ command: "synchronize_plugin_registry", status: "passed", exitCode: 0, output: JSON.stringify(result), truncated: false }],
                                verification: { status: result.changed ? "changed-unverified" : "no-project-change", projectRevision: result.changed ? 1 : 0,
                                    auditAttempts: 0, checks: [], runtimeStatus: "not-run" },
                            } };
                    }
                    finally {
                        await guard({ action: "release", token });
                    }
                }
                let diff = "";
                let committedReceipt;
                const commit = async (change) => {
                    if (change.before !== change.after)
                        diff = `--- a/${change.path}\n+++ b/${change.path}\n@@ -1,${change.before.trimEnd().split("\n").length} +1,${change.after.trimEnd().split("\n").length} @@\n` + change.before.trimEnd().split("\n").map(line => `-${line}\n`).join("") + change.after.trimEnd().split("\n").map(line => `+${line}\n`).join("");
                    const commit = await fetch(`http://${endpoint.host}:${endpoint.port}/creator-command-commit`, {
                        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.authToken}` }, body: JSON.stringify(change),
                    });
                    const body = await commit.json();
                    if (!commit.ok)
                        throw new Error(body.code === "CREATOR_COMMAND_BUSY" ? body.code : body.error ?? "CREATOR_COMMAND_COMMIT_FAILED");
                    if (!body.verification)
                        throw new Error("THEME_VERIFICATION_RESULT_INVALID");
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
        }
        catch (error) {
            const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "CREATOR_COMMAND_FAILED";
            response.statusCode = 409;
            response.end(JSON.stringify({ code, error: code }));
        }
    };
}
//# sourceMappingURL=command-api.js.map