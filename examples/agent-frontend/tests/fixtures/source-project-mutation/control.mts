import { handleUIProjectControlRequest } from "../../../scripts/ui-project-control.ts";

process.once("message", async (message: { projectRoot: string; operation: "inspect_agent_ui_sources" | "apply_agent_ui_source_item" | "remove_agent_ui_source_items"; input: Record<string, unknown> }) => {
  try {
    const response = await handleUIProjectControlRequest({ schemaVersion: 3, operation: message.operation, input: message.input }, message.projectRoot);
    process.send!({ type: "result", response });
  } catch (error) {
    process.send!({ type: "error", message: String(error) });
  } finally {
    process.disconnect!();
  }
});
