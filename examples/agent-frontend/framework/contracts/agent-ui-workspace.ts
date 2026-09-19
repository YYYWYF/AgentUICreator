import type {
  AppUILayoutNode,
  AppUILayoutSize,
  AppUIRowNode,
} from "./app-ui-model";

/** Stable semantic order for the logical Workspace Regions. */
export const WORKSPACE_REGIONS = [
  "left",
  "center",
  "right",
] as const;

export type WorkspaceRegion = (typeof WORKSPACE_REGIONS)[number];

export interface WorkspaceRegionPolicy {
  readonly required: boolean;
  readonly track: AppUILayoutSize;
}

/** A Mode-owned declaration of the Regions that may be materialized. */
export interface AgentUIWorkspacePolicy {
  readonly regions: Partial<
    Record<WorkspaceRegion, WorkspaceRegionPolicy>
  >;
}

export interface WorkspaceRegionOccupancy {
  readonly region: WorkspaceRegion;
  readonly branch: AppUILayoutNode;
  readonly branchRef: string;
  readonly index: number;
  readonly track: AppUILayoutSize;
}

export interface WorkspaceTopology {
  readonly root: AppUIRowNode;
  readonly rootRef: string;
  readonly regions: Partial<
    Record<WorkspaceRegion, WorkspaceRegionOccupancy>
  >;
}

export function workspaceRegionIndex(region: WorkspaceRegion): number {
  return WORKSPACE_REGIONS.indexOf(region);
}
