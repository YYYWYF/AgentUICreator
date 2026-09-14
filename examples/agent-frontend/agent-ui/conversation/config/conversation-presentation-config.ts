import type { AppUIRuntimeModel } from "../../../framework/contracts/app-ui-runtime-model";

export interface ConversationWelcomeConfig {
  title?: string;
  description?: string;
}

export interface ConversationPresentationConfig {
  welcome: ConversationWelcomeConfig;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readWelcome(value: unknown): ConversationWelcomeConfig {
  const record = readRecord(value);
  const title = readNonEmptyString(record.title);
  const description = readNonEmptyString(record.description);
  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
  };
}

export function resolveConversationPresentationConfig(
  model: AppUIRuntimeModel,
): ConversationPresentationConfig {
  const surfaceProps = model.pluginInstances[
    "agent-conversation-surface-main"
  ]?.props;
  const conversationPresentation = readRecord(
    surfaceProps?.conversationPresentation,
  );
  const welcomeProps = readRecord(conversationPresentation.welcome);

  return {
    welcome: readWelcome(welcomeProps),
  };
}
