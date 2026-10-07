export interface ThemeCatalog { current: string; options: { id: string }[] }
export interface ThemeChange { path: string; before: string; after: string; verificationRuntime: string }
export interface ThemeVerification { status: "passed" | "failed"; errors: { code: string; message: string }[]; warnings: { code: string; message: string }[] }
export function getAvailableAgentUIThemes(root: string): Promise<ThemeCatalog>;
export function setAgentUITheme(root: string, theme: string, commit: (change: ThemeChange) => Promise<{ runId?: string; verification: ThemeVerification }>): Promise<{
  current: string; changed: boolean; changedPaths: string[]; validation: "passed"; runId?: string; verification: ThemeVerification;
}>;
