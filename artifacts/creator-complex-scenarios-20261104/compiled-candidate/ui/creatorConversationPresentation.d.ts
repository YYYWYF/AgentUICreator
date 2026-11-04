import type { CreatorRunReceipt } from "../receiptTypes.js";
import type { CreatorStageActivity } from "./creatorStageProjection.js";
export declare function shouldPresentStage(activity: CreatorStageActivity, debug: boolean): boolean;
export type CreatorReceiptPresentation = "none" | "mutation" | "validation" | "outcome";
export declare function classifyCreatorReceiptPresentation(receipt: CreatorRunReceipt): CreatorReceiptPresentation;
//# sourceMappingURL=creatorConversationPresentation.d.ts.map