import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getAvailableAgentUIThemes, setAgentUITheme, synchronizeAgentUIPluginRegistry } from "@agent-ui/project-control/commands";
import type { CreatorWorkspaceManager } from "../workspace/CreatorWorkspaceManager.js";
import type { PythonCreatorProcessManager } from "../PythonCreatorProcessManager.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { inspectOfficialAgentUIResourceCatalog, installOfficialAgentUIResource, resolveOfficialResource } from "@agent-ui/project-control/resources";
import type { CreatorCommandExecuteRequest } from "./types.js";
import { creatorCommandRegistry } from "./registry.js";

export function createCreatorCommandHandler(workspaces: CreatorWorkspaceManager | undefined, root: string | undefined, legacy: PythonCreatorProcessManager | undefined) {
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
        const keys = payload.id === "theme" ? ["theme"] : payload.id === "install" ? ["resourceId"] : [];
        if (Object.keys(payload).sort().join(",") !== "args,id" || !payload.args || typeof payload.args !== "object" || Array.isArray(payload.args) ||
          Object.keys(payload.args).sort().join(",") !== keys.join(",") || keys.some(key => typeof payload.args[key] !== "string" || !payload.args[key].trim())) throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
        input = payload as CreatorCommandExecuteRequest;
      }
      const run = async (projectRoot: string) => {
        if (catalog) {
          const themes = await getAvailableAgentUIThemes(projectRoot).catch(() => undefined);
          const resources = await inspectOfficialAgentUIResourceCatalog(projectRoot);
          return { commands: [
            ...(themes ? [{ ...creatorCommandRegistry.get("theme")!, ...themes }] : []),
            { ...creatorCommandRegistry.get("install")!, options: resources.map(resource => ({ id: resource.id, label: resource.label,
              ...(resource.description ? { description: resource.description } : {}), disabled: !resource.installable,
              status: resource.status === "missing" ? "available" : resource.status === "ready" ? "installed" : resource.status })) },
            { ...creatorCommandRegistry.get("sync")!, options: [] },
          ] };
        }
        if (workspaces?.hasActiveCreatorRequests()) throw new Error("CREATOR_COMMAND_BUSY");
        const manager = workspaces?.ensureCreatorRuntime() ?? legacy;
        if (!manager) throw new Error("CREATOR_RUNTIME_UNAVAILABLE");
        const endpoint = await manager.ensureStarted();
        if (!input) throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
        if (input.id !== "theme") {
          // Python owns pending questions and the writing lock. Hold it for the entire
          // deterministic Host mutation; no Creator run or model invocation occurs.
          const guard = async (body: object) => {
            const response = await fetch(`http://${endpoint.host}:${endpoint.port}/creator-command-mutation`, {
              method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.authToken}` }, body: JSON.stringify(body),
            });
            const result = await response.json() as { token: string; code?: string };
            if (!response.ok) throw new Error(result.code ?? "CREATOR_COMMAND_BUSY");
            return result;
          };
          const { token } = await guard({ action: "acquire" });
          try {
            if (input.id === "install") {
              const resource = resolveOfficialResource(input.args.resourceId);
              if (!resource.discoverable) throw new Error("RESOURCE_NOT_DISCOVERABLE");
              const result = await installOfficialAgentUIResource(projectRoot, resource.id);
              return { value: result.resourceId, changed: result.changed, reenabled: result.reenabled, receipt: {
                files: [], validations: result.verification ? [{ command: "verify_ui_project", status: "passed", exitCode: 0, output: JSON.stringify(result.verification), truncated: false }] : [],
                verification: { status: result.changed ? "changed-and-statically-verified" : "no-project-change", projectRevision: result.changed ? 1 : 0,
                  auditAttempts: 0, checks: [], verificationMode: "static_only", runtimeStatus: "not-run" },
              } };
            }
            const result = await synchronizeAgentUIPluginRegistry(projectRoot);
            return { changed: result.changed, receipt: { files: [],
              validations: [{ command: "synchronize_plugin_registry", status: "passed", exitCode: 0, output: JSON.stringify(result), truncated: false }],
              verification: { status: result.changed ? "changed-unverified" : "no-project-change", projectRevision: result.changed ? 1 : 0,
                auditAttempts: 0, checks: [], runtimeStatus: "not-run" },
            } };
          } finally { await guard({ action: "release", token }); }
        }
        let diff = "";
        const result = await setAgentUITheme(projectRoot, input.args.theme, async change => {
          if (change.before !== change.after) diff = `--- a/${change.path}\n+++ b/${change.path}\n@@ -1,${change.before.trimEnd().split("\n").length} +1,${change.after.trimEnd().split("\n").length} @@\n` + change.before.trimEnd().split("\n").map(line => `-${line}\n`).join("") + change.after.trimEnd().split("\n").map(line => `+${line}\n`).join("");
          const commit = await fetch(`http://${endpoint.host}:${endpoint.port}/creator-command-commit`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.authToken}` }, body: JSON.stringify(change),
          });
          const body = await commit.json() as { runId?: string; error?: string; code?: string; verification?: import("@agent-ui/project-control/commands").ThemeVerification };
          if (!commit.ok) throw new Error(body.code === "CREATOR_COMMAND_BUSY" ? body.code : body.error ?? "CREATOR_COMMAND_COMMIT_FAILED");
          if (!body.verification) throw new Error("THEME_VERIFICATION_RESULT_INVALID");
          return { ...body, verification: body.verification };
        });
        return { value: result.current, changed: result.changed, receipt: {
          files: result.changedPaths.map(path => ({ path, status: "modified", diff, truncated: false })),
          validations: [{ command: "verify_ui_project", status: result.validation, exitCode: result.validation === "passed" ? 0 : 1, output: JSON.stringify(result.verification), truncated: false }],
          verification: { status: result.changed ? "changed-and-statically-verified" : "no-project-change", projectRevision: result.changed ? 1 : 0, auditAttempts: 0, checks: [{ id: "static-project-validation", status: result.verification.status, evidence: JSON.stringify(result.verification) }], verificationMode: "static_only", runtimeStatus: "not-run" },
          ...(result.runId ? { transaction: { runId: result.runId, undoable: true, reapplyable: true } } : {}),
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
