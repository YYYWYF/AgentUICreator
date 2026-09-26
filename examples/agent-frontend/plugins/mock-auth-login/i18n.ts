import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService, type AgentUILocaleSnapshot } from "../../services/agent-ui-locale";
import { agentUILocaleConfig } from "../../agent-ui/i18n/locale-config";
import { AGENT_UI_LOCALE_METADATA } from "../../agent-ui/i18n/locale-registry";
import type { AgentUILocaleCode } from "../../agent-ui/i18n/locale-types";

/** Plugin-owned messages; deleting this plugin does not change foundation locale. */
export const mockAuthMessages = {
  "en-US": {
    demo: "Login demo",
    title: "Sign in to get started",
    description: "Use a demo identity to enter the Agent workspace.",
    signIn: "Enter with demo account",
    signingIn: "Signing in…",
    failed: "Sign-in failed. Please try again.",
    hint: "Internal authentication is not connected. Reloading resets this demo.",
  },
  "zh-CN": {
    demo: "登录示意",
    title: "登录后开始使用",
    description: "点击下方按钮，以示例身份进入 Agent 工作台。",
    signIn: "模拟登录并进入",
    signingIn: "正在登录…",
    failed: "登录未完成，请重试。",
    hint: "暂未接入内部认证体系，刷新页面后需重新进入。",
  },
};
const fallback: AgentUILocaleSnapshot = {
  locale: agentUILocaleConfig.defaultLocale,
  direction: AGENT_UI_LOCALE_METADATA[agentUILocaleConfig.defaultLocale].direction,
};
export function resolveMockAuthMessages(locale: AgentUILocaleCode) {
  return mockAuthMessages[locale];
}
export function useMockAuthLocale() {
  const service = usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  const snapshot = usePluginServiceSnapshot(service, fallback);
  return { messages: resolveMockAuthMessages(snapshot.locale), direction: snapshot.direction };
}
