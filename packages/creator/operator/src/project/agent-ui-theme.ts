import type { UIProjectVerification } from "../verify-ui";

export interface ThemeChange { path: string; before: string; after: string; verificationRuntime: string }
export interface ThemeTransactionResult { runId?: string; verification: UIProjectVerification }
