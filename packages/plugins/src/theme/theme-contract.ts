/** Product presets are independent of CSS dark-variant semantics. */
export const AGENT_UI_THEME_PRESETS = {
  light: { colorScheme: "light" },
  dark: { colorScheme: "dark" },
  violet: { colorScheme: "light" },
} as const;

export type AgentUITheme = keyof typeof AGENT_UI_THEME_PRESETS;
export type AgentUIColorScheme = "light" | "dark";
/** Shared built-in initial theme; project-specific choices enter through Agent props. */
export const AGENT_UI_DEFAULT_THEME: AgentUITheme = "violet";

export function getAgentUIThemeColorScheme(theme: string): AgentUIColorScheme {
  return AGENT_UI_THEME_PRESETS[isAgentUITheme(theme) ? theme : AGENT_UI_DEFAULT_THEME].colorScheme;
}

export function isAgentUITheme(value: unknown): value is AgentUITheme {
  return typeof value === "string" && Object.hasOwn(AGENT_UI_THEME_PRESETS, value);
}
