import type { CreatorRunReceipt } from "../receiptTypes.js";
import type { CreatorStageActivity } from "./creatorStageProjection.js";

export function shouldPresentStage(activity: CreatorStageActivity, debug: boolean): boolean {
  if (debug) return true;
  if (activity.name === "creator.grounding") return false;
  if (activity.name === "creator.resolve") {
    return activity.status !== "running" && activity.metadata?.route !== "answer_only";
  }
  return true;
}

export type CreatorReceiptPresentation = "none" | "mutation" | "validation" | "outcome";

export function classifyCreatorReceiptPresentation(
  receipt: CreatorRunReceipt,
): CreatorReceiptPresentation {
  if (receipt.files.length > 0) return "mutation";
  if (receipt.pluginDeliveries?.length || receipt.verification?.status === "decision-no-project-change" || receipt.verification?.status === "failed") return "outcome";
  if (receipt.validations.length > 0) return "validation";
  return "none";
}
