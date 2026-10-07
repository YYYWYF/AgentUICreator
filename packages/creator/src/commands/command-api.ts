import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getAvailableAgentUIThemes, setAgentUITheme } from "@agent-ui/project-control/commands";
import type { CreatorWorkspaceManager } from "../workspace/CreatorWorkspaceManager.js";
import type { PythonCreatorProcessManager } from "../PythonCreatorProcessManager.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
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
      let input: { id?: unknown; args?: { theme?: unknown } } = {};
      if (!catalog) {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 4096) throw new Error("CREATOR_COMMAND_REQUEST_INVALID"); chunks.push(buffer); }
        input = JSON.parse(Buffer.concat(chunks).toString());
        if (!input || typeof input !== "object" || typeof input.id !== "string" || !creatorCommandRegistry.has(input.id)) throw new Error("UNKNOWN_COMMAND");
        if (!input.args || typeof input.args.theme !== "string" || Object.keys(input.args).some(key => key !== "theme")) throw new Error("CREATOR_COMMAND_REQUEST_INVALID");
      }
      const run = async (projectRoot: string) => {
        if (catalog) {
          try {
            const themes = await getAvailableAgentUIThemes(projectRoot);
            return { commands: [{ ...creatorCommandRegistry.get("theme")!, ...themes }] };
          } catch { return { commands: [] }; }
        }
        if (workspaces?.hasActiveCreatorRequests()) throw new Error("CREATOR_COMMAND_BUSY");
        const manager = workspaces?.ensureCreatorRuntime() ?? legacy;
        if (!manager) throw new Error("CREATOR_RUNTIME_UNAVAILABLE");
        const endpoint = await manager.ensureStarted();
        let diff = "";
        const result = await setAgentUITheme(projectRoot, input.args!.theme as string, async change => {
          if (change.before !== change.after) diff = `--- a/${change.path}\n+++ b/${change.path}\n@@ -1,${change.before.trimEnd().split("\n").length} +1,${change.after.trimEnd().split("\n").length} @@\n` + change.before.trimEnd().split("\n").map(line => `-${line}\n`).join("") + change.after.trimEnd().split("\n").map(line => `+${line}\n`).join("");
          const commit = await fetch(`http://${endpoint.host}:${endpoint.port}/creator-command-commit`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.authToken}` }, body: JSON.stringify(change),
          });
          const body = await commit.json() as { runId?: string; error?: string; code?: string; verification?: import("@agent-ui/project-control/commands").ThemeVerification };
          if (!commit.ok) throw new Error(body.code === "CREATOR_COMMAND_BUSY" ? body.code : body.error ?? "CREATOR_COMMAND_COMMIT_FAILED");
          if (!body.verification) throw new Error("THEME_VERIFICATION_RESULT_INVALID");
          return { ...body, verification: body.verification };
        });
        return { current: result.current, receipt: {
          files: result.changedPaths.map(path => ({ path, status: "modified", diff, truncated: false })),
          validations: [{ command: "verify_ui_project", status: result.validation, exitCode: result.validation === "passed" ? 0 : 1, output: JSON.stringify(result.verification), truncated: false }],
          verification: { status: result.changed ? "changed-and-statically-verified" : "no-project-change", projectRevision: result.changed ? 1 : 0, auditAttempts: 0, checks: [{ id: "static-project-validation", status: result.verification.status, evidence: JSON.stringify(result.verification) }], verificationMode: "static_only", runtimeStatus: "not-run" },
          ...(result.runId ? { transaction: { runId: result.runId, undoable: true, reapplyable: true } } : {}),
        } };
      };
      const result = workspaces ? await workspaces.runProjectOperation(workspaceId, run) : root && legacyWorkspaceId === workspaceId ? await run(root) : (() => { throw new Error("CREATOR_WORKSPACE_CHANGED"); })();
      response.end(JSON.stringify(result));
    } catch (error) {
      const code = error instanceof Error ? error.message : "CREATOR_COMMAND_FAILED";
      response.statusCode = 409;
      response.end(JSON.stringify({ code, error: code }));
    }
  };
}
