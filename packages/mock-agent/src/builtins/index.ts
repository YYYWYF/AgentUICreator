import { multiToolScenario } from "./multi-tool.js";
import { reasoningChatScenario } from "./reasoning-chat.js";
import { reasoningToolSuccessScenario } from "./reasoning-tool-success.js";
import { simpleChatScenario } from "./simple-chat.js";

export {
  multiToolScenario,
  reasoningChatScenario,
  reasoningToolSuccessScenario,
  simpleChatScenario,
};

export const builtinMockScenarios = [
  simpleChatScenario,
  reasoningChatScenario,
  reasoningToolSuccessScenario,
  multiToolScenario,
];
