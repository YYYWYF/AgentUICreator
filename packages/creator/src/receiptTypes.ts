export interface CreatorFileChangeReceipt {
  path: string;
  status: "created" | "modified";
  diff: string;
  truncated: boolean;
}

export interface CreatorValidationReceipt {
  command: string;
  status: "passed" | "failed";
  exitCode: number | null;
  output: string;
  truncated: boolean;
}

export interface CreatorRunReceipt {
  files: CreatorFileChangeReceipt[];
  validations: CreatorValidationReceipt[];
}
