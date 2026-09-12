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

export interface AssistantUiComposerQuickPrompt {
  id: string;
  label: string;
  value: string;
  description?: string;
}

export interface AssistantUiComposerConfig {
  placeholder?: string;
  quickPrompts: readonly AssistantUiComposerQuickPrompt[];
}

export interface AssistantUiPresentationConfig {
  welcome: AssistantUiWelcomeConfig;
  starterSuggestions: readonly AssistantUiStarterSuggestion[];
  composer: AssistantUiComposerConfig;
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

function readComposerQuickPrompts(
  value: unknown,
): AssistantUiComposerQuickPrompt[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    const stringPrompt = readNonEmptyString(item);
    if (stringPrompt !== undefined) {
      return [{
        id: `suggestion-${index}`,
        label: stringPrompt,
        value: stringPrompt,
      }];
    }

    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const label = readNonEmptyString(record.label);
    const promptValue = readNonEmptyString(record.value);
    if (label === undefined || promptValue === undefined) return [];

    const id = readNonEmptyString(record.id) ??
      readNonEmptyString(record.key) ??
      `suggestion-${index}`;
    const description = readNonEmptyString(record.description);
    return [{
      id,
      label,
      value: promptValue,
      ...(description === undefined ? {} : { description }),
    }];
  });
}

export function resolveAssistantUiPresentationConfig(
  model: AppUIModel,
): AssistantUiPresentationConfig {
  const welcomeProps = model.pluginInstances["agent-welcome-main"]?.props;
  const suggestionsProps = model.pluginInstances["agent-prompts-main"]?.props;
  const composerProps = model.pluginInstances["agent-sender-main"]?.props;
  const title = readNonEmptyString(welcomeProps?.title);
  const description = readNonEmptyString(welcomeProps?.description);
  const placeholder = readNonEmptyString(composerProps?.placeholder);

  return {
    welcome: {
      ...(title === undefined ? {} : { title }),
      ...(description === undefined ? {} : { description }),
    },
    starterSuggestions: readStarterSuggestions(suggestionsProps?.items),
    composer: {
      ...(placeholder === undefined ? {} : { placeholder }),
      quickPrompts: readComposerQuickPrompts(composerProps?.suggestions),
    },
  };
}
