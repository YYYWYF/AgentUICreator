import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { DEMO_DIALOG_SERVICE } from '../../services/demo-dialog';
import { createDemoDialogService } from './dialog-service';
import { FrontendToolDialogDemoPlugin } from './index';
import manifest from './manifest.json';
export const frontendToolDialogDemoPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  provides: [DEMO_DIALOG_SERVICE],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  setup({ services }) {
    services.provide(DEMO_DIALOG_SERVICE, createDemoDialogService());
  },
  Component: FrontendToolDialogDemoPlugin,
};
export default frontendToolDialogDemoPlugin;
