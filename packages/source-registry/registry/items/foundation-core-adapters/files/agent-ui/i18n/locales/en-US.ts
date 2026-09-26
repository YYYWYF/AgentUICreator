import type { AgentUILocaleMessages } from "../locale-types";

export const enUS = {
  frontendTools: {
    formTitle: "Profile Form",
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    projectIdea: "Project idea",
    resetForm: "Reset",
    submitForm: "Submit",
    formRequired: "This field is required",
    formInvalid: "The form contains invalid fields",
    formBusy: "The form is already submitting",
    formUnavailable: "Form capability unavailable",
    formSubmitted: "Submitted form",
    formReset: "Reset form",
    formUpdating: "Updating form…",
    formFailed: "Could not update form",
    fieldUpdated: "Updated",
    fieldTo: "to",

    close: "Close",
    opening: "Opening dialog…",
    opened: "Opened dialog",
    failed: "Could not open dialog",
  },
  threadList: {
    newThread: "New Thread",
    newChat: "New Chat",
    search: "Search threads",
    moreOptions: "More options",
    running: "Running",
    rename: "Rename",
    archive: "Archive",
    delete: "Delete",
  },
  theme: {
    settings: "Theme settings",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
  },
} satisfies AgentUILocaleMessages;
