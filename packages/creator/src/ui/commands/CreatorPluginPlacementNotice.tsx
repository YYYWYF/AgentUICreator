import type { AgentUIPluginPlacementGuide } from "../../commands/types.js";
import { formatLocaleMessage, useCreatorLocale } from "../i18n/locale.js";

export function parsePluginPlacementGuide(value: unknown): AgentUIPluginPlacementGuide | undefined {
  if (typeof value !== "object" || value === null ||
    !("modelPath" in value) || typeof value.modelPath !== "string" ||
    !("pluginId" in value) || typeof value.pluginId !== "string" ||
    !("example" in value) || typeof value.example !== "string") return;
  const guide: AgentUIPluginPlacementGuide = { modelPath: value.modelPath, pluginId: value.pluginId, example: value.example };
  if ("target" in value && value.target !== undefined) {
    const target = value.target;
    if (typeof target !== "object" || target === null ||
      !("parentPluginId" in target) || typeof target.parentPluginId !== "string" ||
      !("slot" in target) || typeof target.slot !== "string") return;
    const cardinality = "cardinality" in target ? target.cardinality : undefined;
    if (cardinality !== undefined && cardinality !== "one" && cardinality !== "many") return;
    guide.target = { parentPluginId: target.parentPluginId, slot: target.slot, ...(cardinality ? { cardinality } : {}) };
  }
  return guide;
}

export function CreatorPluginPlacementNotice({ pluginId, pluginName, guide }: {
  pluginId: string;
  pluginName: string;
  guide?: AgentUIPluginPlacementGuide | undefined;
}) {
  const messages = useCreatorLocale("commands");
  return <section className="creator-markdown" aria-label={messages.manualPlacementTitle}>
    <p>{formatLocaleMessage(messages.preparedNeedsPlacement, pluginName, pluginId)}</p>
    {guide ? <>
      <p>{messages.manualPlacementFile} <code>{guide.modelPath}</code></p>
      <p>{guide.target
        ? formatLocaleMessage(messages.manualPlacementSlot, guide.target.parentPluginId, guide.target.slot)
        : messages.manualPlacementInstance}</p>
      {guide.target?.cardinality === "one" ? <p>{messages.manualPlacementSingle}</p> :
        guide.target?.cardinality === "many" ? <p>{messages.manualPlacementMany}</p> : null}
      <pre aria-label={messages.manualPlacementExample}><code>{guide.example}</code></pre>
      <p>{messages.manualPlacementPreserve}</p>
      <p>{messages.manualPlacementRefresh}</p>
    </> : null}
  </section>;
}
