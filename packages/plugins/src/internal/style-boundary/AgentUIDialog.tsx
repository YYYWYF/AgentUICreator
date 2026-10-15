import { Dialog } from "@base-ui/react/dialog";

import { useAgentUIPortalContainer } from "./AgentUIRoot.js";

function AgentUIDialogPortal(props: Omit<Dialog.Portal.Props, "container">) {
  const container = useAgentUIPortalContainer();
  if (container === null) return null;
  return <Dialog.Portal {...props} {...(container === undefined ? {} : { container })} />;
}

/** Portal-aware primitives for Plugin-owned Dialog presentation. */
export const AgentUIDialog = {
  Root: Dialog.Root,
  Trigger: Dialog.Trigger,
  Portal: AgentUIDialogPortal,
  Backdrop: Dialog.Backdrop,
  Popup: Dialog.Popup,
  Title: Dialog.Title,
  Description: Dialog.Description,
  Close: Dialog.Close,
};
