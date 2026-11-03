import type { ToolMessage } from "@ag-ui/core";

/** Read the text receipt without serializing media parts into application JSON. */
export function toolMessageText(content: ToolMessage["content"]): string {
  return typeof content === "string" ? content : content.flatMap(part => part.type === "text" ? [part.text] : []).join("");
}
