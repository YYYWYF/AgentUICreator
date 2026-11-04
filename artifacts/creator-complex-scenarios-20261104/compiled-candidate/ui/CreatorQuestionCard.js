import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { creatorDisplayText } from "./product-presentation.js";
import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES, formatLocaleMessage } from "./i18n/locale.js";
import { useState } from "react";
import { Button } from "./components/button.js";
import { Check, CircleHelp } from "lucide-react";
export function CreatorQuestionCard({ activity, onAnswer, onAbandon }) {
    const localeMessages = useAgentUILocale();
    const [answers, setAnswers] = useState(activity.answers ?? {});
    const ready = activity.steps.every(step => {
        const selected = answers[step.id] ?? [];
        return selected.length >= step.minSelections && selected.length <= step.maxSelections;
    });
    const inactive = activity.status !== "pending";
    return _jsxs("article", { className: "creator-question-card creator-ui-scope", "aria-label": localeMessages.creatorQuestion.creatorQuestion, "data-status": activity.status, children: [_jsxs("header", { className: "creator-question-header", children: [_jsx(CircleHelp, { "aria-hidden": "true" }), _jsx("span", { children: activity.status === "resolved" ? localeMessages.creatorQuestion.selectionConfirmed : activity.status === "stale" ? localeMessages.creatorQuestion.thisQuestionHasExpired : localeMessages.creatorQuestion.yourSelectionIsNeeded })] }), activity.steps.map(step => _jsxs("fieldset", { disabled: inactive, children: [_jsx("legend", { children: creatorDisplayText(step.question) }), step.description ? _jsx("p", { children: creatorDisplayText(step.description) }) : null, activity.status === "pending" ? _jsx("small", { className: "creator-question-selection-hint", children: step.selectionMode === "single" ? localeMessages.creatorQuestion.chooseOne : formatLocaleMessage(localeMessages.creatorQuestion.chooseItems, step.minSelections, step.maxSelections) }) : null, step.options.map(option => {
                        const checked = (answers[step.id] ?? []).includes(option.id);
                        const shown = activity.status === "resolved" ? (activity.answers?.[step.id] ?? []).includes(option.id) : checked;
                        if (activity.status === "resolved" && !shown)
                            return null;
                        return _jsxs("label", { className: "creator-question-option", "data-selected": shown, children: [activity.status === "resolved" ? _jsx(Check, { "aria-hidden": "true", className: "cui:size-4 cui:text-primary" }) : activity.status === "stale" ? null : _jsx("input", { type: step.selectionMode === "single" ? "radio" : "checkbox", name: `${activity.id}-${step.id}`, checked: checked, onChange: () => setAnswers(current => {
                                        const prior = current[step.id] ?? [];
                                        const selected = step.selectionMode === "single" ? [option.id]
                                            : checked ? prior.filter(id => id !== option.id) : [...prior, option.id];
                                        return { ...current, [step.id]: selected };
                                    }) }), _jsxs("span", { children: [_jsx("strong", { children: creatorDisplayText(option.label) }), option.description ? _jsx("small", { children: creatorDisplayText(option.description) }) : null] })] }, option.id);
                    })] }, step.id)), activity.status === "pending" ? _jsxs("div", { className: "creator-question-actions", children: [_jsx(Button, { size: "sm", type: "button", disabled: !ready, onClick: () => onAnswer(Object.fromEntries(activity.steps.map(step => [step.id, answers[step.id] ?? []]))), children: localeMessages.creatorQuestion.confirmSelection }), _jsx(Button, { size: "sm", variant: "ghost", type: "button", onClick: onAbandon, children: localeMessages.creatorQuestion.abandonThisTask })] }) : null, activity.status === "submitting" ? _jsx("p", { role: "status", children: localeMessages.creatorQuestion.continuingCreatorTask }) : null, activity.status === "stale" ? _jsx("p", { role: "alert", children: localeMessages.creatorQuestion.thisQuestionSAgentExecutionHasExpiredStart }) : null] });
}
//# sourceMappingURL=CreatorQuestionCard.js.map