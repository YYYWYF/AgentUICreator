import { EventType, type AGUIEvent, type RunAgentInput } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { markdownShowcaseScenario } from "../src/index.js";
import { runMockScenario } from "../src/scenario-runner.js";

const input: RunAgentInput = {
  threadId: "markdown-thread",
  runId: "markdown-run",
  state: {},
  messages: [],
  tools: [],
  context: [],
  forwardedProps: {},
};

describe("Markdown Showcase", () => {
  it("identifies a Basics backend reference using standard AG-UI text", () => {
    expect(markdownShowcaseScenario).toMatchObject({
      id: "markdown-showcase",
      title: "Markdown Showcase",
      category: "basics",
      reference: {
        audience: "backend",
        protocol: "AG-UI",
        eventFlow: ["TEXT_MESSAGE_START/CONTENT/END"],
      },
    });
  });

  it("streams one standard assistant message and preserves the Markdown source", async () => {
    const events: AGUIEvent[] = [];
    for await (const event of runMockScenario(input, markdownShowcaseScenario, {
      timingScale: 0,
    })) {
      events.push(event);
    }

    const chunks = events.filter((event) =>
      event.type === EventType.TEXT_MESSAGE_CONTENT,
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(events.map(({ type }) => type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      ...chunks.map(() => EventType.TEXT_MESSAGE_CONTENT),
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    const start = events[1];
    if (start?.type !== EventType.TEXT_MESSAGE_START) {
      throw new Error("Markdown Showcase did not start an assistant message");
    }
    expect(start.role).toBe("assistant");
    expect(chunks.every(({ messageId }) => messageId === start.messageId)).toBe(true);
    expect(events.at(-2)).toMatchObject({ messageId: start.messageId });

    const step = markdownShowcaseScenario.steps[0];
    if (step?.type !== "message") {
      throw new Error("Markdown Showcase must use the existing message step");
    }
    const content = chunks.map(({ delta }) => delta).join("");
    expect(content).toBe(step.text);
    expect(content).toContain("# Heading 1");
    expect(content).toContain("###### Heading 6");
    expect(content).toContain("| Feature | Status | Count |");
    expect(content).toContain("| --- | :---: | ---: |");
    expect(content).toContain("```ts");
    expect(content).toContain("```json");
    expect(content).toContain("- [x] Completed task");
    expect(content).toContain("- [ ] Pending task");
  });
});
