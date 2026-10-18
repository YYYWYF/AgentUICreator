import { TaskGroupPlugin as Implementation } from "@za38.03/agent-ui-plugins/task-group";
import type { ComponentProps } from "react";
import {usePluginRenderScope} from "../../runtime/plugins";

export function TaskGroupPlugin(props: ComponentProps<typeof Implementation>) {
  const scope=usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if(scope?.kind!=="conversation.task-group")return null;
  return <Implementation {...scope.value} {...props} />;
}
