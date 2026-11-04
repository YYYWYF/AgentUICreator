import { inspectScenarioResources, mergeOptionalResourceInspection } from "@za38.03/agent-ui-creator/project/resources";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
async function exists(file) {
    try {
        await access(file);
        return true;
    }
    catch {
        return false;
    }
}
/** Generic fixed-entry protocol transport, without AppUIModel knowledge. */
async function inspect(target, operation, input = {}) {
    const managed = path.join(target.projectRoot, ".agent-ui/operator/entry.mjs");
    // Remove legacy selection after a full migration cycle and Host regression coverage passes.
    const entry = await exists(managed) ? managed : path.join(target.projectRoot, "scripts/ui-operator.ts");
    const runtime = entry === managed ? process.execPath : path.join(target.projectRoot, "node_modules/.bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
    return new Promise((resolve, reject) => {
        const child = spawn(runtime, [entry], { cwd: target.projectRoot, stdio: ["pipe", "pipe", "pipe"], shell: false });
        const output = [];
        let size = 0;
        let errorText = "";
        const timer = setTimeout(() => { child.kill(); reject(new Error("Project inspection timed out")); }, 15_000);
        child.on("error", error => { clearTimeout(timer); reject(error); });
        child.stdin.on("error", error => { child.kill(); clearTimeout(timer); reject(error); });
        child.stdout.on("data", (chunk) => {
            size += chunk.length;
            if (size > 1_000_000) {
                child.kill();
                reject(new Error("Project inspection output too large"));
            }
            else
                output.push(chunk);
        });
        child.stderr.on("data", (chunk) => { errorText = (errorText + chunk.toString()).slice(-2000); });
        child.on("close", code => {
            clearTimeout(timer);
            try {
                const response = JSON.parse(Buffer.concat(output).toString("utf8"));
                if (code !== 0 || response.ok !== true)
                    throw new Error(response.error?.message ?? errorText ?? "Project inspection failed");
                resolve(response.result);
            }
            catch (error) {
                reject(error);
            }
        });
        child.stdin.end(JSON.stringify({ operation, input }));
    });
}
export const inspectMockProjectThroughOperator = async (target) => {
    const composition = await inspect(target, "inspect_ui_project", { view: "composition" });
    const sources = await inspect(target, "inspect_agent_ui_sources");
    const result = { composition, sources };
    return { ...result, sources: await mergeOptionalResourceInspection(result.sources, await inspectScenarioResources(target.projectRoot)) };
};
//# sourceMappingURL=project-inspector.js.map