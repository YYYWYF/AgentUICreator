import type { AppUIModel } from "../../../../framework/contracts/app-ui-model";

export interface AssistantUiWelcomeConfig {
  title?: string;
  description?: string;
}

export interface AssistantUiStarterSuggestion {
  title: string;
  label?: string;
  prompt: string;
}

export type AssistantUiToolGroupVariant = "ghost" | "outline" | "muted";
export type AssistantUiReasoningVariant = "ghost" | "outline" | "muted";

export interface AssistantUiInteractionPresentationConfig {
  reasoningVariant?: AssistantUiReasoningVariant;
  toolGroupVariant?: AssistantUiToolGroupVariant;
}

export interface AssistantUiPresentationConfig {
  welcome: AssistantUiWelcomeConfig;
  starterSuggestions: readonly AssistantUiStarterSuggestion[];
  interactions: AssistantUiInteractionPresentationConfig;
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

function readToolGroupVariant(
  value: unknown,
): AssistantUiToolGroupVariant | undefined {
  return value === "ghost" || value === "outline" || value === "muted"
    ? value
    : undefined;
}

function readReasoningVariant(
  value: unknown,
): AssistantUiReasoningVariant | undefined {
  return value === "ghost" || value === "outline" || value === "muted"
    ? value
    : undefined;
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

function readStarterSuggestions(value: unknown): AssistantUiStarterSuggestion[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const stringSuggestion = readNonEmptyString(item);
    if (stringSuggestion !== undefined) {
      return [{ title: stringSuggestion, prompt: stringSuggestion }];
    }

    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const explicitTitle = readNonEmptyString(record.title);
    const title = explicitTitle ?? readNonEmptyString(record.label);
    if (title === undefined) return [];

    const label = explicitTitle === undefined
      ? readNonEmptyString(record.description)
      : readNonEmptyString(record.label);
    const prompt = readNonEmptyString(record.prompt) ??
      readNonEmptyString(record.value) ??
      title;
    return [{
      title,
      ...(label === undefined ? {} : { label }),
      prompt,
    }];
  });
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
  const interactionsProps = readRecord(assistantUiPresentation.interactions);
  const reasoningVariant = readReasoningVariant(
    interactionsProps.reasoningVariant,
  );
  const toolGroupVariant = readToolGroupVariant(
    interactionsProps.toolGroupVariant,
  );

  return {
    welcome: readWelcome(welcomeProps),
    starterSuggestions: readStarterSuggestions(
      assistantUiPresentation.starterSuggestions,
    ),
    interactions: {
      ...(reasoningVariant === undefined ? {} : { reasoningVariant }),
      ...(toolGroupVariant === undefined ? {} : { toolGroupVariant }),
    },
  };
}
