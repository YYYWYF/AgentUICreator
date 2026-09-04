import type {
  LayoutSize,
  PluginInstance,
} from "../../framework/contracts/app-ui-model";
import type { PluginSlotCatalog } from "../../framework/contracts/app-ui-composition";

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
  name?: string | undefined;
  directory: string;
  manifestPath: string;
  definitionPath: string;
  capabilities: string[];
  childSlots?: string[] | undefined;
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
  slotCatalog: PluginSlotCatalog;
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
  nodeId: string;
  nodePath: string;
  /** Configured mounts only; activation determines runtime contributions. */
  mounts: Array<{
    instanceId: string;
    pluginId: string;
    enabled: boolean;
    order?: number | undefined;
  }>;
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
