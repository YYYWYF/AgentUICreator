import type {
  RuntimeCompositionViewport,
  RuntimeLayoutNodeObservation,
  RuntimeRect,
} from "./types";

export const MAX_RUNTIME_LAYOUT_NODES = 200;
export const MAX_RUNTIME_GEOMETRY_COORDINATE = 1_000_000;

const RUNTIME_GEOMETRY_PRECISION = 10;
const LAYOUT_NODE_TYPES = new Set<RuntimeLayoutNodeObservation["type"]>([
  "row",
  "column",
  "panel",
  "stack",
  "slot",
]);

export interface RuntimeLayoutGeometry {
  viewport?: RuntimeCompositionViewport | undefined;
  layoutNodes: RuntimeLayoutNodeObservation[];
  instanceRects: ReadonlyMap<string, RuntimeRect>;
  slotRects: ReadonlyMap<string, RuntimeRect>;
}

function roundCoordinate(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (
    value < -MAX_RUNTIME_GEOMETRY_COORDINATE ||
    value > MAX_RUNTIME_GEOMETRY_COORDINATE
  ) {
    return undefined;
  }
  return Math.round(value * RUNTIME_GEOMETRY_PRECISION) /
    RUNTIME_GEOMETRY_PRECISION;
}

function roundDimension(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (value < 0 || value > MAX_RUNTIME_GEOMETRY_COORDINATE) {
    return undefined;
  }
  return Math.round(value * RUNTIME_GEOMETRY_PRECISION) /
    RUNTIME_GEOMETRY_PRECISION;
}

export function readRuntimeRect(
  element: Pick<Element, "getBoundingClientRect">,
): RuntimeRect | undefined {
  try {
    const rect = element.getBoundingClientRect();
    const x = roundCoordinate(rect.x);
    const y = roundCoordinate(rect.y);
    const width = roundDimension(rect.width);
    const height = roundDimension(rect.height);
    if (x === undefined || y === undefined || width === undefined || height === undefined) {
      return undefined;
    }
    return { x, y, width, height };
  } catch {
    return undefined;
  }
}

function readViewport(
  documentRef: Document,
): RuntimeCompositionViewport | undefined {
  const windowWidth =
    typeof window === "undefined" ? undefined : window.innerWidth;
  const windowHeight =
    typeof window === "undefined" ? undefined : window.innerHeight;
  const documentWidth = documentRef.documentElement?.clientWidth;
  const documentHeight = documentRef.documentElement?.clientHeight;
  const width = roundDimension(windowWidth ?? documentWidth ?? Number.NaN);
  const height = roundDimension(windowHeight ?? documentHeight ?? Number.NaN);
  if (width === undefined || height === undefined) return undefined;
  return { width, height };
}

function readRowTrackWidths(element: HTMLElement): number[] | undefined {
  try {
    const value = element.ownerDocument.defaultView?.getComputedStyle(element).gridTemplateColumns;
    if (value === undefined || value === "none") return undefined;
    const tokens = value.trim().split(/\s+/u);
    if (tokens.length === 0 || tokens.length > MAX_RUNTIME_LAYOUT_NODES) return undefined;
    const widths = tokens.map((token) =>
      /^\d+(?:\.\d+)?px$/u.test(token)
        ? roundDimension(Number.parseFloat(token))
        : undefined,
    );
    return widths.every((width): width is number => width !== undefined)
      ? widths
      : undefined;
  } catch {
    return undefined;
  }
}

export function collectRuntimeLayoutGeometry(
  documentRef: Document | undefined =
    typeof document === "undefined" ? undefined : document,
): RuntimeLayoutGeometry {
  if (documentRef === undefined) {
    return {
      layoutNodes: [],
      instanceRects: new Map(),
      slotRects: new Map(),
    };
  }

  const layoutNodes: RuntimeLayoutNodeObservation[] = [];
  const seenLayoutNodeIds = new Set<string>();
  for (const element of documentRef.querySelectorAll<HTMLElement>(
    "[data-layout-node-id]",
  )) {
    if (layoutNodes.length >= MAX_RUNTIME_LAYOUT_NODES) break;
    const nodeId = element.getAttribute("data-layout-node-id");
    const type = element.getAttribute("data-layout-type");
    if (
      nodeId === null ||
      nodeId.length === 0 ||
      nodeId.length > 200 ||
      type === null ||
      !LAYOUT_NODE_TYPES.has(type as RuntimeLayoutNodeObservation["type"]) ||
      seenLayoutNodeIds.has(nodeId)
    ) {
      continue;
    }
    const rect = readRuntimeRect(element);
    if (rect === undefined) continue;
    seenLayoutNodeIds.add(nodeId);
    const trackWidths = type === "row" ? readRowTrackWidths(element) : undefined;
    layoutNodes.push({
      nodeId,
      type: type as RuntimeLayoutNodeObservation["type"],
      rect,
      ...(trackWidths === undefined ? {} : { trackWidths }),
    });
  }

  const instanceRects = new Map<string, RuntimeRect>();
  for (const element of documentRef.querySelectorAll<HTMLElement>(
    "[data-plugin-instance-id]",
  )) {
    const instanceId = element.getAttribute("data-plugin-instance-id");
    if (
      instanceId === null ||
      instanceId.length === 0 ||
      instanceId.length > 200 ||
      instanceRects.has(instanceId)
    ) {
      continue;
    }
    const rect = readRuntimeRect(element);
    if (rect !== undefined) instanceRects.set(instanceId, rect);
  }

  const slotElements = new Map<
    string,
    { element: HTMLElement; isLayoutNode: boolean }
  >();
  for (const element of documentRef.querySelectorAll<HTMLElement>(
    "[data-slot-id]",
  )) {
    const slotId = element.getAttribute("data-slot-id");
    if (slotId === null || slotId.length === 0 || slotId.length > 200) {
      continue;
    }
    const isLayoutNode = element.hasAttribute("data-layout-node-id");
    const existing = slotElements.get(slotId);
    if (existing === undefined || (isLayoutNode && !existing.isLayoutNode)) {
      slotElements.set(slotId, { element, isLayoutNode });
    }
  }
  const slotRects = new Map<string, RuntimeRect>();
  for (const [slotId, { element }] of slotElements) {
    const rect = readRuntimeRect(element);
    if (rect !== undefined) slotRects.set(slotId, rect);
  }

  return {
    viewport: readViewport(documentRef),
    layoutNodes,
    instanceRects,
    slotRects,
  };
}
