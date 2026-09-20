export interface CreatorFileChangeReceipt {
  path: string;
  status: "created" | "modified" | "deleted";
  diff: string;
  truncated: boolean;
}

export interface CreatorValidationReceipt {
  command: string;
  status: "passed" | "failed";
  exitCode: number | null;
  output: string;
  truncated: boolean;
  revision?: number | undefined;
}

export interface CreatorVerificationCheck {
  id: string;
  status: "passed" | "failed" | "stale" | "unavailable";
  evidence: string;
}

export interface CreatorVerificationReceipt {
  status:
    | "not-run"
    | "changed-and-statically-verified"
    | "changed-and-verified"
    | "changed-unverified"
    | "no-project-change"
    | "failed";
  projectRevision: number;
  auditAttempts: number;
  checks: CreatorVerificationCheck[];
  verificationMode?: "static_only" | "static_and_runtime";
  runtimeStatus?: "not-run" | "passed" | "stale" | "unavailable" | "failed";
}

export interface CreatorDiagnosticLogReceipt {
  format: "jsonl";
  path: string;
  schemaVersion: 1;
}

export interface CreatorRunReceipt {
  files: CreatorFileChangeReceipt[];
  validations: CreatorValidationReceipt[];
  verification?: CreatorVerificationReceipt | undefined;
  diagnosticLog?: CreatorDiagnosticLogReceipt | undefined;
  transaction?:
    | {
        runId: string;
        undoable: boolean;
      }
    | undefined;
}
