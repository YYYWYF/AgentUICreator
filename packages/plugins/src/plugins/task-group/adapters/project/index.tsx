import { CanonicalTaskGroupPlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {usePluginRenderScope} from "../../runtime/plugins";

export function TaskGroupPlugin(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const scope=usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if(scope?.kind!=="conversation.task-group")return null;
  return <Implementation {...scope.value} {...props} />;
}
