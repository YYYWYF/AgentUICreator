// @vitest-environment jsdom
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, useAgentUILocale, resolveAgentUILocaleMessages, mergeAgentUILocaleOverrides, AGENT_UI_PRESENTATION_LOCALES } from "../src/locale";
import { ConversationFile } from "../src/public";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; });
function Probe() {
  const composer = useAgentUILocale("composer");
  const images = useAgentUILocale("images");
  return <button aria-label={images.closeZoom}>{composer.send}</button>;
}
describe("Product locale composition", () => {
  it("updates controls and screen-reader copy through the host provider", () => {
    act(() => { renderer = create(<AgentUILocaleProvider locale="en-US"><Probe /></AgentUILocaleProvider>); });
    expect(renderer!.toJSON()).toMatchObject({ props: { "aria-label": "Close zoomed image" }, children: ["Send message"] });
    act(() => renderer!.update(<AgentUILocaleProvider locale="zh-CN"><Probe /></AgentUILocaleProvider>));
    expect(renderer!.toJSON()).toMatchObject({ props: { "aria-label": "关闭放大图片" }, children: ["发送消息"] });
  });
  it("localizes URL file download accessibility through public upstream composition", () => {
    act(() => { renderer = create(<AgentUILocaleProvider locale="zh-CN"><ConversationFile filename="report$&.pdf" mimeType="application/pdf" data="https://files.example/report.pdf" sourceType="url" /></AgentUILocaleProvider>); });
    const link = renderer!.root.findByType("a");
    expect(link.props["aria-label"]).toBe("下载 report$&.pdf");
    expect(link.props.href).toBe("https://files.example/report.pdf");
    expect(link.props.download).toBe("report$&.pdf");
  });
  it("falls back per key while preserving host composition overrides", () => {
    const previous = AGENT_UI_PRESENTATION_LOCALES["zh-CN"].attachments.remove;
    AGENT_UI_PRESENTATION_LOCALES["zh-CN"].attachments.remove = "";
    try {
      const warning = vi.fn();
      const messages = resolveAgentUILocaleMessages("zh-CN", { composer: { placeholder: "Host prompt" } }, warning);
      expect(messages.attachments.remove).toBe("Remove file");
      expect(messages.composer.placeholder).toBe("Host prompt");
      expect(messages.composer.send).toBe("发送消息");
      expect(warning).toHaveBeenCalledWith("attachments.remove");
    } finally { AGENT_UI_PRESENTATION_LOCALES["zh-CN"].attachments.remove = previous; }
  });

  it("merges exact fields and allows clearing optional descriptions without clearing required labels", () => {
    const merged = mergeAgentUILocaleOverrides(
      { conversation: { welcome: "Project welcome", welcomeDescription: "Project description" }, composer: { placeholder: "Project input" } },
      { conversation: { welcomeDescription: "" }, composer: { send: "Host send" } },
    );
    const messages = resolveAgentUILocaleMessages("en-US", merged);
    expect(messages.conversation.welcome).toBe("Project welcome");
    expect(messages.conversation.welcomeDescription).toBe("");
    expect(messages.composer.placeholder).toBe("Project input");
    expect(messages.composer.send).toBe("Host send");
    expect(resolveAgentUILocaleMessages("en-US", { conversation: { welcome: "" } }).conversation.welcome).toBe(AGENT_UI_PRESENTATION_LOCALES["en-US"].conversation.welcome);
    const warn = vi.fn();
    expect(resolveAgentUILocaleMessages("zh-CN", undefined, warn).conversation.welcomeDescription).toBe("");
    expect(warn).not.toHaveBeenCalled();
  });
});
