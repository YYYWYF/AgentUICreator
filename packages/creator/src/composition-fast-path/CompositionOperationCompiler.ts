import type {
  CompiledCompositionMutation,
  CompositionFastPathFallbackReason,
  ResolvedCompositionIntent,
} from "./types.js";

type CompilationResult =
  | { ok: true; mutation: CompiledCompositionMutation }
  | { ok: false; reason: CompositionFastPathFallbackReason };

export function compileCompositionOperations(
  intents: ResolvedCompositionIntent[],
): CompilationResult {
  const operations: unknown[] = [];
  const expectations: CompiledCompositionMutation["expectations"] = [];

  for (const intent of intents) {
    const instanceId = intent.instance.instanceId;
    switch (intent.action) {
      case "remove":
        if (intent.instance.mountedSlotId !== undefined) {
          operations.push({ type: "unmount_instance", instanceId });
        }
        operations.push({ type: "remove_instance", instanceId });
        expectations.push({ instanceId, mounted: false });
        break;
      case "enable":
        operations.push({
          type: "set_instance_enabled",
          instanceId,
          enabled: true,
        });
        expectations.push(
          intent.instance.mountedSlotId === undefined
            ? { instanceId, mounted: false }
            : {
                instanceId,
                pluginId: intent.instance.pluginId,
                slotId: intent.instance.mountedSlotId,
              },
        );
        break;
      case "disable":
        operations.push({
          type: "set_instance_enabled",
          instanceId,
          enabled: false,
        });
        expectations.push({ instanceId, mounted: false });
        break;
      case "unmount":
        operations.push({ type: "unmount_instance", instanceId });
        expectations.push({ instanceId, mounted: false });
        break;
      case "mount":
      case "move": {
        const slotId = intent.destinationSlotId;
        if (slotId === undefined) {
          return { ok: false, reason: "invalid_operation" };
        }
        operations.push({
          type:
            intent.action === "mount" &&
            intent.instance.mountedSlotId === undefined
              ? "mount_instance"
              : "move_instance",
          instanceId,
          slotId,
        });
        expectations.push(
          intent.instance.enabled
            ? { instanceId, pluginId: intent.instance.pluginId, slotId }
            : { instanceId, mounted: false },
        );
        break;
      }
    }
  }

  return operations.length === 0
    ? { ok: false, reason: "invalid_operation" }
    : { ok: true, mutation: { operations, expectations } };
}
