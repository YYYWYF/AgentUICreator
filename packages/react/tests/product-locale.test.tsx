// @vitest-environment jsdom
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, useAgentUILocale, resolveAgentUILocaleMessages, AGENT_UI_PRESENTATION_LOCALES } from "../src/locale";
import { ConversationFile } from "../src/public";
import { getConversationStarterSuggestions } from "../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/config/conversation-runtime-config";

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
  it("localizes preset suggestions without translating the conversation contract", () => {
    const english = getConversationStarterSuggestions("en-US");
    const chinese = getConversationStarterSuggestions("zh-CN");
    expect(english[0]!.title).toBe("Analyze Agent UI architecture");
    expect(chinese[0]!.title).toBe("分析 Agent UI 架构");
    expect(Object.keys(english[0]!).sort()).toEqual(Object.keys(chinese[0]!).sort());
  });
});
