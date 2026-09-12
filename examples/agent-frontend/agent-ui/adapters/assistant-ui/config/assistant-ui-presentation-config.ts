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

export type AssistantUiToolGroupVariant = "ghost" | "outline" | "muted";

export interface AssistantUiInteractionPresentationConfig {
  toolGroupVariant: AssistantUiToolGroupVariant;
}

export interface AssistantUiPresentationConfig {
  welcome: AssistantUiWelcomeConfig;
  starterSuggestions: readonly AssistantUiStarterSuggestion[];
  composer: AssistantUiComposerConfig;
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

function readToolGroupVariant(value: unknown): AssistantUiToolGroupVariant {
  return value === "outline" || value === "muted" ? value : "ghost";
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
  const surfaceProps = model.pluginInstances[
    "agent-conversation-surface-main"
  ]?.props;
  const assistantUiPresentation = readRecord(
    surfaceProps?.assistantUiPresentation,
  );
  const welcomeProps = readRecord(assistantUiPresentation.welcome);
  const composerProps = readRecord(assistantUiPresentation.composer);
  const interactionsProps = readRecord(assistantUiPresentation.interactions);
  const placeholder = readNonEmptyString(composerProps.placeholder);

  return {
    welcome: readWelcome(welcomeProps),
    starterSuggestions: readStarterSuggestions(
      assistantUiPresentation.starterSuggestions,
    ),
    composer: {
      ...(placeholder === undefined ? {} : { placeholder }),
      quickPrompts: readComposerQuickPrompts(composerProps.quickPrompts),
    },
    interactions: {
      toolGroupVariant: readToolGroupVariant(interactionsProps.toolGroupVariant),
    },
  };
}
