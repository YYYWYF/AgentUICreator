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

export interface AssistantUiPresentationConfig {
  welcome: AssistantUiWelcomeConfig;
  starterSuggestions: readonly AssistantUiStarterSuggestion[];
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
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
    const title = readNonEmptyString(record.label);
    if (title === undefined) return [];

    const label = readNonEmptyString(record.description);
    const prompt = readNonEmptyString(record.prompt) ?? title;
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
  const welcomeProps = model.pluginInstances["agent-welcome-main"]?.props;
  const suggestionsProps = model.pluginInstances["agent-prompts-main"]?.props;
  const title = readNonEmptyString(welcomeProps?.title);
  const description = readNonEmptyString(welcomeProps?.description);

  return {
    welcome: {
      ...(title === undefined ? {} : { title }),
      ...(description === undefined ? {} : { description }),
    },
    starterSuggestions: readStarterSuggestions(suggestionsProps?.items),
  };
}
