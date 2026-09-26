import { z } from "zod";
import { defineFrontendTool } from "../runtime/tools";
import { DEMO_DIALOG_SERVICE, type DemoDialogService } from "../services/demo-dialog";

/** Application-owned allowlist; capability existence alone grants no permission. */
export const appFrontendTools = [defineFrontendTool({
  name: "open_demo_dialog",
  description: "Open a dialog in the current application for the user.",
  inputSchema: z.strictObject({ title: z.string().min(1), message: z.string().min(1) }),
  requires: [DEMO_DIALOG_SERVICE],
  execute({ services, signal }, input) {
    if (signal.aborted) throw new DOMException("Frontend tool execution aborted", "AbortError");
    const dialog = services.get<DemoDialogService>(DEMO_DIALOG_SERVICE);
    if (dialog === undefined) throw new Error("Dialog capability unavailable");
    dialog.open(input);
    return { opened: true, title: input.title };
  },
})];
