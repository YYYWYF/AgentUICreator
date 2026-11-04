function record(value) {
    return typeof value === "object" && value !== null;
}
export function parseCreatorQuestion(value) {
    if (!record(value) || value.kind !== "question" || typeof value.id !== "string" ||
        typeof value.interruptId !== "string" || !["pending", "submitting", "resolved", "stale"].includes(String(value.status)) ||
        !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 3)
        return undefined;
    const steps = [];
    for (const raw of value.steps) {
        if (!record(raw) || typeof raw.id !== "string" || typeof raw.question !== "string" ||
            !Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 7 ||
            (raw.selectionMode !== "single" && raw.selectionMode !== "multiple") ||
            typeof raw.minSelections !== "number" || typeof raw.maxSelections !== "number" ||
            !Number.isInteger(raw.minSelections) || !Number.isInteger(raw.maxSelections))
            return undefined;
        const options = [];
        for (const option of raw.options) {
            if (!record(option) || typeof option.id !== "string" || typeof option.label !== "string")
                return undefined;
            options.push({ id: option.id, label: option.label,
                ...(typeof option.description === "string" ? { description: option.description } : {}) });
        }
        if (new Set(options.map(option => option.id)).size !== options.length ||
            Number(raw.minSelections) < 0 || Number(raw.maxSelections) > options.length ||
            Number(raw.minSelections) > Number(raw.maxSelections) ||
            (raw.selectionMode === "single" && raw.maxSelections !== 1))
            return undefined;
        steps.push({ id: raw.id, question: raw.question, options,
            selectionMode: raw.selectionMode, minSelections: Number(raw.minSelections), maxSelections: Number(raw.maxSelections),
            ...(typeof raw.description === "string" ? { description: raw.description } : {}) });
    }
    if (new Set(steps.map(step => step.id)).size !== steps.length)
        return undefined;
    const answers = record(value.answers) && Object.entries(value.answers).every(([, selected]) => Array.isArray(selected) && selected.every(id => typeof id === "string"))
        ? value.answers : undefined;
    return { kind: "question", id: value.id, interruptId: value.interruptId,
        status: value.status === "submitting" ? "pending" : value.status,
        steps, ...(answers ? { answers } : {}) };
}
export function questionFromInterrupt(value) {
    if (!record(value) || typeof value.id !== "string" || !record(value.metadata) ||
        value.metadata.kind !== "ask_user_question")
        return undefined;
    return parseCreatorQuestion({ kind: "question", id: `question-${value.id}`, interruptId: value.id,
        status: "pending", steps: value.metadata.steps });
}
//# sourceMappingURL=creatorInterruptTypes.js.map