import { defineToolkit } from "@assistant-ui/react";

import { SearchFilesToolUI } from "./SearchFilesToolUI";
import {
  MockAgentPlanToolUI,
  MockAgentStatusToolUI,
  MockDispatchSubagentToolUI,
  MockInvokeResearcherToolUI,
} from "./mock";

export interface CreateAssistantUiToolkitOptions {
  mockAgentElements?: boolean | undefined;
}

export function createAssistantUiToolkit({
  mockAgentElements = false,
}: CreateAssistantUiToolkitOptions = {}) {
  return defineToolkit({
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
          mock_invoke_researcher: {
            type: "backend" as const,
            display: "standalone" as const,
            render: MockInvokeResearcherToolUI,
          },
        }
      : {}),
  });
}

export const assistantUiToolkit = createAssistantUiToolkit();
