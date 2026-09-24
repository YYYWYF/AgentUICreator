// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreatorProjectSetup, type CreatorSetupDraft, type CreatorSetupInfoState } from "../src/ui/setup/CreatorProjectSetup.js";
import { createEmptyCreatorSetupDraft } from "../src/ui/setup/creatorSetupState.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const infoState: CreatorSetupInfoState = { status: "ready", info: {
  suggestedSourceRoot: "src/agent-ui",
  modes: [
    { id: "assistant", title: "Assistant", description: "" },
    { id: "embedded", title: "Embedded", description: "" },
    { id: "platform", title: "Platform", description: "" },
  ],
} };

function draft(targetState: "missing" | "empty" | "occupied" = "missing"): CreatorSetupDraft {
  return { ...createEmptyCreatorSetupDraft(), mode: "assistant", sourceRoot: "src/agent-ui",
    validation: { status: targetState === "occupied" ? "invalid" : "valid", result: {
      valid: targetState !== "occupied",
      sourceRoot: { normalized: "src/agent-ui", parentExists: true, targetState },
      issues: targetState === "occupied" ? [{ code: "AGENT_UI_SOURCE_ROOT_NOT_EMPTY", message: "Occupied" }] : [],
    } } };
}

async function renderSetup(input: { draft?: CreatorSetupDraft; canInitialize?: boolean; debug?: boolean } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onModeChange = vi.fn();
  const props = { infoState, draft: input.draft ?? createEmptyCreatorSetupDraft(),
    canInitialize: input.canInitialize ?? false, debug: input.debug ?? false,
    onModeChange, onSourceRootChange: vi.fn(), onInitialize: vi.fn(), onRetryInfo: vi.fn() };
  await act(async () => root.render(<CreatorProjectSetup {...props} />));
  return { container, root, props, onModeChange };
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  if (match === undefined) throw new Error(`Missing button: ${text}`);
  return match;
}

afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("CreatorProjectSetup", () => {
  it("shows all modes and suggested source root before selection", async () => {
    const { container, root, props } = await renderSetup({ draft: {
      ...createEmptyCreatorSetupDraft(), sourceRoot: "src/agent-ui",
    } });
    expect(button(container, "Assistant")).toBeTruthy();
    expect(button(container, "Embedded")).toBeTruthy();
    expect(button(container, "Platform")).toBeTruthy();
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("src/agent-ui");
    expect(button(container, "初始化 Agent UI").disabled).toBe(true);
    await act(async () => button(container, "Assistant").click());
    expect(props.onModeChange).toHaveBeenCalledWith("assistant");
    expect(button(container, "Assistant").getAttribute("aria-pressed")).toBe("false");
    await act(async () => root.render(<CreatorProjectSetup {...props} draft={{ ...props.draft, mode: "assistant" }} />));
    expect(button(container, "Assistant").getAttribute("aria-pressed")).toBe("true");
  });

  it("describes usable missing and empty roots and enables Initialize", async () => {
    const { container, root, props } = await renderSetup({ draft: draft(), canInitialize: true });
    expect(container.textContent).toContain("✓ 将创建新目录：src/agent-ui");
    expect(button(container, "初始化 Agent UI").disabled).toBe(false);
    await act(async () => root.render(<CreatorProjectSetup {...props} draft={draft("empty")} />));
    expect(container.textContent).toContain("✓ 将使用现有空目录：src/agent-ui");
  });

  it("shows an occupied-root message and hides its code outside debug mode", async () => {
    const { container, root, props } = await renderSetup({ draft: draft("occupied") });
    expect(container.textContent).toContain("这个目录已有文件");
    expect(container.textContent).not.toContain("AGENT_UI_SOURCE_ROOT_NOT_EMPTY");
    expect(button(container, "初始化 Agent UI").disabled).toBe(true);
    await act(async () => root.render(<CreatorProjectSetup {...props} debug />));
    expect(container.textContent).toContain("AGENT_UI_SOURCE_ROOT_NOT_EMPTY");
  });

  it("keeps package details in Setup", async () => {
    const { container } = await renderSetup({ draft: { ...draft(), error: {
      code: "AGENT_UI_PACKAGE_REQUIREMENTS_UNMET", message: "Package requirements are unmet.",
      details: [{ code: "PACKAGE_MISSING", message: "Missing @assistant-ui/react" }],
    } } });
    expect(container.textContent).toContain("缺少或不兼容的 Agent UI 依赖");
    expect(container.textContent).toContain("Missing @assistant-ui/react");
    expect(button(container, "Assistant").getAttribute("aria-pressed")).toBe("true");
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("src/agent-ui");
  });

  it("disables editing during initialization", async () => {
    const { container } = await renderSetup({ draft: { ...draft(), initializing: true }, canInitialize: false });
    expect(button(container, "Assistant").disabled).toBe(true);
    expect((container.querySelector("input") as HTMLInputElement).disabled).toBe(true);
    expect(button(container, "正在初始化…").disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("正在创建 Agent UI 源码");
  });
});
