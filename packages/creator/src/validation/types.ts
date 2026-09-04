export const CREATOR_COMPLETION_VALIDATIONS = [
  "pnpm verify:ui",
  "pnpm typecheck",
] as const;

export type CreatorValidationCommand =
  (typeof CREATOR_COMPLETION_VALIDATIONS)[number];

export interface CreatorValidationCheck {
  command: CreatorValidationCommand;
  status: "passed" | "failed";
  exitCode: number | null;
  output: string;
  truncated: boolean;
  revision: number;
  source: "cached" | "executed";
}

export interface CreatorValidationResult {
  revision: number;
  status: "passed" | "failed" | "stale";
  checks: CreatorValidationCheck[];
}
