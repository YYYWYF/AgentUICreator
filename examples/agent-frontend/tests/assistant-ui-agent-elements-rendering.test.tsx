import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentPlan } from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/agent-plan";
import { AgentStatus } from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/agent-status";
import { SubagentList } from "../agent-ui/vendor/assistant-ui/components/assistant-ui/elements/subagent-list";

describe("assistant-ui official agent element fixtures", () => {
  it("renders the dormant foundation elements through their official contracts", () => {
    const html = renderToStaticMarkup(
      <>
        <AgentPlan steps={["Inspect", "Change"]} activeIndex={1} />
        <AgentStatus state="waiting" label="Waiting for approval" />
        <SubagentList
          agents={[{ name: "Agent A", model: "model-x" }]}
          progress={[0]}
          completedCount={0}
          showSummary={false}
          summaryAgent={{ name: "", model: "" }}
        />
      </>,
    );

    expect(html).toContain('data-slot="agent-plan"');
    expect(html).toContain('data-slot="agent-status"');
    expect(html).toContain('data-slot="subagent-list"');
    expect(html).toContain("Waiting for approval");
  });
});
