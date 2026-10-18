/** @deprecated Compatibility wrapper for existing AppUIModel compositions. */
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { AssistantUiResponseFooterPlugin } from "../assistant-ui-response-footer";

export function AssistantUiMessageFooterPlugin(props: UIPluginComponentProps) {
  // Keep Slot ownership visible to the source verifier while sharing the
  // canonical response footer presentation with existing compositions.
  const actions = props.renderSlot("actions", null, { layout: "inline" });
  return <AssistantUiResponseFooterPlugin {...props} renderSlot={() => actions} />;
}
