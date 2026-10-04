import { handleUIProjectControlRequest } from "../../../src/handler.ts";

process.once("message", async (message: { projectRoot: string; operation: "inspect_agent_ui_sources" | "apply_agent_ui_source_item" | "remove_agent_ui_source_items"; input: Record<string, unknown> }) => {
  try {
    const response = await handleUIProjectControlRequest({ operation: message.operation, input: message.input }, message.projectRoot);
    await new Promise<void>((resolve, reject) => process.send!({ type: "result", response }, error => error ? reject(error) : resolve()));
  } catch (error) {
    await new Promise<void>((resolve, reject) => process.send!({ type: "error", message: String(error) }, sendError => sendError ? reject(sendError) : resolve()));
  } finally {
    process.disconnect!();
  }
});
