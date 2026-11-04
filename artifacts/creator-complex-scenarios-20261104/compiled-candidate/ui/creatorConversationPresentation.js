export function shouldPresentStage(activity, debug) {
    if (debug)
        return true;
    if (activity.name === "creator.grounding")
        return false;
    if (activity.name === "creator.resolve") {
        return activity.status !== "running" && activity.metadata?.route !== "answer_only";
    }
    return true;
}
export function classifyCreatorReceiptPresentation(receipt) {
    if (receipt.files.length > 0)
        return "mutation";
    if (receipt.pluginDeliveries?.length || receipt.verification?.status === "decision-no-project-change" || receipt.verification?.status === "failed")
        return "outcome";
    if (receipt.validations.length > 0)
        return "validation";
    return "none";
}
//# sourceMappingURL=creatorConversationPresentation.js.map