import type { ReactNode } from "react";
import { AgentUILocaleProvider } from "@za38.03/agent-ui-plugins";

/** Example Host supplies the default locale without adding a visible control. */
export function ExampleLocaleHost({ children }: { children: ReactNode }) {
  return <AgentUILocaleProvider locale="zh-CN"><div lang="zh-CN" style={{ display: "contents" }}>{children}</div></AgentUILocaleProvider>;
}
