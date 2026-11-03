import type { RuntimeObservationRequest } from "./protocol.js";

export interface RuntimePresentationNode {
  relation: "self" | "ancestor" | "descendant";
  depth: number;
  tag: string;
  classes: string[];
  slot?: string;
  sidebarMode?: string;
  state?: "expanded" | "collapsed" | "open" | "closed";
  expanded?: boolean;
  side?: "left" | "right" | "top" | "bottom";
  rect: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
}
export interface RuntimePresentation {
  status: "available" | "unavailable";
  reason?: string;
  truncated: boolean;
  regions: { kind: "layout" | "instance"; id: string; nodes: RuntimePresentationNode[]; truncated: boolean }[];
}
const styleKeys = ["display", "position", "width", "minWidth", "maxWidth", "height", "flexDirection", "flexWrap", "flexBasis", "flexGrow", "flexShrink", "gridTemplateColumns", "overflowX", "overflowY", "borderRadius", "borderColor", "backgroundColor", "color", "boxShadow"] as const;

/** Dev-only structural facts inside the published Agent root. No text, values,
 * arbitrary attributes, selectors from the Agent, stylesheet URLs or scripts. */
export function collectRuntimePresentation(root: HTMLElement | undefined, composition: any, request: RuntimeObservationRequest): RuntimePresentation {
  const result: RuntimePresentation = { status: "available", truncated: false, regions: [] };
  if (!root?.isConnected) return { ...result, status: "unavailable", reason: "current_preview_root_missing" };
  const read = (element: HTMLElement, relation: RuntimePresentationNode["relation"], depth: number): RuntimePresentationNode | undefined => {
    const rect = element.getBoundingClientRect(), computed = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (!computed || ![rect.x, rect.y, rect.width, rect.height].every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000)) return undefined;
    return { relation, depth, tag: element.tagName.toLowerCase(),
      classes: [...element.classList].filter(name => /^[a-zA-Z0-9_-]{1,80}$/u.test(name)).slice(0, 16),
      ...(element.dataset.slot && /^[a-zA-Z0-9_-]{1,100}$/u.test(element.dataset.slot) ? { slot: element.dataset.slot } : {}),
      ...(["drawer", "inline"].includes(element.dataset.sidebarMode ?? "") ? { sidebarMode: element.dataset.sidebarMode! } : {}),
      ...(["expanded", "collapsed", "open", "closed"].includes(element.dataset.state ?? "") ? { state: element.dataset.state as NonNullable<RuntimePresentationNode["state"]> } : {}),
      ...(["true", "false"].includes(element.getAttribute("aria-expanded") ?? "") ? { expanded: element.getAttribute("aria-expanded") === "true" } : {}),
      ...(["left", "right", "top", "bottom"].includes(element.dataset.side ?? "") ? { side: element.dataset.side as NonNullable<RuntimePresentationNode["side"]> } : {}),
      rect: Object.fromEntries(["x", "y", "width", "height"].map(key => [key, Math.round(rect[key as keyof DOMRect] as number * 10) / 10])) as RuntimePresentationNode["rect"],
      styles: { ...Object.fromEntries(styleKeys.map(key => [key, computed[key].slice(0, 160)])),
        sidebarWidth: computed.getPropertyValue("--sidebar-width").slice(0, 160), sidebarIconWidth: computed.getPropertyValue("--sidebar-width-icon").slice(0, 160) },
    };
  };
  const candidates: { kind: "layout" | "instance"; id: string; attribute: string }[] = [
    ...(composition.layoutNodes ?? []).filter((item: any) => request.nodeIds?.length ? request.nodeIds.includes(item.nodeId) : !request.instanceIds?.length).map((item: any) => ({ kind: "layout", id: item.nodeId, attribute: "data-layout-node-id" })),
    ...(composition.instances ?? []).filter((item: any) => request.instanceIds?.includes(item.instanceId)).map((item: any) => ({ kind: "instance", id: item.instanceId, attribute: "data-plugin-instance-id" })),
  ];
  // An unfiltered request starts with the root region. Subsequent semantic
  // filters can inspect another region without granting arbitrary DOM access.
  if (!request.nodeIds?.length && !request.instanceIds?.length) candidates.splice(1);
  let budget = 18_000;
  for (const candidate of candidates) {
    if (result.regions.length >= 6 || budget < 1500) { result.truncated = true; break; }
    const elements = [root, ...root.querySelectorAll<HTMLElement>("[data-layout-node-id],[data-plugin-instance-id]")];
    const element = elements.find(item => item.getAttribute(candidate.attribute) === candidate.id);
    if (!element) continue;
    const region: RuntimePresentation["regions"][number] = { kind: candidate.kind, id: candidate.id, nodes: [], truncated: false };
    const append = (node: HTMLElement, relation: RuntimePresentationNode["relation"], depth: number) => {
      const value = read(node, relation, depth); if (!value) return;
      const size = JSON.stringify(value).length;
      if (size > budget || region.nodes.length >= 24) { region.truncated = result.truncated = true; return; }
      region.nodes.push(value); budget -= size;
    };
    append(element, "self", 0);
    for (let ancestor = element.parentElement, depth = 1; ancestor && root.contains(ancestor) && depth <= 4; ancestor = ancestor.parentElement, depth++) append(ancestor, "ancestor", depth);
    let visited = 0;
    const descend = (node: Element, depth: number) => {
      for (const child of node.children) {
        if (++visited > 120 || region.nodes.length >= 24 || budget < 1000) { region.truncated = result.truncated = true; return; }
        if (!(child instanceof HTMLElement)) continue;
        if (child.hasAttribute("data-slot") || child.hasAttribute("data-layout-node-id") || [...child.classList].some(name => name.startsWith("agent-ui-"))) append(child, "descendant", depth);
        if (depth < 7) descend(child, depth + 1);
      }
    };
    descend(element, 1);
    result.regions.push(region);
  }
  if (!result.regions.length) { result.status = "unavailable"; result.reason = "semantic_region_not_observed"; }
  return result;
}
