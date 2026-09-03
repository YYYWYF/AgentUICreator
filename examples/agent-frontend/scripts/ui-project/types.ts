import type {
  LayoutSize,
  PluginInstance,
  UISlot,
} from "../../framework/contracts/app-ui-model";

export interface ProjectIssue {
  code: string;
  message: string;
}

export interface UIProjectControlConfig {
  catalogs: readonly string[];
  nonPluginDirectories?: readonly string[] | undefined;
  uiPackages: readonly string[];
}

export interface PluginAsset {
  pluginId: string;
  directory: string;
  manifestPath: string;
  definitionPath: string;
  capabilities: string[];
}

export interface PluginAssetInventory {
  assets: PluginAsset[];
  errors: ProjectIssue[];
}

export interface GeneratePluginRegistryResult {
  source: string;
  selectedPluginIds: string[];
  registeredPluginIds: string[];
  headlessPluginIds: string[];
  assets: PluginAsset[];
  errors: ProjectIssue[];
}

export interface CompactLayoutNode {
  id: string;
  type: "row" | "column" | "stack" | "panel" | "slot";
  gap?: number | undefined;
  sizes?: LayoutSize[] | undefined;
  active?: string | undefined;
  width?: LayoutSize | undefined;
  height?: LayoutSize | undefined;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  resizable?: boolean | undefined;
  slotId?: string | undefined;
  children?: CompactLayoutNode[] | undefined;
  child?: CompactLayoutNode | undefined;
}

export interface InspectedSlot {
  slotId: string;
  kind: UISlot["kind"];
  scope: UISlot["scope"];
  description: string;
  owner: UISlot["owner"];
  declarer:
    | { type: "layout"; nodeId: string }
    | { type: "plugin"; pluginId: string; instanceId: string; outlet: string };
  declarationStatus: "layout" | "verified" | "missing" | "mismatch" | "invalid";
  declarationSource?: string | undefined;
  ownerProps: NonNullable<UISlot["ownerProps"]>;
  fallback: NonNullable<UISlot["fallback"]>;
  occupants: Array<
    UISlot["occupants"][number] & { pluginId: string; enabled: boolean }
  >;
  parentSlotId?: string | undefined;
  childSlotIds: string[];
  nodeId?: string | undefined;
  nodePath?: string | undefined;
  replaceRisk:
    | "none"
    | "replaces-owner-fallback"
    | "replaces-occupant"
    | "changes-chain-resolution"
    | "removes-descendant-slots";
}

export interface InspectedPluginInstance extends PluginInstance {
  mountedSlotId?: string | undefined;
}

export interface UIProjectInspection {
  schemaVersion: 2;
  appUIModel: {
    hash: string;
    version: string;
    layout: CompactLayoutNode;
    slots: InspectedSlot[];
  };
  pluginInstances: InspectedPluginInstance[];
  registry: {
    selectedPluginIds: string[];
    registeredPluginIds: string[];
    generatedFileFresh: boolean;
    issues: ProjectIssue[];
  };
  pluginAssets: Array<
    PluginAsset & {
      selected: boolean;
    }
  >;
  catalogs: Array<{
    path: string;
    exists: boolean;
  }>;
  uiStack: Array<{
    packageName: string;
    version: string;
  }>;
}
