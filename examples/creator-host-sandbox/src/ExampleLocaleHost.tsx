import type { ReactNode } from "react";
import { AgentUILocaleProvider } from "@agent-ui/react";

/** Example Host owns the default language independently of Creator. */
export function ExampleLocaleHost({ children }: { children: ReactNode }) {
  return <AgentUILocaleProvider locale="zh-CN"><div lang="zh-CN" style={{ display: "contents" }}>{children}</div></AgentUILocaleProvider>;
}
