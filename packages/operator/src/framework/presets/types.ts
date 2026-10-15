import type { AgentUIPresetDefinition as BootstrapAgentUIPresetDefinition } from "../../bootstrap/index.js";
import type { AppUIModel } from "../contracts/app-ui-model";

export type AgentUIPresetDefinition = BootstrapAgentUIPresetDefinition<AppUIModel>;
