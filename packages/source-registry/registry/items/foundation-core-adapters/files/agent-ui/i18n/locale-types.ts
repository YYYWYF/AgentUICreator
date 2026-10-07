import type { AgentUILocaleMessages as AgentUIPresentationMessages } from "@agent-ui/react";
export type AgentUILocaleCode = "zh-CN" | "en-US";

export type AgentUIDirection = "ltr" | "rtl";

export interface AgentUILocaleMessages extends Omit<AgentUIPresentationMessages, "composer" | "conversation" | "threadList"> {
  layout: {
    open: string;
    close: string;
    collapse: string;
    restore: string;
  };
  humanQuestion: {
    back: string;
    next: string;
    submit: string;
    submitting: string;
    answered: string;
    noneSelected: string;
    unavailable: string;
  };
  conversationTriggers: {
    suggestions: string; back: string; empty: string; loading: string;
    searchFailed: string; retry: string; commandFailed: string; invalidItem: string; newConversation: string;
  };
  composerTriggerDemo: {
    localeKey: string; personOne: string; personTwo: string; personThree: string;
    departmentOne: string; departmentTwo: string; departmentThree: string; summarize: string;
  };
  searchTools: {
    searching: string; sources: string; retrieving: string; passages: string; relevance: string; score: string;
  };
  composer: AgentUIPresentationMessages["composer"];
  conversationFeedback: { helpful: string; notHelpful: string; };
  conversationQuote: {
    quote: string;
    dismiss: string;
  };
  conversation: AgentUIPresentationMessages["conversation"] & {
    welcome: string;
    generationStopped: string;
    editCancel: string;
    editUpdate: string;
    editInput: string;
    moreActions: string;
    exportMarkdown: string;
  };
  frontendTools: {
    formTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    projectIdea: string;
    resetForm: string;
    submitForm: string;
    formRequired: string;
    formInvalid: string;
    formBusy: string;
    formUnavailable: string;
    formSubmitted: string;
    formReset: string;
    formUpdating: string;
    formFailed: string;
    fieldUpdated: string;
    fieldTo: string;

    close: string;
    opening: string;
    opened: string;
    failed: string;
  };
  threadList: AgentUIPresentationMessages["threadList"] & {
    retry: string;
    loading: string;
    empty: string;
    loadFailed: string;
    historyFailed: string;
    newThread: string;
    newChat: string;
    search: string;
    moreOptions: string;
    running: string;
    rename: string;
    archive: string;
    delete: string;
  };
  starterSuggestions: {
    architectureTitle: string; architectureLabel: string; architecturePrompt: string;
    debugTitle: string; debugLabel: string; debugPrompt: string;
    nextTitle: string; nextLabel: string; nextPrompt: string;
  };
  theme: {
    settings: string;
    light: string;
    dark: string;
    violet: string;
  };
}
