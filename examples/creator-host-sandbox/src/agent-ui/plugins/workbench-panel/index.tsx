import { WorkbenchPanelPlugin as Implementation } from '@za38.03/agent-ui-plugins/workbench-panel';
import type { ComponentProps } from 'react';
export function WorkbenchPanelPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props} />;
}
