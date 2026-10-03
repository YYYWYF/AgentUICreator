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
    | "decision-no-project-change"
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

export interface CreatorPluginDeliveryReceipt {
  pluginId: string;
  projectRevision: number;
  decision: { type: string };
  authorization: { status: string; grantSource?: string | null };
  delivery: {
    status: "planning" | "created" | "registered" | "composed" | "verified" | "statically-verified" | "completed" | "blocked";
    lastSuccessfulStage: string;
    stages: Record<string, boolean>;
    blockers: string[];
    instanceIds: string[];
  };
  verification: Record<string, string>;
}

export interface CreatorRunReceipt {
  pluginDeliveries?: CreatorPluginDeliveryReceipt[];
  files: CreatorFileChangeReceipt[];
  validations: CreatorValidationReceipt[];
  verification?: CreatorVerificationReceipt | undefined;
  diagnosticLog?: CreatorDiagnosticLogReceipt | undefined;
  transaction?:
    | {
        runId: string;
        undoable: boolean;
        undone?: boolean;
        reapplyable?: boolean;
        reapplied?: boolean;
      }
    | undefined;
}
