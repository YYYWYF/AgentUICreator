import {
  AgentAttachment,
  AgentAttachments,
} from "../../agent-ui/components/attachments";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useMessageAttachmentsRenderContext } from "../../runtime/message-rendering";

const kindLabels = {
  image: "IMG",
  audio: "AUD",
  video: "VID",
  file: "FILE",
} as const;

export function AgentMessageAttachmentsPlugin(_props: UIPluginComponentProps) {
  const { items, message, turnId } = useMessageAttachmentsRenderContext();

  return (
    <div
      data-agent-message-id={message.id}
      data-agent-turn-id={turnId}
      data-ui-plugin="agent-message-attachments"
    >
      <AgentAttachments ariaLabel="消息附件">
        {items.map((item) => (
          <AgentAttachment
            key={item.key}
            name={item.name}
            kind={item.kind}
            leading={kindLabels[item.kind]}
            {...(item.href === undefined ? {} : { href: item.href })}
          />
        ))}
      </AgentAttachments>
    </div>
  );
}
