import { AgentSource, AgentSources } from "../../agent-ui/components/sources";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useMessageSourcesRenderContext } from "../../runtime/message-rendering";

export function AgentMessageSourcesPlugin(_props: UIPluginComponentProps) {
  const { items, message, turnId } = useMessageSourcesRenderContext();

  return (
    <div
      data-agent-message-id={message.id}
      data-agent-turn-id={turnId}
      data-ui-plugin="agent-message-sources"
    >
      <AgentSources title={`来源 · ${items.length}`} ariaLabel="消息来源">
        {items.map((item, index) => (
          <AgentSource
            key={item.key}
            title={item.title}
            index={index + 1}
            {...(item.href === undefined ? {} : { href: item.href })}
            {...(item.description === undefined
              ? {}
              : { description: item.description })}
          />
        ))}
      </AgentSources>
    </div>
  );
}
