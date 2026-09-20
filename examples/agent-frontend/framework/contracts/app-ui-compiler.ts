import {
  collectAppUIPluginLocations,
  parseAppUIModel,
  walkAppUILayout,
  type AppUILayoutNode,
  type AppUIModel,
  type AppUIPluginNode,
} from "./app-ui-model";
import {
  parseAppUIRuntimeModel,
  type AppUIRuntimeModel,
  type AppUIRuntimePluginInstance,
  type RuntimeLayoutNode,
} from "./app-ui-runtime-model";
import {
  resolveRuntimeLayoutNodeId,
  resolveRuntimeLayoutSlotId,
  resolveRuntimePluginSlotId,
  pluginChildSlotDefinitions,
  validateAppUIComposition,
  type PluginCompositionCatalog,
  type PluginCompositionCatalogEntry,
} from "./app-ui-composition";

export type AppUICompilerIssueCode =
  | "plugin-not-found"
  | "plugin-slot-not-declared"
  | "plugin-slot-cardinality"
  | "plugin-slot-required"
  | "plugin-slot-capability-mismatch"
  | "renderer-slot-cardinality"
  | "renderer-plugin-outside-renderer-slot"
  | "application-plugin-must-be-headless"
  | "headless-plugin-must-be-application";

export interface AppUICompilerIssue {
  readonly code: AppUICompilerIssueCode;
  readonly message: string;
  readonly instanceId: string;
  readonly pluginId: string;
  readonly path: string;
  readonly slot?: string | undefined;
}

export class AppUICompilerError extends Error {
  readonly issues: readonly AppUICompilerIssue[];

  constructor(issues: readonly AppUICompilerIssue[]) {
    super(issues.map((issue) => issue.message).join("\n"));
    this.name = "AppUICompilerError";
    this.issues = Object.freeze([...issues]);
  }
}

function compileLayout(
  node: AppUILayoutNode,
  paths: WeakMap<object, string>,
): RuntimeLayoutNode {
  const path = paths.get(node);
  if (path === undefined) {
    throw new Error("Layout node is missing from the canonical AppUI traversal.");
  }
  if (node.type === "slot") {
    return {
      type: "slot",
      id: resolveRuntimeLayoutNodeId(path),
      slotId: resolveRuntimeLayoutSlotId(path),
    };
  }
  if (node.type === "panel") {
    return {
      type: "panel",
      id: resolveRuntimeLayoutNodeId(path),
      ...(node.width === undefined ? {} : { width: node.width }),
      ...(node.height === undefined ? {} : { height: node.height }),
      ...(node.minWidth === undefined ? {} : { minWidth: node.minWidth }),
      ...(node.maxWidth === undefined ? {} : { maxWidth: node.maxWidth }),
      ...(node.resizable === undefined ? {} : { resizable: node.resizable }),
      child: compileLayout(node.child, paths),
    };
  }
  const children = node.children.map((child) =>
    compileLayout(child, paths),
  );
  if (node.type === "stack") {
    return {
      type: "stack",
      id: resolveRuntimeLayoutNodeId(path),
      children,
      ...(node.activeIndex === undefined
        ? {}
        : { active: children[node.activeIndex]!.id }),
    };
  }
  return {
    type: node.type,
    id: resolveRuntimeLayoutNodeId(path),
    children,
    ...(node.gap === undefined ? {} : { gap: node.gap }),
    ...(node.sizes === undefined ? {} : { sizes: [...node.sizes] }),
  };
}

/**
 * Deterministically lowers the editable AppUIModel into the Runtime-only IR.
 * No runtime consumer may infer mounts directly from the authoring tree.
 */
export function compileAppUIModel(
  input: AppUIModel,
  pluginCatalog: PluginCompositionCatalog,
): AppUIRuntimeModel {
  const model = parseAppUIModel(input);
  const issues: AppUICompilerIssue[] = [];
  const pluginInstances: Record<string, AppUIRuntimePluginInstance> = {};
  const locations = new Map(
    collectAppUIPluginLocations(model).map((location) => [location.plugin.id, location]),
  );
  const layoutPaths = new WeakMap<object, string>();
  for (const entry of walkAppUILayout(model.root)) {
    layoutPaths.set(entry.node, entry.path);
  }

  const compilePlugin = (
    plugin: AppUIPluginNode,
    path: string,
    mount?: { slotId: string; order: number },
    slotMode: "content" | "renderer" = "content",
  ): void => {
    const entry: PluginCompositionCatalogEntry | undefined =
      pluginCatalog[plugin.pluginId];
    if (entry === undefined && slotMode !== "renderer") {
      issues.push({
        code: "plugin-not-found",
        instanceId: plugin.id,
        pluginId: plugin.pluginId,
        path,
        message: `Plugin instance "${plugin.id}" references unknown plugin "${plugin.pluginId}".`,
      });
    }
    if (entry?.requiresRenderScope === true && slotMode !== "renderer") {
      issues.push({
        code: "renderer-plugin-outside-renderer-slot",
        instanceId: plugin.id,
        pluginId: plugin.pluginId,
        path,
        message: `Renderer plugin "${plugin.pluginId}" requires a renderer Slot.`,
      });
    }
    const isApplication = mount === undefined;
    const isHeadless =
      entry?.capabilities?.includes("headless") === true ||
      entry?.applicationGate !== undefined;
    if (isApplication && entry !== undefined && !isHeadless) {
      issues.push({
        code: "application-plugin-must-be-headless",
        instanceId: plugin.id,
        pluginId: plugin.pluginId,
        path,
        message: `Application plugin instance "${plugin.id}" must be headless or an Application Gate.`,
      });
    }
    if (!isApplication && isHeadless) {
      issues.push({
        code: "headless-plugin-must-be-application",
        instanceId: plugin.id,
        pluginId: plugin.pluginId,
        path,
        message: `Headless plugin instance "${plugin.id}" must be declared in applicationPlugins.`,
      });
    }

    pluginInstances[plugin.id] = {
      id: plugin.id,
      pluginId: plugin.pluginId,
      enabled: plugin.enabled,
      ...(mount === undefined ? {} : { mount }),
    };

    const declaredSlots = pluginChildSlotDefinitions(pluginCatalog, plugin.pluginId);
    for (const slot of Object.keys(plugin.slots ?? {}).sort()) {
      if (declaredSlots[slot] === undefined) {
        issues.push({
          code: "plugin-slot-not-declared",
          instanceId: plugin.id,
          pluginId: plugin.pluginId,
          path: `${path}.slots.${slot}`,
          slot,
          message: `Plugin instance "${plugin.id}" uses undeclared local child Slot "${slot}".`,
        });
      }
    }
    for (const [slot, definition] of Object.entries(declaredSlots).sort(([left], [right]) => left.localeCompare(right))) {
      const children = plugin.slots?.[slot] ?? [];
      if (children.length === 0 && definition.optional !== true) {
        issues.push({
          code: "plugin-slot-required",
          instanceId: plugin.id,
          pluginId: plugin.pluginId,
          path: `${path}.slots.${slot}`,
          slot,
          message: `Plugin instance "${plugin.id}" requires content in child Slot "${slot}".`,
        });
      }
      if (definition.cardinality === "one" && children.length > 1) {
        issues.push({
          code: "plugin-slot-cardinality",
          instanceId: plugin.id,
          pluginId: plugin.pluginId,
          path: `${path}.slots.${slot}`,
          slot,
          message: `Plugin instance "${plugin.id}" child Slot "${slot}" accepts at most one plugin.`,
        });
      }
      if (definition.mode === "renderer" && definition.cardinality !== "one") {
        issues.push({
          code: "renderer-slot-cardinality",
          instanceId: plugin.id,
          pluginId: plugin.pluginId,
          path: `${path}.slots.${slot}`,
          slot,
          message: `Renderer Slot "${slot}" must accept exactly one plugin at most.`,
        });
      }
      for (const [index, child] of children.entries()) {
        const accepted = definition.accepts?.anyOfCapabilities;
        const childEntry = pluginCatalog[child.pluginId];
        const capabilities = childEntry?.capabilities ?? [];
        if (accepted !== undefined &&
            !(definition.mode === "renderer" && definition.optional === true && childEntry === undefined) &&
            !capabilities.some((capability) => accepted.includes(capability))) {
          issues.push({
            code: "plugin-slot-capability-mismatch",
            instanceId: child.id,
            pluginId: child.pluginId,
            path: `${path}.slots.${slot}[${index}]`,
            slot,
            message: `Plugin "${child.pluginId}" does not provide a capability accepted by Slot "${slot}".`,
          });
        }
      }
      const runtimeSlotId = resolveRuntimePluginSlotId(plugin.id, slot);
      children.forEach((child, index) =>
        compilePlugin(child, `${path}.slots.${slot}[${index}]`, {
          slotId: runtimeSlotId,
          order: index,
        }, definition.mode ?? "content"),
      );
    }
  };

  for (const location of locations.values()) {
    if (location.target.type === "application") {
      compilePlugin(location.plugin, location.path);
    } else if (location.target.type === "layout_slot") {
      compilePlugin(location.plugin, location.path, {
        slotId: resolveRuntimeLayoutSlotId(location.target.slotPath),
        order: location.index,
      });
    }
  }

  if (issues.length > 0) throw new AppUICompilerError(issues);

  const runtimeModel = parseAppUIRuntimeModel({
    root: compileLayout(model.root, layoutPaths),
    pluginInstances,
  });
  validateAppUIComposition(runtimeModel, pluginCatalog);
  return runtimeModel;
}
