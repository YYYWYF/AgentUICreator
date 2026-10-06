import { prepareProductAdapters } from "../packages/react/scripts/sync-product-adapters.mjs";
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
const QUOTE_SELECTION_SEAM_FILES = [
  "packages/react/src/internal/adapters/assistant-ui/components/assistant-ui/elements/quote.aui.tsx",
  "packages/react/src/internal/quote-selection-root.tsx",
  "packages/react/src/internal/quote-selection-action.tsx",
  "packages/react/src/internal/quote-selection-message-id.ts",
  "packages/react/src/internal/quote-selection-UPSTREAM.json",
];
const QUOTE_SELECTION_UPSTREAM_FILES = [
  "packages/ui/src/components/react/assistant-ui/elements/quote.aui.tsx",
  "packages/react/src/primitives/selectionToolbar/SelectionToolbarRoot.tsx",
  "packages/react/src/primitives/selectionToolbar/SelectionToolbarQuote.tsx",
  "packages/react/src/utils/getSelectionMessageId.ts",
];

export function quoteSelectionIntegrationReport(files, upstreamChangedFiles) {
  const changedFiles = QUOTE_SELECTION_SEAM_FILES.filter(file => files.includes(file));
  const upstream = (upstreamChangedFiles ?? []).filter(file => QUOTE_SELECTION_UPSTREAM_FILES.includes(file));
  return {
    status: upstreamChangedFiles == null || changedFiles.length > 0 || upstream.length > 0
      ? "REVIEW REQUIRED" : "UNCHANGED",
    seamFiles: QUOTE_SELECTION_SEAM_FILES,
    changedFiles,
    upstreamChangedFiles: upstream,
    upstreamDiffUnavailable: upstreamChangedFiles == null,
  };
}

const PRODUCT_ADAPTER_ROOT = "packages/react/src/internal/adapters/assistant-ui";
const STYLE_BOUNDARY_ROOT = "packages/react/src/internal/style-boundary";
const PRODUCT_ADAPTER_GENERATOR = "packages/react/scripts/sync-product-adapters.mjs";
const THREAD_LIST_PORTAL_SEAM = "packages/react/src/internal/conversation-thread-list-item.tsx";
const PRODUCT_ADAPTER_PROVENANCE = `${PRODUCT_ADAPTER_ROOT}/UPSTREAM.json`;

export function productIntegrationReport(files, upstreamChangedFiles, audit) {
  const changedFiles = files.filter(file => file.startsWith(`${PRODUCT_ADAPTER_ROOT}/`) ||
    file.startsWith(`${STYLE_BOUNDARY_ROOT}/`) || file === PRODUCT_ADAPTER_GENERATOR || file === THREAD_LIST_PORTAL_SEAM);
  const upstream = (upstreamChangedFiles ?? []).filter(file => audit.upstreamPaths.includes(file) ||
    /^packages\/react\/src\/primitives\/(?:actionBarMore|threadListItemMore|selectionToolbar|composer)\//u.test(file));
  const reviewRequired = upstreamChangedFiles == null || audit.generatorDrift.status !== "PASS" ||
    changedFiles.length > 0 || upstream.length > 0 || audit.provenance.changed;
  return {
    status: reviewRequired ? "REVIEW REQUIRED: product adapter / Portal integration" : "UNCHANGED",
    seamFiles: [`${PRODUCT_ADAPTER_ROOT}/**`, `${STYLE_BOUNDARY_ROOT}/**`, PRODUCT_ADAPTER_GENERATOR, THREAD_LIST_PORTAL_SEAM],
    changedFiles,
    upstreamChangedFiles: upstream,
    upstreamDiffUnavailable: upstreamChangedFiles == null,
    provenance: audit.provenance,
    generatorDrift: audit.generatorDrift,
  };
}

async function auditProductIntegration(repoRoot, baseGitSha, vendorProvenance) {
  const audit = {
    upstreamPaths: [],
    provenance: { path: PRODUCT_ADAPTER_PROVENANCE, revision: null, baseRevision: null, changed: false },
    generatorDrift: { status: "UNAVAILABLE", reason: "Product integration has not been inspected" },
  };
  try {
    const source = await readFile(path.join(repoRoot, PRODUCT_ADAPTER_PROVENANCE), "utf8");
    const record = JSON.parse(source);
    audit.provenance.revision = record.revision;
    try {
      const before = await execFile("git", ["show", `${baseGitSha}:${PRODUCT_ADAPTER_PROVENANCE}`], { cwd: repoRoot, encoding: "utf8" });
      audit.provenance.baseRevision = JSON.parse(before.stdout).revision;
      audit.provenance.changed = before.stdout !== source;
    } catch {
      audit.provenance.changed = true;
      audit.provenance.baselineUnavailable = true;
    }
    const integrated = new Set(record.files.map(file => file.localPath));
    audit.upstreamPaths = vendorProvenance.files.filter(file => integrated.has(file.localPath)).map(file => file.upstreamPath);
    const expected = await prepareProductAdapters(path.join(repoRoot, "packages/react/src/internal/vendor/assistant-ui"));
    if (record.revision !== expected.revision ||
      JSON.stringify(record.files) !== JSON.stringify(expected.files.map(({source, ...file}) => file))) {
      throw new Error("Product adapter provenance differs from the current clean vendor / generator");
    }
    for (const file of expected.files) {
      const actual = await readFile(path.join(repoRoot, PRODUCT_ADAPTER_ROOT, file.localPath), "utf8");
      if (actual !== file.source) throw new Error(`Product adapter generator drift: ${file.localPath}`);
    }
    audit.generatorDrift = { status: "PASS", generatedFiles: expected.files.length };
  } catch (error) {
    audit.generatorDrift = { status: "REVIEW REQUIRED", reason: error.message };
  }
  return audit;
}

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
  const integrationAudit = await auditProductIntegration(repoRoot, baseGitSha, provenance);
  const portalIntegration = productIntegrationReport(files, session?.upstreamChangedFiles, integrationAudit);
  const portalChangedFiles = portalIntegration.changedFiles;
  const portalUpstreamChangedFiles = portalIntegration.upstreamChangedFiles;
  const quoteSelectionIntegration = quoteSelectionIntegrationReport(files, session?.upstreamChangedFiles);
  const cancellationRelevantUpstreamChanges = upstreamChangedFiles.filter((file) =>
    CANCELLATION_UPSTREAM_PATTERNS.some((pattern) => pattern.test(file)),
  );
  const previousCompatibility = session?.previousAgUiCompatibility;
  const cachedCompatibility = session?.nextAgUiCompatibility ?? session?.agUiCompatibility;
  let currentCompatibility = await checkAssistantUiAgUiCompatibility({
    repoRoot,
    target,
    fetchRegistry: false,
  });
  if (!currentCompatibility.reactAgUiClientRange && !cachedCompatibility?.reactAgUiClientRange) {
    currentCompatibility = await checkAssistantUiAgUiCompatibility({ repoRoot, target });
  }
  const nextCompatibility = currentCompatibility.reactAgUiClientRange
    ? currentCompatibility
    : cachedCompatibility ?? currentCompatibility;
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
  const resolvedAgUiClientVersions = currentCompatibility.resolvedClientVersions.length > 0
    ? currentCompatibility.resolvedClientVersions
    : Array.isArray(session?.resolvedAgUiClientVersions) ? session.resolvedAgUiClientVersions : [];
  const duplicateClientVersions = resolvedAgUiClientVersions.length > 1;
  const transportBaselineChanged =
    dependencyRangeChanged ||
    agUiPinnedVersionChanged ||
    duplicateClientVersions;
  const upstreamDiffUnavailable = session?.upstreamChangedFiles === null;
  const reasons = [];
  if (!nextCompatibility.compatible) reasons.push(
    nextCompatibility.reactAgUiClientRange
      ? "react-ag-ui AG-UI dependency is incompatible with the resolved @ag-ui/client"
      : "react-ag-ui AG-UI dependency range could not be verified",
  );
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
  const langGraphSourceCompatibility = session?.nextLangGraphSourceCompatibility;
  const langGraphPackageCompatibility =
    session?.nextLangGraphPackageCompatibility ??
    session?.nextLangGraphInstalledCompatibility ??
    session?.nextLangGraphCompatibility;
  const langGraphReasons = [
    ...(langGraphSourceCompatibility?.reasons ?? []),
    ...(langGraphPackageCompatibility?.reasons ?? []),
  ];
  if (langGraphVersionChanged) {
    langGraphReasons.push("@assistant-ui/react-langgraph version changed; review persisted history conversion.");
  }
  if (langGraphSourceCompatibility?.compatible !== true && (langGraphSourceCompatibility?.reasons?.length ?? 0) === 0) {
    langGraphReasons.push("LangGraph source API compatibility was not proven by the upgrade run.");
  }
  if (langGraphPackageCompatibility?.compatible !== true && (langGraphPackageCompatibility?.reasons?.length ?? 0) === 0) {
    langGraphReasons.push("LangGraph published package compatibility was not proven by the upgrade run.");
  }
  const langGraphReviewRequired =
    langGraphVersionChanged ||
    langGraphSourceCompatibility?.compatible !== true ||
    langGraphPackageCompatibility?.compatible !== true;
  const langGraphStatus = langGraphReviewRequired
    ? "REVIEW REQUIRED"
    : "UNCHANGED";
  const historyCompatibility = {
    packageName: "@assistant-ui/react-langgraph",
    previousVersion: previousLangGraphVersion,
    targetVersion: nextLangGraphVersion,
    converterSeam: "@assistant-ui/react-langgraph.convertLangChainMessages",
    externalMessageSeam: "@assistant-ui/react.unstable_convertExternalMessages",
    sourceCompatibility: langGraphSourceCompatibility,
    packageCompatibility: langGraphPackageCompatibility,
    publishedPackageExports: langGraphPackageCompatibility?.exports,
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
    sourceRegistryAssistantUiFilesChanged: select((file) => [
      "packages/source-registry/registry/items/agent-component-assistant-ui-generative-ui/",
      "packages/source-registry/registry/items/integration-generative-ui/",
      "packages/source-registry/registry/items/integration-a2ui/",
    ].some((prefix) => file.startsWith(prefix))),
    pluginFilesChanged: select((file) => file.startsWith("examples/creator-host-sandbox/plugins/")),
    appUIModelFilesChanged: select((file) => file.startsWith("examples/creator-host-sandbox/app-ui/")),
    creatorFilesChanged: select((file) => file.startsWith("packages/creator/")),
    testsChanged: select((file) => file.includes("/tests/") || file.endsWith(".test.ts") || file.endsWith(".test.tsx") || file.endsWith(".test.mjs")),
    newAvailableElements,
    newlyAdoptedElements,
    removedUpstreamElements,
    changedUpstreamElements,
    ignoredUpstreamElements,
    portalIntegration,
    quoteSelectionIntegration,
    cancellationCompatibility,
    historyCompatibility,
    capabilityAudit,
  };

  const changedPluginDirectories = new Set(
    current.pluginFilesChanged
      .filter((file) => file !== "examples/creator-host-sandbox/plugins/registry.generated.ts")
      .map((file) => file.split("/").slice(0, 4).join("/")),
  );
  const existingPluginDirectories = [...changedPluginDirectories].filter((file) =>
    !file.endsWith("/task-group") && !file.endsWith("/subagent-conversation"),
  );
  const highRisk = current.creatorFilesChanged.length > 0 || current.appUIModelFilesChanged.length > 1 || existingPluginDirectories.length > 3;
  const mediumRisk = current.runtimeAdapterFilesChanged.length > 0 || current.localFacadeFilesChanged.length > 4 || existingPluginDirectories.length > 1 || current.sourceRegistryAssistantUiFilesChanged.length > 0;
  const cost = highRisk ? "High" : mediumRisk ? "Medium" : "Low";

  const markdown = `# assistant-ui Upgrade Impact Report

Earlier upgrade and acceptance evidence is retained in [assistant-ui-upgrade-retained-evidence.md](docs/architecture/assistant-ui-upgrade-retained-evidence.md).

From:
- packages: ${current.packagesChanged.length === 0 ? "unchanged in report metadata" : current.packagesChanged.join(", ")}
- upstream revision: ${current.fromRevision}

To:
- @assistant-ui/react ${target.packages["@assistant-ui/react"]}
- @assistant-ui/react-ag-ui ${target.packages["@assistant-ui/react-ag-ui"]}
- @assistant-ui/react-langgraph ${target.packages["@assistant-ui/react-langgraph"]}
- @assistant-ui/react-markdown ${target.packages["@assistant-ui/react-markdown"]}
- @assistant-ui/react-generative-ui ${target.packages["@assistant-ui/react-generative-ui"] ?? "not targeted"}
- upstream revision: ${current.toRevision}
- Generative UI release revision: ${target.generativeUiReleaseRevision ?? "not targeted"}

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

Source API seams:
- ${historyCompatibility.converterSeam}
- @assistant-ui/react-langgraph.LangChainMessage
- ${historyCompatibility.externalMessageSeam}

Source status:
${langGraphSourceCompatibility?.status ?? "REVIEW REQUIRED"}

Target package:
@assistant-ui/react-langgraph ${historyCompatibility.targetVersion ?? "unknown"}

Resolved dependencies:
${Object.entries(langGraphPackageCompatibility?.resolvedDependencies ?? {})
    .map(([name, versions]) => `${name} ${versions.join(", ") || "unknown"}`)
    .join("; ") || Object.entries(langGraphPackageCompatibility?.lockfileResolvedVersions ?? {})
    .map(([name, versions]) => `${name} ${versions.join(", ") || "unknown"}`)
    .join("; ") || "unknown"}

Published package / lockfile compatibility:
${langGraphPackageCompatibility?.status ?? "REVIEW REQUIRED"}

Published package API exports:
- @assistant-ui/react-langgraph.convertLangChainMessages: ${langGraphPackageCompatibility?.exports?.convertLangChainMessages === true ? "PASS" : "REVIEW REQUIRED"}
- @assistant-ui/react-langgraph.LangChainMessage: ${langGraphPackageCompatibility?.exports?.LangChainMessage === true ? "PASS" : "REVIEW REQUIRED"}
- @assistant-ui/react.unstable_convertExternalMessages: ${langGraphPackageCompatibility?.exports?.unstable_convertExternalMessages === true ? "PASS" : "REVIEW REQUIRED"}

Overall status:
${langGraphStatus}
${langGraphReasons.length === 0 ? "" : `\nReasons:\n${langGraphReasons.map((reason) => `- ${reason}`).join("\n")}\n`}

## Vendor changes

- changed ${current.vendorFilesChanged.length} files
- added ${current.vendorFilesAdded.length} files
- removed ${current.vendorFilesRemoved.length} files
- new transitive dependencies: ${current.newTransitiveDependencies.length}

Product adapter / Portal integration: ${portalIntegration.status}
- product adapter and style-boundary files changed: ${portalChangedFiles.join(", ") || "none"}
- relevant upstream component/primitive files changed: ${portalUpstreamChangedFiles.join(", ") || "none"}
- adapter provenance changed: ${portalIntegration.provenance.changed ? "yes" : "no"}
- adapter revision: ${portalIntegration.provenance.baseRevision ?? "baseline unavailable"} → ${portalIntegration.provenance.revision ?? "unavailable"}
- generator drift: ${portalIntegration.generatorDrift.status}${portalIntegration.generatorDrift.reason ? ` — ${portalIntegration.generatorDrift.reason}` : ""}

Quote selection integration seam: ${quoteSelectionIntegration.status}
- local Quote seam files changed: ${quoteSelectionIntegration.changedFiles.join(", ") || "none"}
- upstream Quote selection files changed: ${quoteSelectionIntegration.upstreamChangedFiles.join(", ") || "none"}

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

## Source Registry assistant-ui Resources

- ${current.sourceRegistryAssistantUiFilesChanged.length} files: ${current.sourceRegistryAssistantUiFilesChanged.join(", ") || "none"}

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

Reason: vendor changes are expected; the assessment tracks whether the public facade, runtime adapter, Source Registry assistant-ui Resources, existing Plugins, AppUIModel, or Creator changed.
`;

  await writeFile(reportPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  await writeFile(impactPath, markdown, "utf8");
  console.log(JSON.stringify({ report: path.relative(repoRoot, reportPath), impact: path.relative(repoRoot, impactPath), cost }, null, 2));
  return current;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
