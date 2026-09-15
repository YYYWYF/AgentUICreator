import type {
  AppUILayoutSize,
  AppUIPluginNode,
} from "../../framework/contracts/app-ui-model";
import type { AgentUIMode } from "../../framework/contracts/agent-ui-mode";
import type { PluginChildSlotDefinition, PluginCompositionCatalog, PluginSlotCatalog } from "../../framework/contracts/app-ui-composition";

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
  name: string;
  description: string;
  directory: string;
  manifestPath: string;
  definitionPath: string;
  capabilities: string[];
  layoutWidth?: "narrow" | "wide" | undefined;
  applicationGate?: {
    service: string;
    priority: number;
  } | undefined;
  childSlots?: Record<string, PluginChildSlotDefinition> | undefined;
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
  compositionCatalog: PluginCompositionCatalog;
  assets: PluginAsset[];
  errors: ProjectIssue[];
}

export interface CompactLayoutNode {
  id: string;
  type: "row" | "column" | "stack" | "panel" | "slot";
  gap?: number | undefined;
  sizes?: AppUILayoutSize[] | undefined;
  active?: string | undefined;
  width?: AppUILayoutSize | undefined;
  height?: AppUILayoutSize | undefined;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  resizable?: boolean | undefined;
  description?: string | undefined;
  plugins?: AppUIPluginNode[] | undefined;
  children?: CompactLayoutNode[] | undefined;
  child?: CompactLayoutNode | undefined;
}

export interface InspectedSlot {
  target:
    | { type: "layout_slot"; slotNodeId: string }
    | { type: "plugin_slot"; parentInstanceId: string; slot: string };
  description: string;
  cardinality: "one" | "many";
  optional: boolean;
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
  nodePath?: string | undefined;
  plugins: AppUIPluginNode[];
}

export interface InspectedPlugin extends AppUIPluginNode {
  target:
    | { type: "application" }
    | { type: "layout_slot"; slotNodeId: string }
    | { type: "plugin_slot"; parentInstanceId: string; slot: string };
  path: string;
  index: number;
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
    layout: CompactLayoutNode;
    slots: InspectedSlot[];
  };
  plugins: InspectedPlugin[];
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
