import type { CreatorProjectMode, CreatorWorkspaceSetupInfo } from "../../workspace/types.js";
import { Blocks, Check, LayoutDashboard, PanelRight } from "lucide-react";
import { Button } from "../components/button.js";

interface CreatorModeCardProps {
  mode: CreatorWorkspaceSetupInfo["modes"][number];
  selected: boolean;
  disabled: boolean;
  onSelect(mode: CreatorProjectMode): void;
}

const modeDescriptions: Record<CreatorProjectMode, string> = {
  assistant: "全局 AI 助手 / Copilot，适合接入已有应用。",
  embedded: "嵌入业务页面，适合具体业务场景。",
  platform: "完整 Agent 工作台，适合独立 Agent 产品。",
};

export function CreatorModeCard({ mode, selected, disabled, onSelect }: CreatorModeCardProps) {
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
      <strong>{mode.title}</strong>
      <span>{modeDescriptions[mode.id] ?? mode.description}</span>
    </Button>
  );
}
