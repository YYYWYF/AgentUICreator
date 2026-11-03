import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages } from "../i18n/locale.js";
import type { CreatorProjectMode, CreatorWorkspaceSetupInfo } from "../../workspace/types.js";
import { Blocks, Check, LayoutDashboard, PanelRight } from "lucide-react";
import { Button } from "../components/button.js";

interface CreatorModeCardProps {
  mode: CreatorWorkspaceSetupInfo["modes"][number];
  selected: boolean;
  disabled: boolean;
  onSelect(mode: CreatorProjectMode): void;
}

function getModeDescriptions(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<CreatorProjectMode, string> { return {
  assistant: localeMessages.setup.globalAIAssistantCopilotForExistingApplications,
  embedded: localeMessages.setup.embeddedInABusinessPageForSpecificWorkflows,
  platform: localeMessages.setup.fullAgentWorkbenchForStandaloneAgentProducts,
}; }

export function CreatorModeCard({ mode, selected, disabled, onSelect }: CreatorModeCardProps) {
  const localeMessages = useAgentUILocale();
  const Icon = mode.id === "assistant" ? PanelRight : mode.id === "embedded" ? Blocks : LayoutDashboard;
  return (
    <Button variant="outline"
      className="creator-project-mode-card"
      type="button"
      aria-pressed={selected}
      data-selected={selected}
      disabled={disabled}
      onClick={() => onSelect(mode.id)}
    >
      <div className="creator-mode-icon"><Icon aria-hidden="true" /></div>
      {selected ? <Check className="creator-mode-check" aria-hidden="true" /> : null}
      <strong>{({ assistant: localeMessages.creatorWorkbench.assistant, embedded: localeMessages.creatorWorkbench.embedded, platform: localeMessages.creatorWorkbench.workbench })[mode.id]}</strong>
      <span>{getModeDescriptions(localeMessages)[mode.id] ?? mode.description}</span>
    </Button>
  );
}
