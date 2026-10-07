import { useAgentUILocale, resolveAgentUILocaleMessages } from "@agent-ui/react";
import { useState } from "react";
import type {
  ConversationToolCallComponent,
  ConversationToolCallProps,
} from "@agent-ui/react";

import {
  ConversationToolCall,
  ConversationToolFallback,
} from "@agent-ui/react";

type SearchFilesArgs = Record<string, unknown>;

function getSearchKeyword(args: unknown): string {
  if (args === null || typeof args !== "object") return "";
  const keyword = (args as Record<string, unknown>).keyword;
  return typeof keyword === "string" ? keyword : "";
}

function isSafeSearchFilesResult(
  result: unknown,
): result is { files: string[] } {
  if (result === null || typeof result !== "object") return false;
  const files = (result as { files?: unknown }).files;
  return Array.isArray(files) && files.every((file) => typeof file === "string");
}

export function formatSearchFilesResult(result: unknown, messages = resolveAgentUILocaleMessages("en-US").search): string {
  if (result === undefined || result === null) return "";

  if (isSafeSearchFilesResult(result)) {
    const { files } = result;
    if (files.length === 0) return messages.noFiles;
    if (files.length === 1) return messages.oneFile.replace("{files}", () => String(files[0]));
    return messages.manyFiles.replace("{count}", String(files.length)).replace("{files}", () => files.join(", "));
  }

  try {
    const serialized = JSON.stringify(result);
    return serialized ?? "";
  } catch {
    try {
      return String(result);
    } catch {
      return "";
    }
  }
}

function shouldUseFallback(
  props: ConversationToolCallProps,
): boolean {
  if (props.isError === true) return true;
  if (props.status.type === "requires-action") return true;
  return props.status.type === "incomplete";
}

export const SearchFilesToolUI: ConversationToolCallComponent = (props) => {
  const messages = useAgentUILocale("search");
  const [open, setOpen] = useState(false);

  if (shouldUseFallback(props)) return <ConversationToolFallback {...props} />;

  return (
    <ConversationToolCall
      activeLabel={messages.searchFiles}
      label={messages.searchedFiles}
      query={getSearchKeyword(props.args)}
      request={props.argsText ?? ""}
      result={formatSearchFilesResult(props.result, messages)}
      running={props.status.type === "running"}
      open={open}
      onOpenChange={setOpen}
    />
  );
};
