import type { AgentUILocaleMessages } from "../locale-types";

export const enUS = {
  auth: {
    demo: "Login demo",
    title: "Sign in to get started",
    description: "Use a demo identity to enter the Agent workspace.",
    signIn: "Enter with demo account",
    signingIn: "Signing in…",
    failed: "Sign-in failed. Please try again.",
    hint: "Internal authentication is not connected. Reloading resets this demo.",
  },
  threadList: {
    newThread: "New Thread",
    newChat: "New Chat",
    search: "Search threads",
  },
  theme: {
    settings: "Theme settings",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
  },
} satisfies AgentUILocaleMessages;
