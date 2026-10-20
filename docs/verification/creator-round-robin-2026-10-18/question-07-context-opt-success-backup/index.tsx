import {
  AgentUIDialog,
  AgentUIDialogContent,
  Button,
} from "@za38.03/agent-ui-plugins";
import { useRef, useState } from "react";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import "./styles.css";

/**
 * Forward action for the assistant response footer.
 *
 * Opens a centered forward dialog when clicked. The dialog renders a title,
 * a description placeholder and a close control; the actual forwarding logic
 * (target selection, sending) is intentionally left for application follow-up
 * development in this file.
 *
 * Closing paths (close button, Escape, backdrop pointer dismissal) all flow
 * through the controlled `onOpenChange`; `finalFocus` returns focus to the
 * forward button when the dialog closes.
 */
export function ConversationForwardActionPlugin() {
  const messages = useAgentUILocale("conversationForward");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="ui-forward-action">
      <Button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        {messages.forward}
      </Button>
      <AgentUIDialog.Root
        open={open}
        onOpenChange={(nextOpen) => setOpen(nextOpen)}
      >
        <AgentUIDialogContent
          className="ui-forward-action__dialog"
          showCloseButton={false}
          finalFocus={triggerRef}
        >
          <AgentUIDialog.Title className="ui-forward-action__title">
            {messages.dialogTitle}
          </AgentUIDialog.Title>
          <p className="ui-forward-action__description">
            {messages.dialogDescription}
          </p>
          <div className="ui-forward-action__footer">
            <AgentUIDialog.Close render={<Button type="button" />}>
              {messages.close}
            </AgentUIDialog.Close>
          </div>
        </AgentUIDialogContent>
      </AgentUIDialog.Root>
    </div>
  );
}
