import { WorkbenchPanel, usePluginService, type WorkbenchPanelProps, type WorkbenchPanelService, WORKBENCH_PANEL_SERVICE } from '@za38.03/agent-ui-plugins';
import './styles.css';
export function WorkbenchPanelPlugin(props: WorkbenchPanelProps) {
  const service = usePluginService<WorkbenchPanelService>(WORKBENCH_PANEL_SERVICE);
  return <WorkbenchPanel service={service} {...props} />;
}
