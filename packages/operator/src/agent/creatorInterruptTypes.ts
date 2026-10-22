export interface CreatorQuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface CreatorQuestionStep {
  id: string;
  question: string;
  description?: string;
  options: CreatorQuestionOption[];
  selectionMode: "single" | "multiple";
  minSelections: number;
  maxSelections: number;
}

export interface CreatorQuestionActivity {
  kind: "question";
  id: string;
  interruptId: string;
  status: "pending" | "submitting" | "resolved" | "stale";
  steps: CreatorQuestionStep[];
  answers?: Record<string, string[]>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseCreatorQuestion(value: unknown): CreatorQuestionActivity | undefined {
  if (!record(value) || value.kind !== "question" || typeof value.id !== "string" ||
      typeof value.interruptId !== "string" || !["pending", "submitting", "resolved", "stale"].includes(String(value.status)) ||
      !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 3) return undefined;
  const steps: CreatorQuestionStep[] = [];
  for (const raw of value.steps) {
    if (!record(raw) || typeof raw.id !== "string" || typeof raw.question !== "string" ||
        !Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 7 ||
        (raw.selectionMode !== "single" && raw.selectionMode !== "multiple") ||
        typeof raw.minSelections !== "number" || typeof raw.maxSelections !== "number" ||
        !Number.isInteger(raw.minSelections) || !Number.isInteger(raw.maxSelections)) return undefined;
    const options: CreatorQuestionOption[] = [];
    for (const option of raw.options) {
      if (!record(option) || typeof option.id !== "string" || typeof option.label !== "string") return undefined;
      options.push({ id: option.id, label: option.label,
        ...(typeof option.description === "string" ? { description: option.description } : {}) });
    }
    if (new Set(options.map(option => option.id)).size !== options.length ||
        Number(raw.minSelections) < 0 || Number(raw.maxSelections) > options.length ||
        Number(raw.minSelections) > Number(raw.maxSelections) ||
        (raw.selectionMode === "single" && raw.maxSelections !== 1)) return undefined;
    steps.push({ id: raw.id, question: raw.question, options,
      selectionMode: raw.selectionMode, minSelections: Number(raw.minSelections), maxSelections: Number(raw.maxSelections),
      ...(typeof raw.description === "string" ? { description: raw.description } : {}) });
  }
  if (new Set(steps.map(step => step.id)).size !== steps.length) return undefined;
  const answers = record(value.answers) && Object.entries(value.answers).every(([, selected]) => Array.isArray(selected) && selected.every(id => typeof id === "string"))
    ? value.answers as Record<string, string[]> : undefined;
  return { kind: "question", id: value.id, interruptId: value.interruptId,
    status: value.status === "submitting" ? "pending" : value.status as CreatorQuestionActivity["status"],
    steps, ...(answers ? { answers } : {}) };
}

export function questionFromInterrupt(value: unknown): CreatorQuestionActivity | undefined {
  if (!record(value) || typeof value.id !== "string" || !record(value.metadata) ||
      value.metadata.kind !== "ask_user_question") return undefined;
  return parseCreatorQuestion({ kind: "question", id: `question-${value.id}`, interruptId: value.id,
    status: "pending", steps: value.metadata.steps });
}
