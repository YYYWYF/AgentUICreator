// @vitest-environment jsdom
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import { mockAuthMessages, useMockAuthLocale } from "../plugins/mock-auth-login/i18n";
import { localeProviderPlugin } from "../plugins/locale-provider/definition";
import { parseAppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";
import { createPluginRegistry, PluginServiceConsumerContext, PluginServiceRuntime, PluginServiceRuntimeContext } from "../runtime/plugins";
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService } from "../services/agent-ui-locale";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("updates plugin-local login messages immediately when the locale service changes", () => {
  const runtime = new PluginServiceRuntime();
  let renderer: ReactTestRenderer | undefined;
  function Probe() {
    const { messages, direction } = useMockAuthLocale();
    return <span dir={direction}>{messages.title}</span>;
  }
  try {
    runtime.reconcile(parseAppUIRuntimeModel({ root: { type: "slot", id: "root", slotId: "main" }, pluginInstances: { locale: { id: "locale", pluginId: "locale-provider", enabled: true } } }), createPluginRegistry([localeProviderPlugin]), {
      sendMessage: vi.fn(async () => undefined), resumeInterrupts: vi.fn(async () => undefined), startNewConversation: vi.fn(async () => undefined), abortRun: vi.fn(),
    });
    const service = runtime.get<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE)!;
    act(() => { renderer = create(<PluginServiceRuntimeContext.Provider value={runtime}><PluginServiceConsumerContext.Provider value={{ pluginId: "mock-auth-login", instanceId: "login", provides: [], inject: [AGENT_UI_LOCALE_SERVICE], optionalInject: [] }}><Probe /></PluginServiceConsumerContext.Provider></PluginServiceRuntimeContext.Provider>); });
    for (const locale of ["zh-CN", "en-US", "zh-CN"] as const) {
      act(() => service.setLocale(locale));
      expect(renderer!.root.findByType("span").children).toEqual([mockAuthMessages[locale].title]);
      expect(renderer!.root.findByType("span").props.dir).toBe("ltr");
    }
  } finally {
    if (renderer) act(() => renderer!.unmount());
    runtime.dispose();
  }
});
