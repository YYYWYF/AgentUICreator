import { CanonicalTaskGroupPlugin as Implementation } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import { usePluginRenderScope } from '@za38.03/agent-ui-runtime/ui/runtime/plugins/index';
import type { ComponentProps } from 'react';

export function TaskGroupPlugin(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== 'conversation.task-group') {
    return null;
  }
  return <Implementation {...scope.value} {...props} />;
}
