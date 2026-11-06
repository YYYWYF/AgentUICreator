import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AgentProps } from "@za38.03/agent-ui-runtime/ui";

const { application, project } = vi.hoisted(() => ({ application: vi.fn(() => null), project: {} }));
vi.mock("@za38.03/agent-ui-runtime/ui", () => ({ AgentApplication: application }));
vi.mock("../resources/registry/items/foundation/core/files/application/project-config", () => ({ agentUIProject: project }));
import { Agent } from "../resources/registry/items/foundation/core/files/application/Agent";

beforeEach(() => application.mockClear());
it("keeps the project as the presentation owner and forwards Host locale overrides", () => {
  const locales = { "zh-CN": { conversation: { welcome: "今天心情好吗" }, starterSuggestions: { architecturePrompt: "如何学习游泳？" } } };
  renderToStaticMarkup(<Agent locales={locales} />);
  const props = (application.mock.calls as unknown as [AgentProps & {project: unknown}][]).at(-1)![0];
  expect(props.project).toBe(project);
  expect(props.locales).toBe(locales);
  expect(props).not.toHaveProperty("welcome");
  expect(props).not.toHaveProperty("suggestions");
});
