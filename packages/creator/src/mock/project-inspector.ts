import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import type { MockProjectInspector, MockProjectTarget } from "./demo-compatibility.js";

async function exists(file: string) {
  try { await access(file); return true; } catch { return false; }
}

/** Generic fixed-entry protocol transport, without AppUIModel knowledge. */
async function inspect(target: MockProjectTarget, operation: string, input: object = {}): Promise<unknown> {
  const managed = path.join(target.projectRoot, ".agent-ui/control/project-control.mjs");
  // Remove legacy selection after a full migration cycle and Host regression coverage passes.
  const entry = await exists(managed) ? managed : path.join(target.projectRoot, "scripts/ui-project-control.ts");
  const runtime = entry === managed ? process.execPath : path.join(target.projectRoot, "node_modules/.bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  return new Promise((resolve, reject) => {
    const child = spawn(runtime, [entry], { cwd: target.projectRoot, stdio: ["pipe", "pipe", "pipe"], shell: false });
    const output: Buffer[] = [];
    let size = 0;
    let errorText = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Project inspection timed out")); }, 15_000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.stdin.on("error", error => { child.kill(); clearTimeout(timer); reject(error); });
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) { child.kill(); reject(new Error("Project inspection output too large")); }
      else output.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => { errorText = (errorText + chunk.toString()).slice(-2000); });
    child.on("close", code => {
      clearTimeout(timer);
      try {
        const response = JSON.parse(Buffer.concat(output).toString("utf8"));
        if (code !== 0 || response.schemaVersion !== 3 || response.ok !== true) throw new Error(response.error?.message ?? errorText ?? "Project inspection failed");
        resolve(response.result);
      } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify({ schemaVersion: 3, operation, input }));
  });
}

export const inspectMockProjectThroughControl: MockProjectInspector = async target => {
  const composition = await inspect(target, "inspect_ui_project", { view: "composition" });
  const sources = await inspect(target, "inspect_agent_ui_sources");
  return { composition, sources } as Awaited<ReturnType<MockProjectInspector>>;
};
