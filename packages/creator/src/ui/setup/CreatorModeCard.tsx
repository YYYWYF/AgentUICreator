import type { CreatorProjectMode, CreatorWorkspaceSetupInfo } from "../../workspace/types.js";

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
  return (
    <button
      className="creator-project-mode-card"
      type="button"
      aria-pressed={selected}
      data-selected={selected}
      disabled={disabled}
      onClick={() => onSelect(mode.id)}
    >
      <strong>{mode.title}</strong>
      <span>{modeDescriptions[mode.id] ?? mode.description}</span>
    </button>
  );
}
