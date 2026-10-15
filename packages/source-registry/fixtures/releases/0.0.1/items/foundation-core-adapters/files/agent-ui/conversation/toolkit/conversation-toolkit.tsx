import {
  createConversationToolkit as createToolkit,
  type ConversationToolkit,
} from "@za38.03/agent-ui-react";

import { SearchFilesToolUI } from "./SearchFilesToolUI";
export interface CreateConversationToolkitOptions {}

export function createConversationToolkit(
  _options: CreateConversationToolkitOptions = {},
): ConversationToolkit {
  return createToolkit({
    search_files: {
      type: "backend",
      display: "standalone",
      render: SearchFilesToolUI,
    },
  });
}

export const conversationToolkit = createConversationToolkit();
