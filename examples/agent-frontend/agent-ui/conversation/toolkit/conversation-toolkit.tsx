import {
  createConversationToolkit as createToolkit,
  type ConversationToolkit,
} from "@agent-ui/react";

import { SearchFilesToolUI } from "./SearchFilesToolUI";
import {
  MockAgentPlanToolUI,
  MockAgentStatusToolUI,
  MockDispatchSubagentToolUI,
  MockRunCiJobToolUI,
} from "./mock";

export interface CreateConversationToolkitOptions {
  mockAgentElements?: boolean | undefined;
}

export function createConversationToolkit({
  mockAgentElements = false,
}: CreateConversationToolkitOptions = {}): ConversationToolkit {
  return createToolkit({
    search_files: {
      type: "backend",
      display: "standalone",
      render: SearchFilesToolUI,
    },
    ...(mockAgentElements
      ? {
          mock_agent_plan: {
            type: "backend" as const,
            display: "standalone" as const,
            render: MockAgentPlanToolUI,
          },
          mock_agent_status: {
            type: "backend" as const,
            display: "standalone" as const,
            render: MockAgentStatusToolUI,
          },
          mock_dispatch_subagent: {
            type: "backend" as const,
            display: "standalone" as const,
            render: MockDispatchSubagentToolUI,
          },
          run_ci_job: {
            type: "backend" as const,
            display: "standalone" as const,
            render: MockRunCiJobToolUI,
          },
        }
      : {}),
  });
}

export const conversationToolkit = createConversationToolkit();
