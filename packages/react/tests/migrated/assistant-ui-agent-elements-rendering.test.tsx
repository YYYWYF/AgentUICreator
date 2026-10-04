import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentPlan, AgentStatus, JobProgress, SubagentList } from "@agent-ui/react";

describe("assistant-ui official agent element fixtures", () => {
  it("renders the dormant foundation elements through their official contracts", () => {
    const html = renderToStaticMarkup(
      <>
        <AgentPlan
          title="Workspace update"
          steps={[
            { id: "inspect", label: "Inspect", description: "Read the source." },
            { id: "change", label: "Change" },
          ]}
          activeIndex={0}
        />
        <AgentStatus state="waiting" label="Waiting for approval" />
        <SubagentList
          agents={[{ name: "Agent A", model: "model-x" }]}
          progress={[0]}
          completedCount={0}
          showSummary={false}
          summaryAgent={{ name: "", model: "" }}
        />
        <JobProgress
          title="CI"
          stages={[{ name: "build", weight: 1, description: "Compile the app." }]}
          stageIndex={1}
          stageProgress={0}
          outcome={{ status: "partial", summary: "One check was skipped." }}
          elapsedMs={65_000}
        />
        <JobProgress
          title="Build"
          stages={[{ name: "build", weight: 1 }]}
          stageIndex={1}
          stageProgress={1}
          eta=""
          outcome={{ status: "failed", summary: "Build failed." }}
        />
        <JobProgress
          title="Deploy"
          stages={[{ name: "deploy", weight: 1 }]}
          stageIndex={1}
          stageProgress={1}
          eta=""
          outcome={{ status: "cancelled", summary: "Stopped by request." }}
        />
      </>,
    );

    expect(html).toContain('data-slot="agent-plan"');
    expect(html).toContain("Workspace update");
    expect(html).toContain("Read the source.");
    expect(html).toContain('data-slot="agent-status"');
    expect(html).toContain('data-slot="subagent-list"');
    expect(html).toContain('data-slot="job-progress"');
    expect(html).toContain("One check was skipped.");
    expect(html).toContain('data-state="failed"');
    expect(html).toContain("Build failed.");
    expect(html).toContain('data-state="cancelled"');
    expect(html).toContain("Stopped by request.");
    expect(html).toContain("Waiting for approval");
  });
});
