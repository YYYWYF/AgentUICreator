import { parseAppUIModel, type AppUIModel } from "../framework/contracts/app-ui-model";
import { compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import { collectPluginProjectFacts, generatePluginRegistryFromFacts } from "./registry-generator";
import { verifyPluginChildSlots } from "./plugin-child-slot-verifier";
import type { PluginProjectFacts, UIProjectControlConfig } from "./types";
import type { AgentUIProjectPaths } from "./agent-ui-project-paths";

class CandidateAdmissionError extends Error {
  constructor(public code: string, message: string, public details: unknown) { super(message); }
}
export async function admitAppUIModelCandidate(
  projectRoot: string, candidate: unknown, config: UIProjectControlConfig,
  paths: AgentUIProjectPaths, projectFacts?: PluginProjectFacts,
) {
  const model: AppUIModel = parseAppUIModel(candidate);
  const facts = projectFacts ?? await collectPluginProjectFacts(projectRoot, config, paths);
  const generation = generatePluginRegistryFromFacts(model, facts);
  if (generation.errors.length > 0) {
    throw new CandidateAdmissionError(
      "PLUGIN_REGISTRY_GENERATION_FAILED",
      "The transaction cannot resolve a complete capability catalog and Active Registry.",
      { issues: generation.errors, workspaceIntegrity: facts.inventoryIssues.length > 0 || generation.errors.some(issue => issue.code.startsWith("selected-plugin-definition") || issue.code === "selected-plugin-default-export-missing") },
    );
  }
  const runtimeModel = compileAppUIModel(
    model,
    generation.activeComposition.compositionCatalog,
  );
  const selectedPluginIdSet = new Set(
    generation.activeComposition.selectedPluginIds,
  );
  const childSlotIssues = await verifyPluginChildSlots(
    projectRoot,
    generation.assets.filter((asset) => selectedPluginIdSet.has(asset.pluginId)),
  );
  if (childSlotIssues.length > 0) {
    throw new CandidateAdmissionError(
      "PLUGIN_CHILD_SLOT_CONTRACT_INVALID",
      "Selected UI plugins contain inconsistent child Slot contracts.",
      { issues: childSlotIssues },
    );
  }
  return { model, generation, runtimeModel };
}
