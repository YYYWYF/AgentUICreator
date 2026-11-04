/** Primary purposes from website/docs/plugins/index.md. */
const groups = {
    "conversation": [
        "conversation-surface",
        "conversation-thread-list",
        "conversation-new",
        "conversation-suggestions",
        "transient-assistant-messages"
    ],
    "input": [
        "composer",
        "submit-action",
        "add-attachment-action",
        "dictation-action",
        "conversation-quote",
        "mention-trigger",
        "slash-command-trigger",
        "lexical-composer-input",
        "lexical-edit-composer"
    ],
    "response": [
        "response-footer",
        "copy-action",
        "reload-action",
        "feedback-actions",
        "export-markdown-action"
    ],
    "tools": [
        "thinking-indicator",
        "reasoning",
        "tool-group",
        "tool-timeline",
        "tool-fallback",
        "tool-result",
        "task-group",
        "agent-status-message",
        "agent-plan-message",
        "job-progress-message"
    ],
    "results": [
        "generated-file-message",
        "chart-message",
        "source-citations-message",
        "retrieval-chunks",
        "web-search",
        "context-retrieval-message"
    ],
    "appearance": [
        "agent-identity",
        "theme-switch",
        "locale-switch",
        "auth-gate",
        "auth-account"
    ]
};
export function pluginCategory(pluginId) {
    return Object.entries(groups).find(([, ids]) => ids.includes(pluginId))?.[0] ?? "other";
}
//# sourceMappingURL=plugin-categories.js.map