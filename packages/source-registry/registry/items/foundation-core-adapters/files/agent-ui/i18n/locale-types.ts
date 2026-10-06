export type AgentUILocaleCode = "zh-CN" | "en-US";

export type AgentUIDirection = "ltr" | "rtl";

export interface AgentUILocaleMessages {
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
  conversationFeedback: { helpful: string; notHelpful: string; };
  conversationQuote: {
    quote: string;
    dismiss: string;
  };
  conversation: {
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
  threadList: {
    newThread: string;
    newChat: string;
    search: string;
    moreOptions: string;
    running: string;
    rename: string;
    archive: string;
    delete: string;
  };
  theme: {
    settings: string;
    light: string;
    dark: string;
    violet: string;
  };
}
