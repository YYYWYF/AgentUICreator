import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  AgentUIPopover,
  AgentUIPopoverContent,
  AgentUIPopoverTrigger,
  CanonicalConversationThreadList,
  CanonicalConversationThreadListRailAction as RailImplementation,
  useAgentUILocale,
} from "@za38.03/agent-ui-plugins";
import { Clock } from "lucide-react";
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type ConversationService,
} from "../../services/conversations";
import { useAgentUITheme } from "../../agent-ui/theme/useAgentUITheme";
import { useAgentRun } from "../../runtime/context";
import "./assistant.css";

export function ConversationThreadListPlugin(
  props: ComponentProps<typeof CanonicalConversationThreadList>,
) {
  const conversation = usePluginService<ConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const theme = useAgentUITheme();
  const run = useAgentRun();
  const messages = useAgentUILocale("threadList");
  const [open, setOpen] = useState(false);
  const actions = useRef<{ close: () => void; unmount: () => void } | null>(
    null,
  );
  const previousConversationId = useRef(snapshot.activeConversationId);

  useEffect(() => {
    if (previousConversationId.current !== snapshot.activeConversationId) {
      actions.current?.close();
      previousConversationId.current = snapshot.activeConversationId;
    }
  }, [snapshot.activeConversationId]);

  return (
    <div className="conversation-thread-list-application">
      <AgentUIPopover
        actionsRef={actions}
        open={open}
        onOpenChange={(nextOpen, event) => {
          if (!event.isCanceled) setOpen(nextOpen);
        }}
      >
        <AgentUIPopoverTrigger
          className="conversation-thread-list-popover-trigger"
          aria-label={messages.historyTitle}
          title={messages.historyTitle}
        >
          <Clock aria-hidden="true" />
        </AgentUIPopoverTrigger>
        <AgentUIPopoverContent
          align="end"
          sideOffset={12}
          className="conversation-thread-list-popover"
          aria-label={messages.historyTitle}
        >
          <h2>{messages.historyTitle}</h2>
          <CanonicalConversationThreadList
            {...props}
            headerActions={props.renderSlot ? props.renderSlot("headerActions", props.headerActions ?? null) : props.headerActions}
            listProps={{ showSearch: true, ...props.listProps }}
            snapshot={snapshot}
            serviceAvailable={conversation !== undefined}
            onRefresh={() => conversation?.refresh()}
            theme={theme}
            runStatus={run.status}
          />
        </AgentUIPopoverContent>
      </AgentUIPopover>
    </div>
  );
}

export function ConversationThreadListRailAction(
  props: ComponentProps<typeof RailImplementation>,
) {
  const conversation = usePluginService<ConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  return (
    <RailImplementation enabled={conversation !== undefined} {...props} />
  );
}
