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
 * Opens a forward dialog when clicked. The dialog currently renders a title,
 * a description placeholder and a close control; the actual forwarding logic
 * (target selection, sending) is intentionally left for application follow-up
 * development in this file.
 */
export function ConversationForwardActionPlugin() {
  const messages = useAgentUILocale("conversationForward");
  const [open, setOpen] = useState(false);
  const forwardButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="ui-forward-action">
      <Button
        type="button"
        ref={forwardButtonRef}
        onClick={() => setOpen(true)}
      >
        {messages.forward}
      </Button>
      <AgentUIDialog.Root
        open={open}
        onOpenChange={(nextOpen) => setOpen(nextOpen)}
      >
        <AgentUIDialogContent
          className="ui-forward-action__dialog"
          finalFocus={forwardButtonRef}
        >
          <AgentUIDialog.Title className="ui-forward-action__title">
            {messages.dialogTitle}
          </AgentUIDialog.Title>
          <p className="ui-forward-action__description">
            {messages.dialogDescription}
          </p>
          <div className="ui-forward-action__footer">
            <Button type="button" onClick={() => setOpen(false)}>
              {messages.close}
            </Button>
          </div>
        </AgentUIDialogContent>
      </AgentUIDialog.Root>
    </div>
  );
}
