export interface HumanQuestionOption { id: string; label: string; description?: string }
export interface HumanQuestionStep {
  id: string;
  question: string;
  description?: string;
  options: HumanQuestionOption[];
  selectionMode: "single" | "multiple";
  minSelections: number;
  maxSelections: number;
}
export interface HumanQuestionRequest { schemaVersion: 1; steps: HumanQuestionStep[] }
export interface HumanQuestionResult { answers: Record<string, string[]> }

export const askUserQuestionParameters = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "steps"],
  properties: {
    schemaVersion: { const: 1 },
    steps: { type: "array", minItems: 1, maxItems: 3, items: {
      type: "object", additionalProperties: false,
      required: ["id", "question", "options", "selectionMode", "minSelections", "maxSelections"],
      properties: {
        id: { type: "string", minLength: 1 }, question: { type: "string", minLength: 1 }, description: { type: "string" },
        options: { type: "array", minItems: 2, maxItems: 7, items: { type: "object", additionalProperties: false,
          required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, description: { type: "string" } } } },
        selectionMode: { enum: ["single", "multiple"] },
        minSelections: { type: "integer", minimum: 0 }, maxSelections: { type: "integer", minimum: 1 },
      },
    } },
  },
} as const;

export function parseHumanQuestionRequest(value: unknown): HumanQuestionRequest | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Partial<HumanQuestionRequest>;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > 3) return undefined;
  const ids = new Set<string>();
  for (const step of raw.steps) {
    if (!step || typeof step.id !== "string" || !step.id || ids.has(step.id) || typeof step.question !== "string" || !step.question ||
        (step.description !== undefined && typeof step.description !== "string") || !Array.isArray(step.options) ||
        step.options.length < 2 || step.options.length > 7 || !["single", "multiple"].includes(step.selectionMode) ||
        !Number.isInteger(step.minSelections) || !Number.isInteger(step.maxSelections) || step.minSelections < 0 ||
        step.minSelections > step.maxSelections || step.maxSelections > step.options.length ||
        (step.selectionMode === "single" && step.maxSelections !== 1)) return undefined;
    ids.add(step.id);
    const optionIds = new Set<string>();
    for (const option of step.options) {
      if (!option || typeof option.id !== "string" || !option.id || optionIds.has(option.id) ||
          typeof option.label !== "string" || !option.label ||
          (option.description !== undefined && typeof option.description !== "string")) return undefined;
      optionIds.add(option.id);
    }
  }
  return raw as HumanQuestionRequest;
}

export function parseHumanQuestionResult(value: unknown, request: HumanQuestionRequest): HumanQuestionResult | undefined {
  if (typeof value === "string") {
    try { value = JSON.parse(value) as unknown; } catch { return undefined; }
  }
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, "answers")) return undefined;
  const answers = (value as { answers: unknown }).answers;
  if (typeof answers !== "object" || answers === null || Array.isArray(answers) ||
      Object.keys(answers).length !== request.steps.length) return undefined;
  for (const step of request.steps) {
    const selected = (answers as Record<string, unknown>)[step.id];
    if (!Array.isArray(selected) || selected.some(id => typeof id !== "string") ||
        new Set(selected).size !== selected.length || selected.length < step.minSelections ||
        selected.length > step.maxSelections || selected.some(id => !step.options.some(option => option.id === id))) return undefined;
  }
  return { answers: answers as Record<string, string[]> };
}
