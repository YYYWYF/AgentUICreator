import {
  collectAppUIPluginLocations,
  parseAppUIModel,
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

function compileLayout(node: AppUILayoutNode): RuntimeLayoutNode {
  if (node.type === "slot") {
    return {
      type: "slot",
      id: node.id,
      slotId: resolveRuntimeLayoutSlotId(node.id),
    };
  }
  if (node.type === "panel") {
    return { ...node, child: compileLayout(node.child) };
  }
  return { ...node, children: node.children.map(compileLayout) };
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

  const compilePlugin = (
    plugin: AppUIPluginNode,
    path: string,
    mount?: { slotId: string; order: number },
  ): void => {
    const entry: PluginCompositionCatalogEntry | undefined =
      pluginCatalog[plugin.pluginId];
    if (entry === undefined) {
      issues.push({
        code: "plugin-not-found",
        instanceId: plugin.id,
        pluginId: plugin.pluginId,
        path,
        message: `Plugin instance "${plugin.id}" references unknown plugin "${plugin.pluginId}".`,
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
      ...(plugin.props === undefined ? {} : { props: structuredClone(plugin.props) }),
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
      const runtimeSlotId = resolveRuntimePluginSlotId(plugin.id, slot);
      children.forEach((child, index) =>
        compilePlugin(child, `${path}.slots.${slot}[${index}]`, {
          slotId: runtimeSlotId,
          order: index,
        }),
      );
    }
  };

  for (const location of locations.values()) {
    if (location.target.type === "application") {
      compilePlugin(location.plugin, location.path);
    } else if (location.target.type === "layout_slot") {
      compilePlugin(location.plugin, location.path, {
        slotId: resolveRuntimeLayoutSlotId(location.target.slotNodeId),
        order: location.index,
      });
    }
  }

  if (issues.length > 0) throw new AppUICompilerError(issues);

  const runtimeModel = parseAppUIRuntimeModel({
    root: compileLayout(model.root),
    pluginInstances,
    ...(model.settings === undefined ? {} : { settings: structuredClone(model.settings) }),
  });
  validateAppUIComposition(runtimeModel, pluginCatalog);
  return runtimeModel;
}
