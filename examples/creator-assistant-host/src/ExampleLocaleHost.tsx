import { useState, type ReactNode } from "react";
import { AgentUILocaleProvider, useAgentUILocale, type AgentUILocaleCode } from "@agent-ui/react";

function LocalePicker({ locale, onChange }: { locale: AgentUILocaleCode; onChange: (locale: AgentUILocaleCode) => void }) {
  const messages = useAgentUILocale("accessibility");
  return <label style={{ position: "fixed", right: 16, top: 12, zIndex: 50, fontSize: 12 }}>
    {messages.language} <select aria-label={messages.language} value={locale} onChange={event => onChange(event.target.value as AgentUILocaleCode)}>
      <option value="zh-CN">{messages.chineseName}</option><option value="en-US">{messages.englishName}</option>
    </select>
  </label>;
}

/** Example Host owns language selection independently of Creator. */
export function ExampleLocaleHost({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AgentUILocaleCode>("zh-CN");
  return <AgentUILocaleProvider locale={locale}><div lang={locale} style={{ display: "contents" }}><LocalePicker locale={locale} onChange={setLocale} />{children}</div></AgentUILocaleProvider>;
}
