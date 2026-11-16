import { WorkbenchPanelActionsPlugin as Implementation } from '@za38.03/agent-ui-plugins/workbench-panel-actions';
import type { ComponentProps } from 'react';
export function WorkbenchPanelActionsPlugin(props: ComponentProps<typeof Implementation>) { return <Implementation {...props} />; }
