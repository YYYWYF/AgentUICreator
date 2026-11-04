import { AgentApplication, type AgentProps } from "@za38.03/agent-ui-runtime/ui";
import { jobProgressAppEventSchemas } from "../plugins/job-progress-panel/events";
import { agentUIProject } from "./project-config";
export type { AgentProps } from "@za38.03/agent-ui-runtime/ui";

export function Agent(props: AgentProps = {}) {
  const { locales, appEventSchemas, ...rest } = props;
  return (
    <AgentApplication
      project={agentUIProject}
      {...rest}
      appEventSchemas={{ ...jobProgressAppEventSchemas, ...appEventSchemas }}
      locales={{
        "zh-CN": { composer: { placeholder: "请输入你的问题" } },
        "en-US": { composer: { placeholder: "Enter your question" } },
        ...locales,
      }}
    />
  );
}
