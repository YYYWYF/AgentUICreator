export interface ThemeCatalog { current: string; options: { id: string }[] }
export interface ThemeChange { path: string; before: string; after: string }
export function getAvailableAgentUIThemes(root: string): Promise<ThemeCatalog>;
export function setAgentUITheme(root: string, theme: string, commit: (change: ThemeChange) => Promise<{ runId?: string }>): Promise<{
  current: string; changed: boolean; changedPaths: string[]; validation: "passed"; runId?: string;
}>;
