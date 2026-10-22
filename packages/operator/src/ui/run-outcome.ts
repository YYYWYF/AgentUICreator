import { formatLocaleMessage, type CreatorLocaleMessages } from "./i18n/locale.js";

/** Render recorded facts; never infer project changes from the error message. */
export function creatorRunOutcomeText(metadata: unknown, fallback: string, messages: CreatorLocaleMessages): string {
  const outcome = metadata && typeof metadata === "object" && "creatorRunOutcome" in metadata ? metadata.creatorRunOutcome : null;
  if (!outcome || typeof outcome !== "object" || !("status" in outcome) || !("changeStatus" in outcome)) return fallback;
  const copy = messages.creatorRunOutcome;
  const parts = [outcome.status === "stopped" ? copy.stopped : copy.failed];
  if (outcome.changeStatus === "none") parts.push(copy.noChanges);
  else if (outcome.changeStatus === "committed") parts.push(copy.changesKept);
  else parts.push(copy.changesUnknown);
  if ("lastToolName" in outcome && typeof outcome.lastToolName === "string") parts.push(formatLocaleMessage(copy.lastTool, outcome.lastToolName));
  if ("toolErrors" in outcome && Array.isArray(outcome.toolErrors)) {
    for (const error of outcome.toolErrors) {
      if (error && typeof error.toolName === "string") parts.push(formatLocaleMessage(copy.toolError, error.toolName, String(error.reason ?? error.code ?? copy.unknownReason).slice(0, 400)));
    }
  }
  if (outcome.status !== "stopped") parts.push(fallback);
  parts.push(copy.incomplete);
  return parts.join("\n");
}
