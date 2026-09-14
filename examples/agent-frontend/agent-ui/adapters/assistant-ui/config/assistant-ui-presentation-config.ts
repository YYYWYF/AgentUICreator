import type { AppUIModel } from "../../../../framework/contracts/app-ui-model";

export interface AssistantUiWelcomeConfig {
  title?: string;
  description?: string;
}

export interface AssistantUiPresentationConfig {
  welcome: AssistantUiWelcomeConfig;
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

function readWelcome(value: unknown): AssistantUiWelcomeConfig {
  const record = readRecord(value);
  const title = readNonEmptyString(record.title);
  const description = readNonEmptyString(record.description);
  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
  };
}

export function resolveAssistantUiPresentationConfig(
  model: AppUIModel,
): AssistantUiPresentationConfig {
  const surfaceProps = model.pluginInstances[
    "agent-conversation-surface-main"
  ]?.props;
  const assistantUiPresentation = readRecord(
    surfaceProps?.assistantUiPresentation,
  );
  const welcomeProps = readRecord(assistantUiPresentation.welcome);

  return {
    welcome: readWelcome(welcomeProps),
  };
}
