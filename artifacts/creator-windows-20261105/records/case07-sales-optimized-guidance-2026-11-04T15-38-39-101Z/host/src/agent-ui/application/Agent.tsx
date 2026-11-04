import { AgentApplication, type AgentProps } from "@za38.03/agent-ui-runtime/ui";
import { agentUIProject } from "./project-config";
import { SALES_REPORT_EVENT, salesReportEventSchema } from "../plugins/sales-report-message/schema";
export type { AgentProps } from "@za38.03/agent-ui-runtime/ui";

const projectEventSchemas: NonNullable<AgentProps["appEventSchemas"]> = {
  [SALES_REPORT_EVENT]: salesReportEventSchema,
};

export function Agent(props: AgentProps = {}) {
  const { locales, appEventSchemas, ...rest } = props;
  return (
    <AgentApplication
      project={agentUIProject}
      {...rest}
      appEventSchemas={{ ...projectEventSchemas, ...appEventSchemas }}
      locales={{
        "zh-CN": { composer: { placeholder: "请输入你的问题" } },
        "en-US": { composer: { placeholder: "Enter your question" } },
        ...locales,
      }}
    />
  );
}
