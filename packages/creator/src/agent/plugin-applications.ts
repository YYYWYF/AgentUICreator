import { preparePluginEnablement, completePluginEnablement, type PluginEnablementPreparation } from "@za38.03/agent-ui-creator/project/commands";
import { interrupt } from "@langchain/langgraph";
import { inspectProject } from "./inspection.js";
import { cancelExecution } from "./execution-decision.js";
import type { ToolContext } from "./tools.js";
import { defaultAgentMessages } from "./messages.js";

/** Composition must use the installed Plugin's project application and Host
 * bindings. Preparing that thin layer is separate from implementation takeover. */
export async function prepareCompositionApplications(context: ToolContext, input: { operations?: any[] }) {
  const messages = context.messages ?? defaultAgentMessages;
  const ids = new Set<string>();
  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.pluginId === "string") ids.add(value.pluginId);
    for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === "object") visit(child);
  };
  for (const operation of input.operations ?? []) visit(operation);
  const enabled = (input.operations ?? []).filter(operation => operation.type === "set_plugin_enabled" && operation.enabled);
  const actions = (input.operations ?? []).filter(operation => operation.type === "execute_creator_action");
  if (enabled.length || actions.length) {
    const project = await inspectProject(context, { view: "composition" });
    for (const operation of enabled) {
      const instance = project.pluginInstances?.find((item: any) => item.id === operation.instanceId);
      if (instance) ids.add(instance.pluginId);
    }
    for (const operation of actions) {
      const action = project.creatorActions?.candidates?.find((item: any) => item.actionId === operation.actionId);
      if (action?.kind === "add_existing_plugin") ids.add(action.target.pluginId);
    }
  }
  const plans: PluginEnablementPreparation[] = [];
  for (const pluginId of ids) {
    context.signal.throwIfAborted();
    let plan;
    try { plan = await preparePluginEnablement(context.root, pluginId); }
    catch (error) {
      // Custom Plugins do not have an installed official application recipe.
      if ((error as Error).message === "PLUGIN_UNAVAILABLE") continue;
      throw error;
    }
    if (plan.packages.length) throw Object.assign(new Error("PLUGIN_ENABLEMENT_DEPENDENCIES_REQUIRED: Use Creator /enable to review and install this Plugin's required packages before composition."), { code: "PLUGIN_ENABLEMENT_DEPENDENCIES_REQUIRED", preparation: plan });
    if (!plan.files.length) continue;
    plans.push(plan);
  }
  // One checkpoint-bound preparation per native tool call avoids changing the
  // interrupt replay order after an earlier application has been created.
  if (plans.length > 1) throw new Error("PLUGIN_APPLICATION_PREPARATION_BATCH_REQUIRED: Split additions of missing npm applications into separate mutate_app_ui_model calls; preserve every requested Plugin.");
  for (const plan of plans) {
    const pluginId = plan.pluginId;
    const key = `plugin-application-${pluginId}-${plan.stateHash}`;
    const answer: any = interrupt({ kind: "ask_user_question", steps: [{ id: key,
      question: messages.pluginApplicationQuestion.replace("{0}", pluginId),
      description: JSON.stringify({ pluginId, files: plan.files, implementationOwnership: "npm", sourceTakeover: false }),
      options: [{ id: "approve", label: messages.approvePluginApplication }, { id: "decline", label: messages.cancel }],
      selectionMode: "single", minSelections: 1, maxSelections: 1 }] });
    if (!(key in (answer.answers ?? {}))) throw new Error("PLUGIN_ENABLEMENT_PREPARATION_STALE");
    if (answer.answers[key]?.[0] !== "approve") return cancelExecution(context, "mutate_app_ui_model");
    context.signal.throwIfAborted();
    const snapshot = await context.activity.captureSource();
    let result;
    try {
      const applied = await completePluginEnablement(context.root, plan);
      result = { ...applied, changedPaths: applied.createdPaths };
    } finally { await context.activity.observeOperatorChanges(snapshot, result); }
    context.signal.throwIfAborted();
  }
  return undefined;
}
