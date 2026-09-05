import type { UserMessage } from "@ag-ui/core";
import type { AgentInputPart, AgentUserInput } from "@agent-ui/runtime-core";

function mapInputPart(
  part: AgentInputPart,
): Exclude<UserMessage["content"], string>[number] {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }

  const media = {
    source: { ...part.source },
    ...(part.name === undefined ? {} : { metadata: { name: part.name } }),
  };
  switch (part.type) {
    case "image":
      return { type: "image", ...media };
    case "audio":
      return { type: "audio", ...media };
    case "video":
      return { type: "video", ...media };
    case "document":
      return { type: "document", ...media };
  }
}

export function mapAgentUserInput(
  input: AgentUserInput,
  id: string,
): UserMessage {
  return {
    id,
    role: "user",
    content:
      typeof input.content === "string"
        ? input.content.trim()
        : input.content.map(mapInputPart),
  };
}
