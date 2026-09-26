import { parseUIPluginManifest, type UIPluginDefinition } from "../../../../../framework/contracts/ui-plugin";
import { DEMO_DIALOG_SERVICE } from "../../services/demo-dialog";
import { AGENT_UI_LOCALE_SERVICE } from "../../../../../services/agent-ui-locale";
import { FrontendToolDialogDemoPlugin } from "./index";
import { createDemoDialogService } from "./dialog-service";
import manifest from "./manifest.json";
export const frontendToolDialogDemoPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  provides: [DEMO_DIALOG_SERVICE],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  setup({ services }) { services.provide(DEMO_DIALOG_SERVICE, createDemoDialogService()); },
  Component: FrontendToolDialogDemoPlugin,
};
export default frontendToolDialogDemoPlugin;
