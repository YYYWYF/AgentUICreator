import { multiToolScenario } from "./multi-tool.js";
import { reasoningChatScenario } from "./reasoning-chat.js";
import { reasoningLongPreviewScenario } from "./reasoning-long-preview.js";
import { reasoningToolSuccessScenario } from "./reasoning-tool-success.js";
import { simpleChatScenario } from "./simple-chat.js";

export {
  multiToolScenario,
  reasoningChatScenario,
  reasoningLongPreviewScenario,
  reasoningToolSuccessScenario,
  simpleChatScenario,
};

export const builtinMockScenarios = [
  simpleChatScenario,
  reasoningChatScenario,
  reasoningLongPreviewScenario,
  reasoningToolSuccessScenario,
  multiToolScenario,
];
