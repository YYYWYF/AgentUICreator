import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES } from "../i18n/locale.js";
import { Blocks, Check, LayoutDashboard, PanelRight } from "lucide-react";
import { Button } from "../components/button.js";
function getModeDescriptions(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        assistant: localeMessages.setup.globalAIAssistantCopilotForExistingApplications,
        embedded: localeMessages.setup.embeddedInABusinessPageForSpecificWorkflows,
        platform: localeMessages.setup.fullAgentWorkbenchForStandaloneAgentProducts,
    };
}
export function CreatorModeCard({ mode, selected, disabled, onSelect }) {
    const localeMessages = useAgentUILocale();
    const Icon = mode.id === "assistant" ? PanelRight : mode.id === "embedded" ? Blocks : LayoutDashboard;
    return (_jsxs(Button, { variant: "outline", className: "creator-project-mode-card", type: "button", "aria-pressed": selected, "data-selected": selected, disabled: disabled, onClick: () => onSelect(mode.id), children: [_jsx("div", { className: "creator-mode-icon", children: _jsx(Icon, { "aria-hidden": "true" }) }), selected ? _jsx(Check, { className: "creator-mode-check", "aria-hidden": "true" }) : null, _jsx("strong", { children: ({ assistant: localeMessages.creatorWorkbench.assistant, embedded: localeMessages.creatorWorkbench.embedded, platform: localeMessages.creatorWorkbench.workbench })[mode.id] }), _jsx("span", { children: getModeDescriptions(localeMessages)[mode.id] ?? mode.description })] }));
}
//# sourceMappingURL=CreatorModeCard.js.map