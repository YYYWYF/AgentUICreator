/** Product presets are independent of CSS dark-variant semantics. */
export const AGENT_UI_THEME_PRESETS = {
  light: { colorScheme: "light" },
  dark: { colorScheme: "dark" },
  violet: { colorScheme: "light" },
} as const;

export type AgentUITheme = keyof typeof AGENT_UI_THEME_PRESETS;
export type AgentUIColorScheme = "light" | "dark";
export interface AgentUIThemeConfig { theme: AgentUITheme }

export function getAgentUIThemeColorScheme(theme: AgentUITheme): AgentUIColorScheme {
  return AGENT_UI_THEME_PRESETS[theme].colorScheme;
}

export function isAgentUITheme(value: unknown): value is AgentUITheme {
  return typeof value === "string" && Object.hasOwn(AGENT_UI_THEME_PRESETS, value);
}
