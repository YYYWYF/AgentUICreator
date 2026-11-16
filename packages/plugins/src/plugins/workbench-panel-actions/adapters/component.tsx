import { WorkbenchPanelActions, usePluginService, WORKBENCH_PANEL_SERVICE, type WorkbenchPanelActionsProps, type WorkbenchPanelService } from '@za38.03/agent-ui-plugins';
import './styles.css';
export function WorkbenchPanelActionsPlugin(props: WorkbenchPanelActionsProps) {
  const service = usePluginService<WorkbenchPanelService>(WORKBENCH_PANEL_SERVICE);
  return <WorkbenchPanelActions service={service} {...props} />;
}
