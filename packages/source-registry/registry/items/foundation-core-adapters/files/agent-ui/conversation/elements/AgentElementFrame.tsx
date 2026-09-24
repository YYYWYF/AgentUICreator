import type { PropsWithChildren } from "react";

export interface AgentElementFrameProps {
  kind: "plan" | "status" | "subagent-aggregate";
}

export function AgentElementFrame({
  children,
  kind,
}: PropsWithChildren<AgentElementFrameProps>) {
  return (
    <div
      data-agent-ui-composition-part={kind}
      className="w-fit max-w-full"
    >
      {children}
    </div>
  );
}
