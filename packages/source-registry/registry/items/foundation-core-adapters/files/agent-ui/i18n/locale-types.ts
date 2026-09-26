export type AgentUILocaleCode = "zh-CN" | "en-US";

export type AgentUIDirection = "ltr" | "rtl";

export interface AgentUILocaleMessages {
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
    switchToLight: string;
    switchToDark: string;
  };
}
