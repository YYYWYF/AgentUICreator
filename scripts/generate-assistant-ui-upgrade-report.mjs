import { execFile as execFileCallback } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { checkAssistantUiAgUiCompatibility } from "./check-assistant-ui-agui-compat.mjs";

const execFile = promisify(execFileCallback);
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_FILE = ".assistant-ui-update-session.json";
const CANCELLATION_UPSTREAM_PATTERNS = [
  /(^|\/)packages\/react-ag-ui\/src\/runtime\/adapter\/subscriber\./u,
  /(^|\/)packages\/react-ag-ui\/src\/runtime\/AgUiThreadRuntimeCore\./u,
  /(^|\/)packages\/react-ag-ui\/src\/useAgUiRuntime\./u,
  /(^|\/)(?:run[-/]?http[-/]?request|transform[-/]?http|httpagent|cancell?ation)/iu,
];

function option(name, args) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function pathFromDiffLine(line) {
  const fields = line.split("\t");
  const status = fields[0] ?? "";
  return (status.startsWith("R") || status.startsWith("C") ? fields.at(-1) : fields[1]) ?? "";
}

async function changedFiles(repoRoot, baseGitSha) {
  const result = await execFile("git", ["diff", "--name-status", baseGitSha], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map(pathFromDiffLine)
    .filter(Boolean);
}

async function readSession(sessionPath) {
  try {
    return JSON.parse(await readFile(sessionPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function main({ repoRoot = defaultRepoRoot, args = process.argv.slice(2) } = {}) {
  const reportPath = path.join(repoRoot, "assistant-ui-upgrade-report.json");
  const impactPath = path.join(repoRoot, "assistant-ui-upgrade-impact.md");
  const session = await readSession(path.join(repoRoot, SESSION_FILE));
  const baseGitSha = option("--base-git-sha", args) ?? session?.baseGitSha;
  if (!baseGitSha) {
    throw new Error(
      "assistant-ui upgrade report requires --base-git-sha or .assistant-ui-update-session.json.",
    );
  }

  const target = JSON.parse(await readFile(path.join(repoRoot, "assistant-ui-upgrade-target.json"), "utf8"));
  const provenance = JSON.parse(await readFile(path.join(repoRoot, "packages/react/src/internal/vendor/assistant-ui/UPSTREAM.json"), "utf8"));
  const prior = JSON.parse(await readFile(reportPath, "utf8"));
  const generatedUntrackedArtifacts = Array.isArray(session?.generatedUntrackedArtifacts)
    ? session.generatedUntrackedArtifacts
    : [];
  const files = [...new Set([
    ...(await changedFiles(repoRoot, baseGitSha)),
    ...generatedUntrackedArtifacts,
  ])]
    .filter((file) => file !== SESSION_FILE)
    .sort();
  const select = (predicate) => files.filter(predicate);
  const newAvailableElements = prior.newAvailableElements ?? [];
  const newlyAdoptedElements = prior.newlyAdoptedElements ?? [];
  const removedUpstreamElements = prior.removedUpstreamElements ?? [];
  const changedUpstreamElements = prior.changedUpstreamElements ?? [];
  const ignoredUpstreamElements = prior.ignoredUpstreamElements ?? [];
  const upstreamChangedFiles = Array.isArray(session?.upstreamChangedFiles)
    ? session.upstreamChangedFiles
    : [];
  const cancellationRelevantUpstreamChanges = upstreamChangedFiles.filter((file) =>
    CANCELLATION_UPSTREAM_PATTERNS.some((pattern) => pattern.test(file)),
  );
  const previousCompatibility = session?.previousAgUiCompatibility;
  const nextCompatibility = session?.nextAgUiCompatibility ?? session?.agUiCompatibility ?? await checkAssistantUiAgUiCompatibility({
    repoRoot,
    target,
    fetchRegistry: false,
  });
  const previousAgUi = session?.previousAgUi;
  const previousPinnedClientVersion = previousCompatibility?.pinnedClientVersion ?? previousAgUi?.["@ag-ui/client"];
  const nextPinnedClientVersion = nextCompatibility.pinnedClientVersion ?? target.agUi?.["@ag-ui/client"];
  const agUiPinnedVersionChanged =
    typeof previousPinnedClientVersion === "string" &&
    typeof nextPinnedClientVersion === "string" &&
    previousPinnedClientVersion !== nextPinnedClientVersion;
  const dependencyRangeChanged =
    previousCompatibility?.reactAgUiClientRange !== undefined &&
    previousCompatibility.reactAgUiClientRange !== nextCompatibility.reactAgUiClientRange;
  const resolvedAgUiClientVersions = Array.isArray(session?.resolvedAgUiClientVersions)
    ? session.resolvedAgUiClientVersions
    : [];
  const duplicateClientVersions = resolvedAgUiClientVersions.length > 1;
  const transportBaselineChanged =
    dependencyRangeChanged ||
    agUiPinnedVersionChanged ||
    duplicateClientVersions;
  const upstreamDiffUnavailable = session?.upstreamChangedFiles === null;
  const reasons = [];
  if (!nextCompatibility.compatible) reasons.push("react-ag-ui AG-UI dependency is incompatible with the pinned @ag-ui/client");
  if (dependencyRangeChanged) reasons.push("react-ag-ui AG-UI dependency range changed");
  if (agUiPinnedVersionChanged) reasons.push("@ag-ui/client pinned version changed");
  if (duplicateClientVersions) reasons.push("multiple @ag-ui/client versions resolved");
  if (cancellationRelevantUpstreamChanges.length > 0) reasons.push("cancellation-related upstream transport files changed");
  if (upstreamDiffUnavailable) reasons.push("upstream change set unavailable");
  const cancellationShimReauditRequired =
    !nextCompatibility.compatible ||
    dependencyRangeChanged ||
    agUiPinnedVersionChanged ||
    duplicateClientVersions ||
    transportBaselineChanged ||
    cancellationRelevantUpstreamChanges.length > 0 ||
    upstreamDiffUnavailable;
  const cancellationStatus = cancellationShimReauditRequired
    ? "REVIEW REQUIRED"
    : "SAFE: AG-UI transport baseline unchanged";
  const cancellationCompatibility = {
    ...nextCompatibility,
    guardStatus: nextCompatibility.status,
    cancellationShim: "ACTIVE",
    previousAgUi,
    previousAgUiCompatibility: previousCompatibility,
    nextAgUiCompatibility: nextCompatibility,
    resolvedAgUiClientVersions,
    duplicateClientVersions,
    dependencyRangeChanged,
    agUiPinnedVersionChanged,
    upstreamChangedFiles,
    cancellationRelevantUpstreamChanges,
    transportBaselineChanged,
    reAuditRequired: cancellationShimReauditRequired,
    reasons,
    status: cancellationStatus,
  };
  const previousAssistantUiPackages = session?.previousAssistantUiPackages;
  const previousLangGraphVersion = previousAssistantUiPackages?.["@assistant-ui/react-langgraph"];
  const nextLangGraphVersion = target.packages["@assistant-ui/react-langgraph"];
  const langGraphVersionChanged =
    typeof previousLangGraphVersion === "string" &&
    typeof nextLangGraphVersion === "string" &&
    previousLangGraphVersion !== nextLangGraphVersion;
  const langGraphCompatibility = session?.nextLangGraphCompatibility;
  const langGraphReasons = [...(langGraphCompatibility?.reasons ?? [])];
  if (langGraphVersionChanged) {
    langGraphReasons.push("@assistant-ui/react-langgraph version changed; review persisted history conversion.");
  }
  if (langGraphCompatibility?.compatible !== true && langGraphReasons.length === 0) {
    langGraphReasons.push("LangGraph history compatibility was not proven by the upgrade run.");
  }
  const langGraphReviewRequired =
    langGraphVersionChanged || langGraphCompatibility?.compatible !== true;
  const langGraphStatus = langGraphReviewRequired
    ? "REVIEW REQUIRED"
    : "UNCHANGED";
  const historyCompatibility = {
    packageName: "@assistant-ui/react-langgraph",
    previousVersion: previousLangGraphVersion,
    targetVersion: nextLangGraphVersion,
    converterSeam: "@assistant-ui/react-langgraph.convertLangChainMessages",
    externalMessageSeam: "@assistant-ui/react.unstable_convertExternalMessages",
    compatibility: langGraphCompatibility,
    versionChanged: langGraphVersionChanged,
    reAuditRequired: langGraphReviewRequired,
    reasons: langGraphReasons,
    status: langGraphStatus,
  };
  const capabilityAudit = [
    { capability: "ThreadComponents.TaskGroup", status: "NEW UPSTREAM CAPABILITY" },
    { capability: "thread.tasks", status: "NEW UPSTREAM CAPABILITY" },
    { capability: "TaskCard / TaskGroup", status: "NEW UPSTREAM CAPABILITY" },
    { capability: "AgentStatus / TaskTray", status: "NEW UPSTREAM CAPABILITY" },
    { capability: "ReasoningGroup / ToolGroup / ToolFallback", status: "UNCHANGED" },
    { capability: "Composer / Message Footer / Thread List / Attachments / Suggestions", status: "UNCHANGED" },
    { capability: "LangChain / LangGraph persisted message conversion", status: langGraphStatus },
    { capability: "ConversationSubagentTool compatibility presentation", status: "LOCAL COMPATIBILITY NO LONGER NEEDED" },
    { capability: "CancellationAwareHttpAgent / AG-UI transport", status: cancellationStatus },
  ];
  const current = {
    ...prior,
    fromRevision: session?.fromRevision ?? prior.fromRevision,
    toRevision: session?.toRevision ?? provenance.revision,
    packagesChanged: select((file) => file === "pnpm-lock.yaml" || file === "pnpm-workspace.yaml" || file.endsWith("/package.json") || file === "package.json"),
    localFacadeFilesChanged: select((file) => file.startsWith("packages/react/src/") && !file.startsWith("packages/react/src/internal/vendor/")),
    runtimeAdapterFilesChanged: select((file) => file.startsWith("packages/runtime-conversation/")),
    pluginFilesChanged: select((file) => file.startsWith("examples/agent-frontend/plugins/")),
    appUIModelFilesChanged: select((file) => file.startsWith("examples/agent-frontend/app-ui/")),
    creatorFilesChanged: select((file) => file.startsWith("packages/creator/")),
    testsChanged: select((file) => file.includes("/tests/") || file.endsWith(".test.ts") || file.endsWith(".test.tsx") || file.endsWith(".test.mjs")),
    newAvailableElements,
    newlyAdoptedElements,
    removedUpstreamElements,
    changedUpstreamElements,
    ignoredUpstreamElements,
    cancellationCompatibility,
    historyCompatibility,
    capabilityAudit,
  };

  const changedPluginDirectories = new Set(
    current.pluginFilesChanged
      .filter((file) => file !== "examples/agent-frontend/plugins/registry.generated.ts")
      .map((file) => file.split("/").slice(0, 4).join("/")),
  );
  const existingPluginDirectories = [...changedPluginDirectories].filter((file) =>
    !file.endsWith("/task-group") && !file.endsWith("/subagent-conversation"),
  );
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
- @assistant-ui/react-langgraph ${target.packages["@assistant-ui/react-langgraph"]}
- @assistant-ui/react-markdown ${target.packages["@assistant-ui/react-markdown"]}
- upstream revision: ${current.toRevision}

## AG-UI transport compatibility

Pinned @ag-ui/client:
${nextPinnedClientVersion ?? "unknown"}

Previous react-ag-ui range:
${previousCompatibility?.reactAgUiClientRange ?? "unknown"}

Target react-ag-ui range:
${nextCompatibility.reactAgUiClientRange ?? "unknown"}

Resolved lockfile versions:
${resolvedAgUiClientVersions.length === 0 ? "unknown" : resolvedAgUiClientVersions.join(", ")}

CancellationAwareHttpAgent: ${cancellationCompatibility.cancellationShim}

Status:
${cancellationStatus}
${reasons.length === 0 ? "" : `\nReasons:\n${reasons.map((reason) => `- ${reason}`).join("\n")}\n`}

## LangGraph history compatibility

Persisted history conversion:
- ${historyCompatibility.converterSeam}
- ${historyCompatibility.externalMessageSeam}
- pinned version: ${historyCompatibility.targetVersion ?? "unknown"}
- lockfile dependencies: ${Object.entries(langGraphCompatibility?.lockfileResolvedVersions ?? {})
    .map(([name, versions]) => `${name} ${versions.join(", ") || "unknown"}`)
    .join("; ") || "unknown"}

Status:
${langGraphStatus}
${langGraphReasons.length === 0 ? "" : `\nReasons:\n${langGraphReasons.map((reason) => `- ${reason}`).join("\n")}\n`}

## Vendor changes

- changed ${current.vendorFilesChanged.length} files
- added ${current.vendorFilesAdded.length} files
- removed ${current.vendorFilesRemoved.length} files
- new transitive dependencies: ${current.newTransitiveDependencies.length}

## Upstream Element discovery

### NEW UPSTREAM ELEMENTS

${current.newAvailableElements.length === 0 ? "- none" : current.newAvailableElements.map((file) => `- ${file}`).join("\n")}

### Adoption

- newly adopted: ${current.newlyAdoptedElements.length === 0 ? "none" : current.newlyAdoptedElements.join(", ")}
- removed upstream Elements: ${current.removedUpstreamElements.length === 0 ? "none" : current.removedUpstreamElements.join(", ")}
- changed tracked upstream Elements: ${current.changedUpstreamElements.length === 0 ? "none" : current.changedUpstreamElements.join(", ")}

### Explicitly ignored with rationale

${current.ignoredUpstreamElements.length === 0
    ? "- none"
    : current.ignoredUpstreamElements.map(({ localPath, rationale }) => `- ${localPath}: ${rationale}`).join("\n")}

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
  return current;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
