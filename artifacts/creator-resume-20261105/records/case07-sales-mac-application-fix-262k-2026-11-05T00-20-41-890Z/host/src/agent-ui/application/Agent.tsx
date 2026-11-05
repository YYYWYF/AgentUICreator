import { AgentApplication, type AgentProps } from "@za38.03/agent-ui-runtime/ui";
import { agentUIProject } from "./project-config";
export type { AgentProps } from "@za38.03/agent-ui-runtime/ui";

export function Agent(props: AgentProps = {}) {
  const { locales, ...rest } = props;
  return (
    <AgentApplication
      project={agentUIProject}
      {...rest}
      locales={{
        "zh-CN": { composer: { placeholder: "请输入你的问题" } },
        "en-US": { composer: { placeholder: "Enter your question" } },
        ...locales,
      }}
    />
  );
}
