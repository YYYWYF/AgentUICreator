import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AgentProps } from "@za38.03/agent-ui-runtime/ui";

const { application } = vi.hoisted(() => ({ application: vi.fn(() => null) }));
vi.mock("@za38.03/agent-ui-runtime/ui", () => ({ AgentApplication: application }));
vi.mock("../resources/registry/items/foundation/core/files/application/project-config", () => ({ agentUIProject: {} }));
import { Agent } from "../resources/registry/items/foundation/core/files/application/Agent";

beforeEach(() => application.mockClear());

function render(props: AgentProps = {}) {
  renderToStaticMarkup(<Agent {...props} />);
  return (application.mock.calls as unknown as [AgentProps][]).at(-1)![0];
}

it("supplies the original titles, subtitles and outgoing questions in both languages", () => {
  const suggestions = render().suggestions;
  expect(typeof suggestions).toBe("function");
  if (typeof suggestions !== "function") throw new Error("Expected localized suggestions");
  expect(suggestions("zh-CN")).toEqual([
    { title: "账户交易查询", label: "查询余额、账单与交易明细", prompt: "如何查询账户余额、账单和交易明细？" },
    { title: "转账汇款指引", label: "了解流程、到账时间与须知", prompt: "请介绍转账汇款的办理流程、到账时间和注意事项。" },
    { title: "银行卡服务", label: "办理新卡、挂失与日常用卡", prompt: "请介绍银行卡申请、挂失和日常用卡的常见办理方式。" },
  ]);
  expect(suggestions("en-US").map(item => [item.title, item.label])).toEqual([
    ["Account lookup", "View balances, statements and transactions"],
    ["Transfer guide", "Explore steps, arrival times and tips"],
    ["Bank card services", "Apply for cards, report loss and manage"],
  ]);
  expect(suggestions("en-US").every(item => Boolean(item.prompt))).toBe(true);
});

it("preserves Host arrays, callbacks, explicit hiding and locale overrides", () => {
  const custom = [{ title: "Host title", label: "Host subtitle", prompt: "Host prompt" }];
  expect(render({ suggestions: custom }).suggestions).toBe(custom);
  const callback = () => custom;
  expect(render({ suggestions: callback }).suggestions).toBe(callback);
  expect(render({ suggestions: [] }).suggestions).toEqual([]);
  const suggestions = render({ locales: { "zh-CN": { starterSuggestions: { architectureLabel: "宿主副标题" } } } }).suggestions;
  if (typeof suggestions !== "function") throw new Error("Expected localized suggestions");
  expect(suggestions("zh-CN")[0]?.label).toBe("宿主副标题");
  expect(suggestions("en-US")[0]?.label).toBe("View balances, statements and transactions");
});
