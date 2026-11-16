import { useAgentUILocale } from '../../../../public.js';
import type { WorkbenchPanelService } from '../../../../public.js';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
export interface WorkbenchPanelActionsProps extends Partial<UIPluginComponentProps> {
  service?: WorkbenchPanelService | undefined;
  items?: readonly { id: string; label: string }[] | undefined;
}
export function WorkbenchPanelActions({ service, items }: WorkbenchPanelActionsProps) {
  const messages = useAgentUILocale('workbenchPanel');
  const choices = items ?? [{ id: 'notes', label: messages.notes }, { id: 'details', label: messages.details }];
  return <nav data-ui-plugin="workbench-panel-actions" className="workbench-panel-actions" aria-label={messages.open}>
    {choices.map(item => <button key={item.id} type="button" disabled={!service}
      onClick={() => service?.open(item.id)}>{item.label}</button>)}
  </nav>;
}
