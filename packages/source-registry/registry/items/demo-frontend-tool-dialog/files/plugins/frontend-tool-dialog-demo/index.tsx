import { Dialog } from "@base-ui/react/dialog";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import { DEMO_DIALOG_SERVICE, type DemoDialogService, type DemoDialogSnapshot } from "../../services/demo-dialog";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import "./styles.css";
const closed: DemoDialogSnapshot = { open: false, title: "", message: "" };
export function FrontendToolDialogDemoPlugin() {
  const dialog = usePluginService<DemoDialogService>(DEMO_DIALOG_SERVICE);
  const snapshot = usePluginServiceSnapshot(dialog, closed);
  const locale = useAgentUILocale("frontendTools");
  return <Dialog.Root open={snapshot.open} onOpenChange={open => { if (!open) dialog?.close(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="frontend-tool-dialog-backdrop" />
      <Dialog.Popup className="frontend-tool-dialog-popup">
        <Dialog.Title>{snapshot.title}</Dialog.Title>
        <Dialog.Description>{snapshot.message}</Dialog.Description>
        <Dialog.Close>{locale.close}</Dialog.Close>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
