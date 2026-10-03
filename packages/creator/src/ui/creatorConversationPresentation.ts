import type { CreatorRunReceipt } from "../receiptTypes.js";
import type { CreatorIntentRoute, CreatorStageActivity } from "./creatorStageProjection.js";

export function shouldPresentStage(activity: CreatorStageActivity, debug: boolean): boolean {
  if (debug) return true;
  if (activity.name === "creator.grounding") return false;
  if (activity.name === "creator.resolve") {
    return activity.status !== "running" && activity.metadata?.route !== "answer_only";
  }
  return true;
}

export function shouldPresentMutationReceipt({
  route,
  receipt,
  debug,
  mutationAttempts = 0,
}: {
  route?: CreatorIntentRoute;
  receipt: CreatorRunReceipt;
  debug: boolean;
  mutationAttempts?: number;
}): boolean {
  if (debug) return true;
  if (route === "answer_only") return false;
  if (route === "read_only_general" && mutationAttempts === 0 && receipt.files.length === 0) {
    return false;
  }
  return true;
}
