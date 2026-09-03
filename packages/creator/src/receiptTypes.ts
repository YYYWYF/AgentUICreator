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
  status: "passed" | "failed";
  evidence: string;
}

export interface CreatorVerificationReceipt {
  status:
    | "not-run"
    | "changed-and-verified"
    | "no-project-change"
    | "failed";
  projectRevision: number;
  auditAttempts: number;
  checks: CreatorVerificationCheck[];
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
