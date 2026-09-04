import type {
  CompositionFastPathFallbackReason,
  CompositionFastPathPlan,
  CompositionSummary,
  CompositionSummaryInstance,
  ResolvedCompositionIntent,
} from "./types.js";

type ResolutionResult =
  | { ok: true; intents: ResolvedCompositionIntent[] }
  | { ok: false; reason: CompositionFastPathFallbackReason };

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}\s_]+/gu, "");
}

function normalizedTargetForms(value: string): Set<string> {
  const base = normalize(value);
  const forms = new Set(base === "" ? [] : [base]);
  for (const generic of ["plugin", "插件", "instance", "实例"]) {
    if (base.startsWith(generic) && base.length > generic.length) {
      forms.add(base.slice(generic.length));
    }
    if (base.endsWith(generic) && base.length > generic.length) {
      forms.add(base.slice(0, -generic.length));
    }
  }
  return forms;
}

function targetAliases(instance: CompositionSummaryInstance): Set<string> {
  const aliases = new Set<string>();
  for (const value of [
    instance.instanceId,
    instance.instanceId.replace(/-main$/u, ""),
    instance.pluginId,
    instance.displayName,
    ...instance.semanticNames,
  ]) {
    if (value === undefined) continue;
    for (const normalized of normalizedTargetForms(value)) {
      aliases.add(normalized);
    }
  }
  return aliases;
}

function resolveTarget(
  target: string,
  composition: CompositionSummary,
):
  | { ok: true; instance: CompositionSummaryInstance }
  | { ok: false; reason: CompositionFastPathFallbackReason } {
  const targetForms = normalizedTargetForms(target);
  const matches = composition.instances.filter((instance) =>
    [...targetForms].some((form) => targetAliases(instance).has(form)),
  );
  if (matches.length === 0) return { ok: false, reason: "target_not_found" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous_target" };
  return { ok: true, instance: matches[0]! };
}

function resolveSlot(
  destination: string,
  composition: CompositionSummary,
):
  | { ok: true; slotId: string }
  | { ok: false; reason: CompositionFastPathFallbackReason } {
  const normalizedDestination = normalize(destination);
  const matches = composition.slots.filter(({ slotId }) => {
    const segments = slotId.split(".");
    const leaf = segments.at(-1) ?? slotId;
    return (
      normalize(slotId) === normalizedDestination ||
      normalize(leaf) === normalizedDestination
    );
  });
  if (matches.length === 0) return { ok: false, reason: "slot_not_found" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous_slot" };
  return { ok: true, slotId: matches[0]!.slotId };
}

export function resolveCompositionTargets(
  plan: Extract<CompositionFastPathPlan, { mode: "composition" }>,
  composition: CompositionSummary,
): ResolutionResult {
  const resolved: ResolvedCompositionIntent[] = [];
  const resolvedInstanceIds = new Set<string>();
  for (const intent of plan.intents) {
    const target = resolveTarget(intent.target, composition);
    if (!target.ok) return target;
    if (resolvedInstanceIds.has(target.instance.instanceId)) {
      return { ok: false, reason: "invalid_operation" };
    }
    resolvedInstanceIds.add(target.instance.instanceId);
    if (intent.action === "mount" || intent.action === "move") {
      const slot = resolveSlot(intent.destination, composition);
      if (!slot.ok) return slot;
      resolved.push({
        action: intent.action,
        instance: target.instance,
        destinationSlotId: slot.slotId,
      });
    } else {
      resolved.push({ action: intent.action, instance: target.instance });
    }
  }
  return { ok: true, intents: resolved };
}
