import type { AgentUIMode } from "../contracts/agent-ui-mode";
import type { AppUIModel } from "../contracts/app-ui-model";

export interface AgentUIPresetDefinition {
  readonly id: string;
  readonly mode: AgentUIMode;

  /** Returns a fresh initial AppUIModel for each project initialization. */
  createAppUIModel(): AppUIModel;

  /** Source Registry foundations required by this initial composition. */
  readonly sourceItems?: readonly string[];
}
