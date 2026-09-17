// @vitest-environment jsdom

import { createElement, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import {
  collectRuntimeLayoutGeometry,
  MAX_RUNTIME_LAYOUT_NODES,
  PluginDiagnosticProvider,
  useOptionalPluginDiagnosticContext,
  type RuntimeRect,
} from "../runtime/diagnostics";
import { createPluginRegistry } from "../runtime/plugins";

function stubRect(element: Element, rect: RuntimeRect): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}

function createMarker(
  attributes: Record<string, string>,
  rect: RuntimeRect,
): HTMLDivElement {
  const element = document.createElement("div");
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  stubRect(element, rect);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Runtime layout observation", () => {
  it("collects bounded layout, instance, slot, and viewport rectangles from existing markers", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });

    const row = createMarker(
      {
        "data-layout-node-id": "root-row",
        "data-layout-type": "row",
      },
      { x: 0, y: 0, width: 1400, height: 800 },
    );
    const panel = createMarker(
      {
        "data-layout-node-id": "sidebar-panel",
        "data-layout-type": "panel",
      },
      { x: 0, y: 0, width: 280, height: 800 },
    );
    const slot = createMarker(
      {
        "data-layout-node-id": "sidebar-slot-node",
        "data-layout-type": "slot",
        "data-slot-id": "sidebar.slot",
      },
      { x: 0, y: 0, width: 280, height: 800 },
    );
    const plugin = createMarker(
      {
        "data-plugin-instance-id": "sidebar-main",
        "data-plugin-id": "conversation-thread-list",
      },
      { x: 0, y: 0, width: 280, height: 800 },
    );
    const widthProbe = createMarker(
      { "data-slot-id": "sidebar.slot" },
      { x: 0, y: 0, width: 280, height: 800 },
    );
    row.append(panel, slot, plugin, widthProbe);
    document.body.append(row);

    const geometry = collectRuntimeLayoutGeometry();

    expect(geometry.viewport).toEqual({ width: 1400, height: 800 });
    expect(geometry.layoutNodes).toEqual([
      {
        nodeId: "root-row",
        type: "row",
        rect: { x: 0, y: 0, width: 1400, height: 800 },
      },
      {
        nodeId: "sidebar-panel",
        type: "panel",
        rect: { x: 0, y: 0, width: 280, height: 800 },
      },
      {
        nodeId: "sidebar-slot-node",
        type: "slot",
        rect: { x: 0, y: 0, width: 280, height: 800 },
      },
    ]);
    expect(geometry.instanceRects.get("sidebar-main")).toEqual({
      x: 0,
      y: 0,
      width: 280,
      height: 800,
    });
    expect(geometry.slotRects.get("sidebar.slot")).toEqual({
      x: 0,
      y: 0,
      width: 280,
      height: 800,
    });
  });

  it("does not report malformed rectangles and caps layout nodes", () => {
    const invalid = createMarker(
      {
        "data-layout-node-id": "invalid",
        "data-layout-type": "row",
      },
      { x: Number.NaN, y: 0, width: 10, height: 10 },
    );
    document.body.append(invalid);
    for (let index = 0; index < MAX_RUNTIME_LAYOUT_NODES + 5; index += 1) {
      document.body.append(
        createMarker(
          {
            "data-layout-node-id": `node-${index}`,
            "data-layout-type": "row",
          },
          { x: index, y: 0, width: 10, height: 10 },
        ),
      );
    }

    const geometry = collectRuntimeLayoutGeometry();

    expect(geometry.layoutNodes).toHaveLength(MAX_RUNTIME_LAYOUT_NODES);
    expect(geometry.layoutNodes[0]?.nodeId).toBe("node-0");
    expect(geometry.layoutNodes.some((node) => node.nodeId === "invalid")).toBe(
      false,
    );
  });

  it("captures the equal-track regression and the explicit fixed-sidebar correction", () => {
    const createRowFixture = (surfaceX: number) => {
      const row = createMarker(
        {
          "data-layout-node-id": "root-row",
          "data-layout-type": "row",
        },
        { x: 0, y: 0, width: 1400, height: 800 },
      );
      const sidebar = createMarker(
        {
          "data-layout-node-id": "sidebar-panel",
          "data-layout-type": "panel",
        },
        { x: 0, y: 0, width: 280, height: 800 },
      );
      const surface = createMarker(
        {
          "data-layout-node-id": "surface-panel",
          "data-layout-type": "panel",
        },
        { x: surfaceX, y: 0, width: 1400 - surfaceX, height: 800 },
      );
      row.append(sidebar, surface);
      document.body.append(row);
      const geometry = collectRuntimeLayoutGeometry();
      const sidebarRect = geometry.layoutNodes.find(
        (node) => node.nodeId === "sidebar-panel",
      )?.rect;
      const surfaceRect = geometry.layoutNodes.find(
        (node) => node.nodeId === "surface-panel",
      )?.rect;
      if (sidebarRect === undefined || surfaceRect === undefined) {
        throw new Error("The deterministic layout fixture is incomplete.");
      }
      return surfaceRect.x - (sidebarRect.x + sidebarRect.width);
    };

    expect(createRowFixture(700)).toBe(420);
    document.body.replaceChildren();
    expect(createRowFixture(280)).toBe(0);
  });

  it("reports geometry on the scheduled frame after React registrations commit", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1400,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    const scheduled: FrameRequestCallback[] = [];
    let nextFrameId = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        scheduled.push(callback);
        nextFrameId += 1;
        return nextFrameId;
      },
    );

    const root = createMarker(
      {
        "data-layout-node-id": "root-slot-node",
        "data-layout-type": "slot",
        "data-slot-id": "root-slot",
      },
      { x: 0, y: 0, width: 280, height: 800 },
    );
    const plugin = createMarker(
      { "data-plugin-instance-id": "sidebar-main" },
      { x: 0, y: 0, width: 280, height: 800 },
    );
    root.append(plugin);
    document.body.append(root);

    const model = parseAppUIRuntimeModel({
      root: {
        type: "slot",
        id: "root-slot-node",
        slotId: "root-slot",
      },
      pluginInstances: {
        "sidebar-main": {
          id: "sidebar-main",
          pluginId: "conversation-thread-list",
          enabled: true,
          mount: { slotId: "root-slot" },
        },
      },
    });
    const snapshots: unknown[] = [];
    let renderer: ReactTestRenderer | undefined;

    function RegistrationProbe() {
      const diagnostics = useOptionalPluginDiagnosticContext();
      useEffect(
        () => diagnostics?.registerMountedInstance({
          instanceId: "sidebar-main",
          pluginId: "conversation-thread-list",
          slotId: "root-slot",
        }),
        [diagnostics],
      );
      useEffect(
        () => diagnostics?.registerObservedSlot({
          slotId: "root-slot",
          widthClass: "narrow",
        }),
        [diagnostics],
      );
      return null;
    }

    await act(async () => {
      renderer = create(
        createElement(
          PluginDiagnosticProvider,
          {
            appUIModelHash: "a".repeat(64),
            model,
            onRuntimeComposition: (snapshot) => snapshots.push(snapshot),
            registry: createPluginRegistry(),
            children: createElement(RegistrationProbe),
          },
        ),
      );
      await Promise.resolve();
    });

    expect(scheduled.length).toBeGreaterThan(0);
    expect(snapshots).toHaveLength(0);

    await act(async () => {
      for (const callback of scheduled.splice(0)) callback(0);
      await Promise.resolve();
    });

    expect(snapshots.at(-1)).toMatchObject({
      viewport: { width: 1400, height: 800 },
      instances: [
        {
          instanceId: "sidebar-main",
          pluginId: "conversation-thread-list",
          rect: { x: 0, y: 0, width: 280, height: 800 },
        },
      ],
      slots: [
        {
          slotId: "root-slot",
          widthClass: "narrow",
          rect: { x: 0, y: 0, width: 280, height: 800 },
        },
      ],
      layoutNodes: [
        {
          nodeId: "root-slot-node",
          type: "slot",
          rect: { x: 0, y: 0, width: 280, height: 800 },
        },
      ],
    });
    renderer?.unmount();
  });
});
