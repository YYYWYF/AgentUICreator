import type { ToolContext } from "./tools.js";
import { requestOperator } from "./operator.js";
import { creatorContentHash as hash } from "./files/creatorFileState.js";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export function runtimeIdentity(item: any) {
  return Object.fromEntries(["kind", "pluginId", "instanceId", "eventName", "code"].map(key => [key, item[key] ?? null]).concat([["issuePaths", [...new Set(item.issuePaths ?? [])].sort()]]));
}
export function runtimeTargetId(item: any) { return "runtime:" + hash(JSON.stringify(runtimeIdentity(item))); }

export function recordRuntimeEvidence(store: Map<string, any>, input: any) {
  const item = input.diagnostic ?? input.composition;
  if (input.diagnostic) {
    const pluginKinds = ["plugin-render", "plugin-activation", "plugin-width-incompatible", "application-gate", "plugin-event-undeclared-subscription", "plugin-event-handler-error"];
    const eventKinds = ["application-event-unknown", "application-event-invalid-payload", "plugin-event-undeclared-subscription", "plugin-event-handler-error"];
    if ((item.status === "error" && typeof item.errorMessage !== "string") || (pluginKinds.includes(item.kind) && (!item.pluginId || !item.instanceId)) || (eventKinds.includes(item.kind) && !item.eventName)) throw new Error("CREATOR_RUNTIME_DIAGNOSTIC_INVALID");
    if (item.kind === "plugin-width-incompatible" && (item.code !== "PLUGIN_WIDTH_INCOMPATIBLE" || !item.slotId || item.requiredWidth !== "wide" || !item.actualWidthClass)) throw new Error("CREATOR_RUNTIME_DIAGNOSTIC_INVALID");
    if (item.issuePaths?.some((part: unknown) => typeof part !== "string" || !part.length || part.length > 500)) throw new Error("CREATOR_RUNTIME_DIAGNOSTIC_INVALID");
  } else {
    for (const [field, key] of [["instances", "instanceId"], ["slots", "slotId"], ["layoutNodes", "nodeId"]]) {
      const values = (item[field!] ?? []).map((value: any) => value[key!]);
      if (new Set(values).size !== values.length) throw new Error("CREATOR_RUNTIME_COMPOSITION_DUPLICATE_ID");
    }
  }
  const timestamp = Date.parse(item.occurredAt ?? item.observedAt);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60_000) throw new Error("CREATOR_RUNTIME_TIMESTAMP_INVALID");
  // Resolve a kind/instance/event without allowing a different diagnostic kind
  // or a late report to erase a newer failure for the same instance.
  const identity = input.diagnostic ? [item.kind, item.pluginId, item.instanceId, item.eventName] : ["composition", input.observationRequestId ?? "latest"];
  const key = JSON.stringify([input.threadId, item.appUIModelHash, ...identity]);
  const previous = store.get(key), previousItem = previous?.diagnostic ?? previous?.composition;
  if (previousItem && Date.parse(previousItem.occurredAt ?? previousItem.observedAt) > timestamp) return;
  store.delete(key);
  store.set(key, { ...input, receivedAt: new Date().toISOString() });
  const captures = [...store.entries()].filter(([, value]) => value.threadId === input.threadId && value.composition && value.observationRequestId);
  while (captures.length > 8) store.delete(captures.shift()![0]);
  const scoped = [...store.entries()].filter(([, value]) => value.threadId === input.threadId);
  if (scoped.length > 220) store.delete(scoped[0]![0]);
  while (store.size > 11_000) store.delete(store.keys().next().value!);
}

export async function inspectRuntime(context: ToolContext, options: { includeStale?: boolean; instanceIds?: string | string[]; nodeRefs?: string | string[]; refresh?: boolean } = {}) {
  if (context.verificationMode !== "static_and_runtime") throw new Error("CREATOR_RUNTIME_VERIFICATION_DISABLED");
  const project = await requestOperator(context.root, "inspect_ui_project", { view: "composition" }, context.signal);
  const currentHash = project.appUIModel?.hash ?? project.appUIModelHash;
  if (!/^[a-f0-9]{64}$/u.test(currentHash)) throw new Error("CREATOR_RUNTIME_MODEL_HASH_UNAVAILABLE");
  const currentHashes = [...new Set([currentHash, project.appUIModel?.runtimeHash].filter((value): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value)))];
  let scoped: any[] = [], current: any[] = [], latest: any, composition: any;
  const collect = (requestId?: string) => {
    scoped = [...context.diagnostics.values()].filter(item => item.threadId === context.threadId);
    current = scoped.filter(item => currentHashes.includes((item.diagnostic ?? item.composition)?.appUIModelHash));
    latest = current.filter(item => item.composition).sort((a, b) => Date.parse(b.composition.observedAt) - Date.parse(a.composition.observedAt))[0];
    if (requestId) latest = current.find(item => item.composition && item.observationRequestId === requestId) ?? latest;
    composition = latest?.composition;
  };
  collect();
  const timestampFresh = (envelope: any, timestamp: string) => Date.now() - Date.parse(timestamp) < 60_000 && Date.now() - Date.parse(envelope.receivedAt) < 60_000 && (!context.activity.lastMutationAt || Date.parse(timestamp) >= Date.parse(context.activity.lastMutationAt));
  let filtersNormalized = false;
  const filters = (value?: string | string[]) => {
    if (typeof value === "string" && value.trim().startsWith("[")) {
      let decoded: unknown;
      try { if (value.length <= 10_100) decoded = JSON.parse(value); } catch { /* Invalid encoding remains rejected. */ }
      if (Array.isArray(decoded) && decoded.length <= 50 && decoded.every(id => typeof id === "string" && id.length > 0 && id.length <= 200)) {
        filtersNormalized = true; return decoded as string[];
      }
      throw Object.assign(new Error("CREATOR_RUNTIME_LAYOUT_FILTER_INVALID: use a bounded array of identity strings"), {
      code: "CREATOR_RUNTIME_LAYOUT_FILTER_INVALID", reason: "serialized_array_not_identity", scope: currentHash,
      recovery: { action: "correct_filter_shape", retryable: false, instruction: 'Use instanceIds: ["returned-id"] or nodeRefs: ["returned-ref"], or omit filters. Do not serialize an array into a string.' },
      });
    }
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  };
  const instanceIds = filters(options.instanceIds), nodeRefs = filters(options.nodeRefs);
  const projectInstances = project.plugins ?? project.pluginInstances ?? [];
  const runtimeToAuthoring = new Map<string, string>(projectInstances.map((item: any) => [item.runtimeInstanceId ?? item.id, item.id]));
  const authoringId = (id: string) => runtimeToAuthoring.get(id) ?? id;
  const targets = new Map(projectInstances.map((item: any) => [item.id, item.target]));
  const layoutRefs = new Map<string, string>();
  const visit = (node: any, location: string) => {
    if (!node || typeof node !== "object") return;
    if (node.nodeRef) layoutRefs.set(location, node.nodeRef);
    for (const [index, child] of (node.children ?? []).entries()) visit(child, `${location}.children[${index}]`);
    if (node.type === "panel") visit(node.child, `${location}.child`);
    if (node.type === "sidebar") {
      for (const name of ["header", "content", "footer"]) visit(node[name], `${location}.${name}`);
      for (const [index, item] of (node.items ?? []).entries()) visit(item.child, `${location}.items[${index}].child`);
    }
  };
  visit(project.appUIModel?.layout, "root");
  const invalidNodeRefs = nodeRefs.filter(ref => ![...layoutRefs.values()].includes(ref));
  const invalidInstanceIds = instanceIds.filter(id => !targets.has(id));
  if (invalidNodeRefs.length || invalidInstanceIds.length) throw Object.assign(new Error("CREATOR_RUNTIME_LAYOUT_REFERENCE_STALE: requested identities are absent from the current composition; this is not an observation timeout"), {
    code: "CREATOR_RUNTIME_LAYOUT_REFERENCE_STALE", reason: "current_composition_reference_mismatch", scope: currentHash,
    details: { currentHash, invalidNodeRefs, invalidInstanceIds,
      validNodeRefs: [...layoutRefs.values()].slice(0, 100), validInstanceIds: [...targets.keys()].slice(0, 100),
      identitiesTruncated: layoutRefs.size > 100 || targets.size > 100 },
    recovery: { action: "refresh_composition_references", retryable: false,
      tool: "inspect_ui_project", input: { view: "composition" },
      instruction: "Use exact nodeRef and instance id values from current composition. Runtime nodeId values and DOM selectors are not nodeRefs. Retry with valid identities, or omit filters to discover current geometry." },
  });
  let observationRefresh: { status: string; requestId?: string; reason?: string } = { status: "not_needed" };
  const runtimeInstanceIds = instanceIds.map(id => projectInstances.find((item: any) => item.id === id)?.runtimeInstanceId ?? id);
  const runtimeNodeIds = [...layoutRefs.entries()].filter(([, ref]) => nodeRefs.includes(ref)).map(([location]) => `layout-node:${encodeURIComponent(location)}`);
  if (options.refresh || !latest || !timestampFresh(latest, composition.observedAt)) {
    if (!context.requestRuntimeObservation) observationRefresh = { status: "unavailable", reason: "no_connected_observation_request_transport" };
    else {
      const key = JSON.stringify([currentHash, context.activity.revision, [...instanceIds].sort(), [...nodeRefs].sort()]);
      const saved = context.runtimeObservationRefresh;
      const refresh = saved?.key === key ? saved : { key, pending: (async () => {
        const requestId = randomUUID();
        await context.requestRuntimeObservation!({ requestId, currentHash, currentHashes,
          ...(runtimeInstanceIds.length ? { instanceIds: runtimeInstanceIds } : {}), ...(runtimeNodeIds.length ? { nodeIds: runtimeNodeIds } : {}) });
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          context.signal.throwIfAborted();
          collect(requestId);
          if (latest?.observationRequestId === requestId && timestampFresh(latest, composition.observedAt)) break;
          await delay(50, undefined, { signal: context.signal });
        }
        const result = { status: latest?.observationRequestId === requestId && timestampFresh(latest, composition.observedAt) ? "received" : "timeout", requestId };
        await context.activity.log("runtime_observation_refresh", { ...result, currentHash, revision: context.activity.revision });
        return result;
      })() };
      context.runtimeObservationRefresh = refresh;
      try { observationRefresh = await refresh.pending; collect(observationRefresh.requestId); }
      finally { if (context.runtimeObservationRefresh === refresh) delete context.runtimeObservationRefresh; }
    }
  }
  const fresh = Boolean(latest && timestampFresh(latest, composition.observedAt));
  const catalogFresh = !composition?.capabilityCatalogRevision || composition.capabilityCatalogRevision === (project.capabilityCatalogRevision ?? project.capabilityCatalog?.revision);
  const refreshSatisfied = !options.refresh || observationRefresh.status === "received";
  const complete = fresh && catalogFresh && refreshSatisfied && !["bootstrapping", "resolving-gates", "error"].includes(composition.application?.phase);
  const presentation = latest?.presentation;
  const regionFacts = (kind: string, id: string) => {
    const region = presentation?.regions?.find((item: any) => item.kind === kind && item.id === id);
    return region ? { presentation: { nodes: region.nodes, truncated: region.truncated } } : {};
  };
  const instances = (composition?.instances ?? []).filter((item: any) => !instanceIds.length || instanceIds.includes(authoringId(item.instanceId))).map(({ slotId, slotPath, ...item }: any) => ({ ...item, instanceId: authoringId(item.instanceId), target: targets.get(authoringId(item.instanceId)), ...regionFacts("instance", item.instanceId) }));
  const layoutNodes = (composition?.layoutNodes ?? []).flatMap(({ nodeId, ...item }: any) => {
    let nodeRef: string | undefined;
    try { if (nodeId.startsWith("layout-node:")) nodeRef = layoutRefs.get(decodeURIComponent(nodeId.slice(12))); } catch { /* Invalid runtime IDs are not authoring references. */ }
    return nodeRef && (!nodeRefs.length || nodeRefs.includes(nodeRef)) ? [{ ...item, nodeRef, ...regionFacts("layout", nodeId) }] : [];
  });
  const sanitize = (item: any) => { const { slotId, slotPath, ...data } = item; return { ...data,
    ...(item.instanceId ? { instanceId: authoringId(item.instanceId) } : {}), target: targets.get(authoringId(item.instanceId)), debuggingTargetId: runtimeTargetId(item) }; };
  const diagnostics = current.filter(item => item.diagnostic).map(item => item.diagnostic);
  const errors = diagnostics.filter(item => item.status === "error").map(sanitize);
  const observed = Boolean(latest);
  const result = { currentHash, runtimeStatus: complete ? "available" : latest ? "stale" : "unavailable", compositionFresh: complete, diagnosticFresh: complete, runtimeObserved: observed,
    currentErrors: errors, resolvedCurrent: diagnostics.filter(item => item.status === "resolved").map(sanitize), observationRefresh,
    ...(filtersNormalized ? { filterEncodingNormalized: true } : {}),
    presentationCoverage: presentation ? { status: presentation.status, reason: presentation.reason, truncated: presentation.truncated,
      interpretation: "Bounded structural and computed-style facts inside published semantic regions. No text or input values. Use nodeRefs/instanceIds to narrow truncated observations. Attribute locations and computed widths are observed facts; identical fresh observations are not evidence that CSS updates were missed." } : { status: "unavailable", reason: "preview_did_not_supply_presentation" },
    ...(!complete ? { unavailableReasons: [!latest ? "no_current_hash_observation" : !fresh ? "observation_age_or_pre_mutation" : undefined,
      !catalogFresh ? "capability_catalog_mismatch" : undefined, !refreshSatisfied ? "fresh_capture_not_received" : undefined,
      composition?.application && ["bootstrapping", "resolving-gates", "error"].includes(composition.application.phase) ? `application_${composition.application.phase}` : undefined].filter(Boolean),
      recovery: { action: "check_connected_preview", retryable: false, instruction: "No fresh runtime proof was obtained. Check the selected project's connected preview; do not repeat unchanged inspections or treat this as a source defect. Continue independent static work and report the observation gap." } } : {}),
    summary: { currentOpenCount: errors.length, truncated: false },
    ...(options.includeStale ? { stale: scoped.filter(item => !currentHashes.includes((item.diagnostic ?? item.composition)?.appUIModelHash)).filter(item => item.diagnostic).map(item => sanitize(item.diagnostic)) } : {}),
    ...(composition ? { observedAt: composition.observedAt, viewport: composition.viewport, application: composition.application, instances, layoutNodes } : {}),
    interpretation: "Current-hash geometry is structural observation. Browser focus, appearance and interaction require a live browser check. Unavailable or stale evidence is not a pass.",
  };
  context.debugging?.observeRuntime(result, context.activity.revision);
  return result;
}
