/** Only pre-commit placement failures can leave a prepared Plugin for manual placement. */
export function pluginPlacementIssue(error: unknown): { code: string; reason?: string } | undefined {
  if (typeof error !== "object" || error === null || !("code" in error) || typeof error.code !== "string") return;
  const details = "details" in error && typeof error.details === "object" && error.details !== null ? error.details : undefined;
  const reason = details && "reason" in details && typeof details.reason === "string" ? details.reason : undefined;
  if (error.code === "AUTHORING_MOVE_INCOMPATIBLE" && reason &&
    ["slot-cardinality-full", "slot-capability-mismatch", "slot-render-scope-mismatch"].includes(reason)) {
    return { code: error.code, reason };
  }
  if (error.code === "AUTHORING_MOVE_UNSUPPORTED" && reason &&
    ["slot-not-declared", "slot-accepts-not-declared"].includes(reason)) {
    return { code: error.code, reason };
  }
  if (["AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE", "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS"].includes(error.code) && reason &&
    ["default-placement-not-declared", "default-parent-unavailable", "default-anchor-unavailable"].includes(reason)) {
    return { code: error.code, reason };
  }
}
