import { useConversationActions } from "../../services/hooks/useConversationActions";
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
import { useConversations } from "../../services/hooks/useConversations";
import { useAgentUITheme } from "@za38.03/agent-ui-runtime/ui";
import { useAgentRun } from "@za38.03/agent-ui-runtime";
import "./assistant.css";

export function ConversationThreadListPlugin(
  props: ComponentProps<typeof CanonicalConversationThreadList>,
) {
  const { snapshot, serviceAvailable } = useConversations();
  const { refresh } = useConversationActions();
  const theme = useAgentUITheme();
  const run = useAgentRun();
  const messages = useAgentUILocale("threadList");
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
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
          ref={popupRef}
          initialFocus={(interactionType) => {
            const popup = popupRef.current;
            const search = popup?.querySelector<HTMLElement>('[role="searchbox"], input[type="search"]');
            // Preserve touch keyboard behavior and focus access without moving the Host.
            const target = interactionType === "touch" ? popup : search ?? popup;
            target?.focus({ preventScroll: true });
            return false;
          }}
          align="end"
          sideOffset={12}
          className="conversation-thread-list-popover"
          aria-label={messages.historyTitle}
        >
          <h2>{messages.historyTitle}</h2>
          <CanonicalConversationThreadList
            {...props}
            headerActions={props.renderSlot ? props.renderSlot("headerActions", props.headerActions ?? null) : props.headerActions}
            showSearch={props.showSearch ?? true}
            snapshot={snapshot}
            serviceAvailable={serviceAvailable}
            onRefresh={refresh}
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
  const { serviceAvailable } = useConversations();
  return (
    <RailImplementation enabled={serviceAvailable} {...props} />
  );
}
