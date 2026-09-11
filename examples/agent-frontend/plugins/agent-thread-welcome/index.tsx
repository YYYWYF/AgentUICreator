import { AgentThreadWelcome } from "../../agent-ui/components/thread-welcome";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";

import "./styles.css";

function readStringProp(
  props: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = props?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readBooleanProp(
  props: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = props?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function DefaultWelcomeMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3.5v3.2" />
      <path d="M12 17.3v3.2" />
      <path d="M3.5 12h3.2" />
      <path d="M17.3 12h3.2" />
      <circle cx="12" cy="12" r="3.4" />
    </svg>
  );
}

export function AgentThreadWelcomePlugin(_props: UIPluginComponentProps) {
  const instance = usePluginInstance();
  const title = readStringProp(instance.props, "title") ?? "Agent Frontend";
  const description =
    readStringProp(instance.props, "description") ??
    "通过 AG-UI 与一个 Agent Runtime 连接，开始新的任务。";
  const eyebrow = readStringProp(instance.props, "eyebrow");
  const showIcon = readBooleanProp(instance.props, "showIcon") ?? true;

  return (
    <div
      className="agent-thread-welcome-plugin"
      data-ui-plugin="agent-thread-welcome"
    >
      <AgentThreadWelcome
        description={description}
        {...(eyebrow === undefined ? {} : { eyebrow })}
        {...(showIcon ? { icon: <DefaultWelcomeMark /> } : {})}
        title={title}
      />
    </div>
  );
}
