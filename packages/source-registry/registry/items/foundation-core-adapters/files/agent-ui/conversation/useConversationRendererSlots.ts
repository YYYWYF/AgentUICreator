import { useSyncExternalStore } from "react";
import { usePluginInstance } from "../../runtime/context";
import { usePluginServiceRuntime } from "../../runtime/plugins";
import { resolveRuntimePluginSlotId } from "../../framework/contracts/app-ui-composition";

/** Active contributions, owned by the existing runtime SlotRegistry. */
export function useConversationRendererSlots() {
  const instance = usePluginInstance();
  const runtime = usePluginServiceRuntime();
  useSyncExternalStore(runtime.subscribe, runtime.getRevision, runtime.getRevision);
  const active = (slot: string) => {
    const contributions = runtime.slots.getContributions(resolveRuntimePluginSlotId(instance.id, slot));
    return contributions.length === 1 && runtime.getActivation(contributions[0]!.instanceId)?.status === "active";
  };
  const timeline = useSyncExternalStore(runtime.slots.subscribe, () => active("toolTimeline"), () => false);
  const reasoning = useSyncExternalStore(runtime.slots.subscribe, () => active("reasoningGroup"), () => false);
  const thinking = useSyncExternalStore(runtime.slots.subscribe, () => active("thinkingIndicator"), () => false);
  return { toolTimeline: timeline, reasoningGroup: reasoning, thinkingIndicator: thinking };
}
