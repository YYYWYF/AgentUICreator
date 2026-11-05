import { walk } from "./activity.js";
import { editingProjectIdentity } from "./editing-session.js";
import { creatorContentHash, readCreatorFileState } from "./files/creatorFileState.js";
import { requestOperator } from "./operator.js";
import type { ToolContext } from "./tools.js";
import { stat } from "node:fs/promises";
import path from "node:path";

/** Recheck contents, not mtimes or just the Agent's mutation counter. */
export async function projectCheckIdentity(root: string, signal: AbortSignal) {
  try {
    signal.throwIfAborted();
    const files = [...await walk(root, "", 5000), ...await walk(root, ".agent-ui", 5000, new Set(["creator", "mocks", "visual-observations", "operator"]))].sort();
    const hashes: unknown[] = [await editingProjectIdentity(root)];
    let bytes = 0;
    for (const file of files) {
      signal.throwIfAborted();
      const size = (await stat(path.join(root, file))).size;
      if (size > 1_000_000 || (bytes += size) > 8_000_000) return undefined;
      hashes.push([file, (await readCreatorFileState(root, file)).hash]);
    }
    return creatorContentHash(JSON.stringify(hashes));
  } catch {
    signal.throwIfAborted();
    // Cache bookkeeping must not introduce a new project-size or read gate.
    return undefined;
  }
}

const inspections = new WeakMap<ToolContext, Map<string, { identity: string; result: Promise<Record<string, any>> }>>();
export function runtimeObservationNavigation(project: Record<string, any>) {
  const nodeRef = project.appUIModel?.layout?.nodeRef;
  return { tool: "inspect_runtime_layout", toolGroup: "debugging", enableIfNeeded: { tool: "enable_creator_tools", input: { groups: ["debugging"] } },
    input: nodeRef ? { nodeRefs: [nodeRef] } : {},
    useWhen: "Actual dimensions, wrapping, container structure or mode-attribute locations are needed. Use the live observation instead of tracing framework/npm implementations to guess rendered DOM.",
    coverage: "Fresh rectangles, bounded semantic-region structure, attribute locations and computed layout styles. No text, input values, arbitrary selectors or JavaScript.",
    evidenceBoundary: "Tool availability is not proof that the preview is connected or the goal is satisfied. Explicit geometry outcomes need fresh relevant rectangles before completion; a static pass alone is insufficient. Enable a tool group alone before using its tools." };
}
export async function inspectProject(context: ToolContext, input: Record<string, any>) {
  // Full inspection may contain installed API/source diagnostics. Only reuse
  // composition metadata, never runtime evidence, permissions or mutations.
  if (input.view !== "composition") return requestOperator(context.root, "inspect_ui_project", input, context.signal);
  const identity = await projectCheckIdentity(context.root, context.signal);
  if (identity === undefined) return requestOperator(context.root, "inspect_ui_project", input, context.signal);
  const cache = inspections.get(context) ?? new Map(); inspections.set(context, cache);
  const key = JSON.stringify(input), saved = cache.get(key);
  if (saved?.identity === identity) {
    await context.activity.log("inspection_reused", { operation: "inspect_ui_project", revision: context.activity.revision });
    return structuredClone(await saved.result);
  }
  const pending = (async () => {
    const result = await requestOperator(context.root, "inspect_ui_project", input, context.signal);
    if (identity !== await projectCheckIdentity(context.root, context.signal)) throw new Error("EDITING_CONTEXT_STALE");
    return result;
  })();
  cache.set(key, { identity, result: pending });
  try { return structuredClone(await pending); }
  catch (error) { if (cache.get(key)?.result === pending) cache.delete(key); throw error; }
}

/** Agent-facing projection only. Operator contracts and full observations stay intact. */
export function projectInspectionSummary(result: Record<string, any>): Record<string, any> {
  const pick = (value: any, keys: string[]) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
  const catalog = result.authoringTargetCatalog;
  const actions = result.creatorActions;
  return { ...pick(result, ["view", "sourceRoot", "workspaceDiagnostics", "observationCoverage", "hostGuarantees", "appUIModel", "pluginInstances", "pluginSources", "capabilityCatalogRevision", "activeComposition", "layoutConstraints", "runtimeObservation"]),
    ...(catalog ? { authoringTargetCatalog: { revision: catalog.revision,
      candidates: catalog.candidates?.map((item: any) => pick(item, ["id", "kind", "name", "pluginId", "relatedPluginIds"])),
      bindings: catalog.bindings?.map((item: any) => pick(item, ["targetId", "kind", "pluginId", "ownerPath", "definitionPath", "ownerRoot"])),
    } } : {}),
    ...(actions ? { creatorActions: { revision: actions.revision,
      candidates: actions.candidates?.map((item: any) => pick(item, ["actionId", "kind", "status", "target"])),
    } } : {}),
    ...(result.capabilitySummaries ? { capabilitySummaries: result.capabilitySummaries.map((item: any) => pick(item, ["pluginId", "name", "capabilities", "selected", "childSlots", "requiresRenderScope"])) } : {}),
    projection: { kind: "navigation_summary", omitted: ["Plugin descriptions, authoring contracts and service details", "target matching rules", "action effects and execution plans"],
      fullResult: { tool: "inspect_ui_project", input: { ...(result.view === "composition" ? { view: "composition" } : {}), detail: "full" } },
      pluginDetails: "inspect_ui_plugin returns the selected Plugin's full API, composition and ownership" },
  };
}

/** Keep every prop name discoverable once; inherited DOM detail stays available on demand. */
export function pluginInspectionSummary(result: Record<string, any>, pluginId: string) {
  const application = result.application, api = application?.publicApi;
  if (!api || api.status !== "available") return result;
  const { props = [], propNames, ...apiFacts } = api;
  const { customizationProps: _duplicateNames, ...usageGuide } = application.usageGuide ?? {};
  const ownProps = props.filter((property: any) => property.inherited !== true);
  return { ...result, application: { ...application,
    usageGuide: { ...usageGuide, propNamesReference: "application.publicApi.propNames" },
    publicApi: { ...apiFacts, props: ownProps, propNames,
      inheritedDetailsOmitted: props.length - ownProps.length,
      fullResult: { tool: "inspect_ui_plugin", input: { pluginId, detail: "full" } },
    },
  } };
}
