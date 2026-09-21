import { execFile as execFileCallback } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(repoRoot, "assistant-ui-upgrade-report.json");
const impactPath = path.join(repoRoot, "assistant-ui-upgrade-impact.md");
const target = JSON.parse(await readFile(path.join(repoRoot, "assistant-ui-upgrade-target.json"), "utf8"));
const provenance = JSON.parse(await readFile(path.join(repoRoot, "packages/react/src/internal/vendor/assistant-ui/UPSTREAM.json"), "utf8"));

async function changedFiles() {
  const result = await execFile("git", ["status", "--porcelain=v1"], { cwd: repoRoot, encoding: "utf8" });
  return result.stdout.split("\n").filter(Boolean).map((line) => line.slice(3)).map((line) =>
    line.includes(" -> ") ? line.split(" -> ").at(-1) : line,
  );
}

const prior = JSON.parse(await readFile(reportPath, "utf8"));
const files = [...new Set(await changedFiles())].sort();
const select = (predicate) => files.filter(predicate);
const capabilityAudit = [
  { capability: "ThreadComponents.TaskGroup", status: "NEW UPSTREAM CAPABILITY" },
  { capability: "thread.tasks", status: "NEW UPSTREAM CAPABILITY" },
  { capability: "TaskCard / TaskGroup", status: "NEW UPSTREAM CAPABILITY" },
  { capability: "AgentStatus / TaskTray", status: "NEW UPSTREAM CAPABILITY" },
  { capability: "ReasoningGroup / ToolGroup / ToolFallback", status: "UNCHANGED" },
  { capability: "Composer / Message Footer / Thread List / Attachments / Suggestions", status: "UNCHANGED" },
  { capability: "ConversationSubagentTool compatibility presentation", status: "LOCAL COMPATIBILITY NO LONGER NEEDED" },
];
const current = {
  ...prior,
  toRevision: provenance.revision,
  packagesChanged: select((file) => file === "pnpm-lock.yaml" || file === "pnpm-workspace.yaml" || file.endsWith("/package.json") || file === "package.json"),
  localFacadeFilesChanged: select((file) => file.startsWith("packages/react/src/") && !file.startsWith("packages/react/src/internal/vendor/")),
  runtimeAdapterFilesChanged: select((file) => file.startsWith("packages/runtime-conversation/")),
  pluginFilesChanged: select((file) => file.startsWith("examples/agent-frontend/plugins/")),
  appUIModelFilesChanged: select((file) => file.startsWith("examples/agent-frontend/app-ui/")),
  creatorFilesChanged: select((file) => file.startsWith("packages/creator/")),
  testsChanged: select((file) => file.includes("/tests/") || file.endsWith(".test.ts") || file.endsWith(".test.tsx") || file.endsWith(".test.mjs")),
  capabilityAudit,
};

const changedPluginDirectories = new Set(
  current.pluginFilesChanged
    .filter((file) => file !== "examples/agent-frontend/plugins/registry.generated.ts")
    .map((file) => file.split("/").slice(0, 4).join("/")),
);
const existingPluginDirectories = [...changedPluginDirectories].filter((file) =>
  !file.endsWith("/task-group") && !file.endsWith("/subagent-conversation"));
const highRisk = current.creatorFilesChanged.length > 0 || current.appUIModelFilesChanged.length > 1 || existingPluginDirectories.length > 3;
const mediumRisk = current.runtimeAdapterFilesChanged.length > 0 || current.localFacadeFilesChanged.length > 4 || existingPluginDirectories.length > 1;
const cost = highRisk ? "High" : mediumRisk ? "Medium" : "Low";

const markdown = `# assistant-ui Upgrade Impact Report

From:
- packages: ${current.packagesChanged.length === 0 ? "unchanged in report metadata" : current.packagesChanged.join(", ")}
- upstream revision: ${current.fromRevision}

To:
- @assistant-ui/react ${target.packages["@assistant-ui/react"]}
- @assistant-ui/react-ag-ui ${target.packages["@assistant-ui/react-ag-ui"]}
- @assistant-ui/react-markdown ${target.packages["@assistant-ui/react-markdown"]}
- upstream revision: ${current.toRevision}

## Vendor changes

- changed ${current.vendorFilesChanged.length} files
- added ${current.vendorFilesAdded.length} files
- removed ${current.vendorFilesRemoved.length} files
- new transitive dependencies: ${current.newTransitiveDependencies.length}

## Public facade changes

- ${current.localFacadeFilesChanged.length} files: ${current.localFacadeFilesChanged.join(", ") || "none"}

## Runtime adapter changes

- ${current.runtimeAdapterFilesChanged.length} files: ${current.runtimeAdapterFilesChanged.join(", ") || "none"}

## Plugin changes

- ${current.pluginFilesChanged.length} files across ${changedPluginDirectories.size} Plugin directories
- ${current.pluginFilesChanged.join(", ") || "none"}

## AppUIModel changes

- ${current.appUIModelFilesChanged.length} files: ${current.appUIModelFilesChanged.join(", ") || "none"}

## Creator changes

- ${current.creatorFilesChanged.length} files: ${current.creatorFilesChanged.join(", ") || "none"}

## Removed compatibility code

- ConversationSubagentTool
- ConversationSubagentMessages
- ConversationNestedToolFallback
- subagentConversation Slot and subagent-conversation Plugin
- product-side Array.isArray(tool.messages) renderer routing

## Upstream capability audit

| Capability | Status |
| --- | --- |
${capabilityAudit.map(({ capability, status }) => `| ${capability} | ${status} |`).join("\n")}

## Tests changed

- ${current.testsChanged.length} files: ${current.testsChanged.join(", ") || "none"}

## Upgrade cost assessment

${cost}

Reason: vendor changes are expected; the assessment tracks whether the public facade, runtime adapter, existing Plugins, AppUIModel, or Creator expanded beyond the intended seam.
`;

await writeFile(reportPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
await writeFile(impactPath, markdown, "utf8");
console.log(JSON.stringify({ report: path.relative(repoRoot, reportPath), impact: path.relative(repoRoot, impactPath), cost }, null, 2));
