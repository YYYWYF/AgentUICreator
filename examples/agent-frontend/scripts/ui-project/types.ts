import type {
  LayoutSize,
  PluginInstance,
} from "../../framework/contracts/app-ui-model";
import type { AgentUIMode } from "../../framework/contracts/agent-ui-mode";
import type { PluginSlotCatalog } from "../../framework/contracts/app-ui-composition";

export interface ProjectIssue {
  code: string;
  message: string;
  pluginId?: string | undefined;
  property?: "provides" | "inject" | "optionalInject" | undefined;
  service?: string | undefined;
  providerInstances?: string[] | undefined;
  missingRequiredServices?: string[] | undefined;
}

export interface PluginServiceDeclaration {
  pluginId: string;
  provides: string[];
  inject: string[];
  optionalInject: string[];
}

export interface InspectedServiceInstance {
  instanceId: string;
  enabled: boolean;
  activeCandidate: boolean;
  resolved: boolean;
  missingRequiredServices: string[];
}

export interface InspectedServicePlugin {
  pluginId: string;
  selected: boolean;
  instances: InspectedServiceInstance[];
}

export interface InspectedService {
  name: string;
  contractPaths: string[];
  status:
    | "available"
    | "inactive"
    | "required-missing"
    | "optional-unavailable"
    | "provider-collision"
    | "dependency-blocked";
  providers: InspectedServicePlugin[];
  requiredConsumers: InspectedServicePlugin[];
  optionalConsumers: InspectedServicePlugin[];
}

export interface UIServiceDependencyInspection {
  services: InspectedService[];
  plugins: PluginServiceDeclaration[];
  issues: ProjectIssue[];
}

export interface UIProjectControlConfig {
  catalogs: readonly string[];
  nonPluginDirectories?: readonly string[] | undefined;
  uiPackages: readonly string[];
  agentUI: {
    sourceRoot: string;
    metadataRoot: string;
  };
}

export interface PluginAsset {
  pluginId: string;
  name?: string | undefined;
  directory: string;
  manifestPath: string;
  definitionPath: string;
  capabilities: string[];
  layoutWidth?: "narrow" | "wide" | undefined;
  applicationGate?: {
    service: string;
    priority: number;
  } | undefined;
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
  owner:
    | {
        kind: "layout";
        nodeId: string;
        nodePath: string;
      }
    | {
        kind: "plugin";
        instanceId: string;
        pluginId: string;
      };
  nodeId?: string | undefined;
  nodePath?: string | undefined;
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
  schemaVersion: 3;
  mode: AgentUIMode;
  modeResolution: {
    legacy: boolean;
    configPath: string;
  };
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
  agentUI: {
    stateHash: string;
    sourceRoot: string;
    metadataRoot: string;
    managedItems: number;
    customizedItems: number;
    issues: AgentUISourceIssue[];
  };
}

export type AgentUISourceStatus =
  | "not-installed"
  | "managed"
  | "customized"
  | "partial"
  | "blocked";

export interface AgentUISourceIssue {
  code: string;
  message: string;
  itemId?: string;
  path?: string;
  packageName?: string;
}

export interface AgentUISourceFileInspection {
  path: string;
  status: AgentUISourceStatus;
  currentSha256?: string;
  managedSha256?: string;
}

export interface AgentUISourceItemInspection {
  id: string;
  installedVersion?: string;
  availableVersion: string;
  status: AgentUISourceStatus;
  files: AgentUISourceFileInspection[];
  requirements: AgentUISourcePackageInspection[];
  issues: AgentUISourceIssue[];
}

export interface AgentUISourcePackageInspection {
  name: string;
  required: string;
  declared?: string;
  installed?: string;
  compatible: boolean;
}

export interface AgentUISourceInspection {
  stateHash: string;
  sourceRoot: string;
  metadataRoot: string;
  items: AgentUISourceItemInspection[];
  packages: AgentUISourcePackageInspection[];
  issues: AgentUISourceIssue[];
}
