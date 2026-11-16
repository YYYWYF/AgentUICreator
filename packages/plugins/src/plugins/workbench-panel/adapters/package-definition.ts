import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { createWorkbenchPanelService, WORKBENCH_PANEL_SERVICE } from '@za38.03/agent-ui-plugins';
import { WorkbenchPanelPlugin } from './index';
import manifest from './manifest.json';
export const workbenchPanelPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  provides: ["agent-ui.workbench-panel"],
  inject: [],
  optionalInject: [],
  setup: ({ services }) => services.provide(WORKBENCH_PANEL_SERVICE, createWorkbenchPanelService()),
  Component: WorkbenchPanelPlugin,
};
export default workbenchPanelPlugin;
export { createWorkbenchPanelService, WORKBENCH_PANEL_SERVICE } from '@za38.03/agent-ui-plugins';
export type { WorkbenchPanelService, WorkbenchPanelSnapshot, WorkbenchPanelProps, WorkbenchPanelItem } from '@za38.03/agent-ui-plugins';
