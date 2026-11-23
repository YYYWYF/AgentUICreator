import type { CreatorCommandExecuteRequest, CreatorCommandResult } from "../../commands/types.js";
import { formatLocaleMessage, type CreatorLocaleMessages } from "../i18n/locale.js";

export async function confirmPluginSourceTakeover(
  request: CreatorCommandExecuteRequest,
  result: CreatorCommandResult,
  messages: CreatorLocaleMessages["commands"],
  pluginLabel: (id: string) => string,
  confirm: (message: string) => boolean,
  execute: (request: CreatorCommandExecuteRequest) => Promise<CreatorCommandResult>,
): Promise<CreatorCommandResult | undefined> {
  if (result.status !== "confirmation-required") return result;
  if (request.id !== "takeover" || !result.takeover || result.takeover.plan.pluginId !== request.args.pluginId) throw new Error("PLUGIN_SOURCE_PLAN_STALE");
  const { id, plan } = result.takeover;
  const details = [
    `${plan.package.name}@${plan.package.version}`,
    formatLocaleMessage(messages.takeoverPluginVersion, plan.pluginVersion),
    plan.overwriteDirectory ? formatLocaleMessage(messages.takeoverOverwrite, plan.overwriteDirectory) : "",
    formatLocaleMessage(messages.preparationFiles, plan.files.join("\n")),
    plan.applicationChanges.length ? formatLocaleMessage(messages.takeoverApplicationChanges, plan.applicationChanges.join("\n")) : "",
    plan.instances.length ? formatLocaleMessage(messages.takeoverInstances, plan.instances.join("\n")) : "",
    plan.dependencyChanges.length ? formatLocaleMessage(messages.preparationPackages, plan.dependencyChanges.join("\n")) : "",
    plan.sharedDependencies.length ? formatLocaleMessage(messages.takeoverSharedDependencies, plan.sharedDependencies.join("\n")) : "",
  ].filter(Boolean).join("\n\n");
  if (!confirm(formatLocaleMessage(messages.takeoverConfirm, pluginLabel(plan.pluginId), details))) return undefined;
  return execute({ id: "takeover", args: { pluginId: request.args.pluginId, preparationId: id } });
}
