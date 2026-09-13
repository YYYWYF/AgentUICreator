import { defineToolkit } from "@assistant-ui/react";

import { SearchFilesToolUI } from "./SearchFilesToolUI";
import {
  MockAgentPlanToolUI,
  MockAgentStatusToolUI,
  MockSubagentsToolUI,
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
          mock_subagents: {
            type: "backend" as const,
            display: "standalone" as const,
            render: MockSubagentsToolUI,
          },
        }
      : {}),
  });
}

export const assistantUiToolkit = createAssistantUiToolkit();
