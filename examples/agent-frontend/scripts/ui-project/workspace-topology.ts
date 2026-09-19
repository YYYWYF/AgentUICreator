import {
  buildLayoutRefIndex,
  type AppUILayoutSize,
  type AppUIModel,
} from "../../framework/contracts/app-ui-model";
import {
  WORKSPACE_REGIONS,
  type AgentUIWorkspacePolicy,
  type WorkspaceRegion,
  type WorkspaceTopology,
} from "../../framework/contracts/agent-ui-workspace";

export const WORKSPACE_TOPOLOGY_UNSUPPORTED =
  "WORKSPACE_TOPOLOGY_UNSUPPORTED" as const;

export class WorkspaceTopologyError extends Error {
  readonly code = WORKSPACE_TOPOLOGY_UNSUPPORTED;
  readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "WorkspaceTopologyError";
    this.details = details;
  }
}

function unsupported(message: string, details?: unknown): never {
  throw new WorkspaceTopologyError(message, details);
}

/**
 * Normalize only the equivalent one-fraction spellings used by existing
 * AppUIModel fixtures. All other track syntax remains exact and opaque.
 */
function normalizedTrack(value: AppUILayoutSize): string {
  const source = typeof value === "number" ? `${value}fr` : value;
  const normalized = source.trim().replace(/\s+/gu, "").toLowerCase();
  return normalized === "1fr" ? "minmax(0,1fr)" : normalized;
}

function sameTrack(left: AppUILayoutSize, right: AppUILayoutSize): boolean {
  return normalizedTrack(left) === normalizedTrack(right);
}

function availableRegions(
  policy: AgentUIWorkspacePolicy,
): Array<[WorkspaceRegion, NonNullable<AgentUIWorkspacePolicy["regions"][WorkspaceRegion]>]> {
  return WORKSPACE_REGIONS.flatMap((region) => {
    const definition = policy.regions[region];
    return definition === undefined ? [] : [[region, definition]];
  });
}

function inferAssignments(
  tracks: readonly AppUILayoutSize[],
  regions: ReadonlyArray<
    [WorkspaceRegion, NonNullable<AgentUIWorkspacePolicy["regions"][WorkspaceRegion]>]
  >,
): WorkspaceRegion[][] {
  const assignments: WorkspaceRegion[][] = [];
  const visit = (
    trackIndex: number,
    regionIndex: number,
    current: WorkspaceRegion[],
  ): void => {
    if (trackIndex === tracks.length) {
      assignments.push([...current]);
      return;
    }

    const track = tracks[trackIndex];
    if (track === undefined) return;
    for (let nextRegionIndex = regionIndex; nextRegionIndex < regions.length; nextRegionIndex += 1) {
      const entry = regions[nextRegionIndex];
      if (entry === undefined || !sameTrack(track, entry[1].track)) continue;
      current.push(entry[0]);
      visit(trackIndex + 1, nextRegionIndex + 1, current);
      current.pop();
    }
  };

  visit(0, 0, []);
  return assignments;
}

function containsRequiredRegions(
  assignment: readonly WorkspaceRegion[],
  regions: ReadonlyArray<
    [WorkspaceRegion, NonNullable<AgentUIWorkspacePolicy["regions"][WorkspaceRegion]>]
  >,
): boolean {
  const occupied = new Set(assignment);
  return regions.every(([region, definition]) => !definition.required || occupied.has(region));
}

/**
 * Projects the canonical top-level Workspace Row into semantic Region
 * occupancy. This intentionally accepts only an unambiguous sparse
 * subsequence of the Mode's declared Region tracks.
 */
export function projectWorkspaceTopology(
  model: AppUIModel,
  policy: AgentUIWorkspacePolicy,
): WorkspaceTopology {
  if (model.root.type !== "row") {
    unsupported("The canonical Workspace root must be a Row.", {
      rootType: model.root.type,
    });
  }

  const root = model.root;
  const regions = availableRegions(policy);
  if (root.children.length > regions.length) {
    unsupported("The Workspace Row has more children than the Mode supports.", {
      childCount: root.children.length,
      availableRegionCount: regions.length,
    });
  }
  if (root.sizes === undefined) {
    unsupported("The canonical Workspace Row must declare explicit track sizes.");
  }
  if (root.sizes.length !== root.children.length) {
    unsupported("Workspace Row sizes must match its child count.", {
      childCount: root.children.length,
      sizeCount: root.sizes.length,
    });
  }

  const assignments = inferAssignments(root.sizes, regions).filter((assignment) =>
    containsRequiredRegions(assignment, regions),
  );
  if (assignments.length !== 1) {
    unsupported(
      assignments.length === 0
        ? "The Workspace Row cannot be mapped to the Mode's declared Regions."
        : "The Workspace Row has multiple possible Region mappings.",
      {
        assignments: assignments.map((assignment) => [...assignment]),
        tracks: [...root.sizes],
      },
    );
  }

  const assignment = assignments[0]!;
  const refs = buildLayoutRefIndex(root);
  const rootRef = refs.byNode.get(root);
  if (rootRef === undefined) {
    unsupported("The canonical Workspace Row has no stable Layout reference.");
  }

  const occupied = {} as Partial<WorkspaceTopology["regions"]>;
  assignment.forEach((region, index) => {
    const branch = root.children[index];
    const definition = policy.regions[region];
    if (branch === undefined || definition === undefined) {
      unsupported("The Workspace Region mapping references a missing branch.", {
        region,
        index,
      });
    }
    const branchRef = refs.byNode.get(branch);
    if (branchRef === undefined) {
      unsupported("A Workspace branch has no stable Layout reference.", {
        region,
        index,
      });
    }
    occupied[region] = {
      region,
      branch,
      branchRef,
      index,
      track: definition.track,
    };
  });

  return {
    root,
    rootRef,
    regions: occupied,
  };
}
