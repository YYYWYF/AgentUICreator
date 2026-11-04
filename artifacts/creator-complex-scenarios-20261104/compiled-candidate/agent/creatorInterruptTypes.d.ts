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
export declare function parseCreatorQuestion(value: unknown): CreatorQuestionActivity | undefined;
export declare function questionFromInterrupt(value: unknown): CreatorQuestionActivity | undefined;
//# sourceMappingURL=creatorInterruptTypes.d.ts.map