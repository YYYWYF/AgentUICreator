import type {
  AppUILayoutSize,
  AppUIPluginNode,
} from "../../framework/contracts/app-ui-model";
import type { AgentUIMode } from "../../framework/contracts/agent-ui-mode";
import type { PluginChildSlotDefinition, PluginCompositionCatalog, PluginSlotCatalog } from "../../framework/contracts/app-ui-composition";
import type { UIPluginManifest } from "../../framework/contracts/ui-plugin";
import type { APP_UI_MUTATION_ADMISSION_GUARANTEES } from "./app-ui-transaction";
import type { CreatorActionCandidate } from "./creator-action-catalog";
import type { AnalyzedDeclarations } from "./service-dependency-inspector";

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
  manifest: UIPluginManifest;
  name: string;
  description: string;
  directory: string;
  manifestPath: string;
  definitionPath: string;
  capabilities: string[];
  authoring?: NonNullable<UIPluginManifest["authoring"]> | undefined;
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

/**
 * The expensive, request-scoped facts observed from a generated UI project.
 *
 * Registry generation and Creator Action simulation must only consume these
 * facts. They must not rediscover project files for each candidate.
 */
export interface PluginProjectFacts {
  assets: PluginAsset[];
  inventoryIssues: ProjectIssue[];
  declarations: AnalyzedDeclarations;
  definitionIssuesByPath: ReadonlyMap<string, readonly ProjectIssue[]>;
}

export interface GeneratePluginCatalogResult {
  capabilityCatalog: {
    source: string;
    revision: string;
    pluginIds: string[];
  };
  activeComposition: {
    selectedPluginIds: string[];
    resolvedPluginIds: string[];
    headlessPluginIds: string[];
    slotCatalog: PluginSlotCatalog;
    compositionCatalog: PluginCompositionCatalog;
  };
  assets: PluginAsset[];
  serviceDependencies: UIServiceDependencyInspection;
  errors: ProjectIssue[];
}

export interface CompactLayoutNode {
  nodeRef: string;
  type: "row" | "column" | "stack" | "panel" | "slot";
  gap?: number | undefined;
  sizes?: AppUILayoutSize[] | undefined;
  activeIndex?: number | undefined;
  width?: AppUILayoutSize | undefined;
  height?: AppUILayoutSize | undefined;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  resizable?: boolean | undefined;
  plugins?: AppUIPluginNode[] | undefined;
  children?: CompactLayoutNode[] | undefined;
  child?: CompactLayoutNode | undefined;
}

export interface InspectedLayoutSlot {
  target: { type: "layout_slot"; slotRef: string };
  nodeRef: string;
  plugins: AppUIPluginNode[];
}

export interface InspectedPluginSlot {
  target: { type: "plugin_slot"; parentInstanceId: string; slot: string };
  description: string;
  cardinality: "one" | "many";
  optional: boolean;
  accepts?: PluginChildSlotDefinition["accepts"];
  owner: {
    kind: "plugin";
    instanceId: string;
    pluginId: string;
  };
  plugins: AppUIPluginNode[];
}

export type InspectedSlot = InspectedLayoutSlot | InspectedPluginSlot;

export interface InspectedPlugin extends AppUIPluginNode {
  target:
    | { type: "application" }
    | { type: "layout_slot"; slotRef: string }
    | { type: "plugin_slot"; parentInstanceId: string; slot: string };
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
  capabilityCatalog: {
    revision: string;
    pluginIds: string[];
    generatedFileFresh: boolean;
  };
  activeComposition: {
    selectedPluginIds: string[];
    resolvedPluginIds: string[];
    headlessPluginIds: string[];
  };
  issues: ProjectIssue[];
  pluginAssets: Array<
    Omit<PluginAsset, "manifest"> & {
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

export type CompositionObservationCoverage =
  | "composition.model"
  | "composition.layout"
  | "composition.slots"
  | "composition.instances"
  | "capability.inventory"
  | "capability.composition-summary";

export interface CompositionPluginCapabilitySummary {
  pluginId: string;
  name: string;
  description: string;
  capabilities: string[];
  selected: boolean;
  currentInstances: Array<{
    instanceId: string;
    enabled: boolean;
    target: InspectedPlugin["target"];
    index: number;
  }>;
  selectionOwner: "composition";
  authoring?: NonNullable<UIPluginManifest["authoring"]> | undefined;
  requiredServices: {
    names: string[];
    status: "unknown" | "not-required" | "resolved" | "unresolved";
    missing: string[];
  };
  optionalServices: {
    names: string[];
    available: string[];
  };
  layoutWidth?: "narrow" | "wide" | undefined;
  childSlots?: Record<string, PluginChildSlotDefinition> | undefined;
}

export interface UICompositionInspection {
  schemaVersion: 3;
  view: "composition";
  observationCoverage: CompositionObservationCoverage[];
  appUIModel: {
    hash: string;
    layout: CompactLayoutNode;
    slots: InspectedSlot[];
  };
  pluginInstances: InspectedPlugin[];
  capabilitySummaries: CompositionPluginCapabilitySummary[];
  activeComposition: {
    selectedPluginIds: string[];
    resolvedPluginIds: string[];
    headlessPluginIds: string[];
  };
  capabilityCatalogRevision: string;
  creatorActions: {
    revision: string;
    candidates: CreatorActionCandidate[];
  };
  layoutConstraints: {
    refs: "snapshot-scoped";
    pluginTargets: ["application", "layout_slot", "plugin_slot"];
    sizedContainerInsertion: {
      rule: "size-required";
      operations: ["insert_layout_node", "move_layout_node", "insert_layout_relative"];
    };
    relativeWrapperSizing: {
      rule: "size-and-anchorSize-together";
      operation: "insert_layout_relative";
    };
    operationApplication: "sequential-atomic";
  };
  hostGuarantees: {
    mutation: "mutate_app_ui_model";
    admission: "deterministic-atomic";
    checks: typeof APP_UI_MUTATION_ADMISSION_GUARANTEES;
    commit: "all-or-nothing";
    postCommitVerificationRequired: true;
    guidance: string;
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
