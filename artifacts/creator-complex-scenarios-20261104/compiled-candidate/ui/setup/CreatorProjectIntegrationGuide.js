import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES } from "../i18n/locale.js";
import { useState } from "react";
import { Check, ChevronDown, Code2, Copy } from "lucide-react";
import { Button } from "../components/button.js";
function getPlacementByMode(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        assistant: localeMessages.integration.placeItInTheRootLayoutOrWherever,
        embedded: localeMessages.integration.placeItOnAPageOrRegionThat,
        platform: localeMessages.integration.placeItOnTheMainPageOrWorkbench,
    };
}
/** Import path from a Host-owned component placed directly under src/. */
export function agentImportPathFromSrc(sourceRoot) {
    if (sourceRoot === "src")
        return ".";
    if (sourceRoot.startsWith("src/"))
        return `./${sourceRoot.slice(4)}`;
    return `../${sourceRoot}`;
}
export function agentIntegrationSnippet(sourceRoot, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    const messages = localeMessages.integration;
    return [
        `import { Agent } from "${agentImportPathFromSrc(sourceRoot)}";`,
        "",
        "export default function SelfPage() {",
        "  return (",
        "    <div>",
        `      {/* ${messages.exampleBusinessComment} */}`,
        `      {/* ${messages.exampleAgentComment} */}`,
        "      <Agent />",
        "    </div>",
        "  );",
        "}",
    ].join("\n");
}
export function agentProviderIntegrationSnippet(sourceRoot, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    const messages = localeMessages.integration;
    return [
        'import { AgentUIProvider } from "@za38.03/agent-ui-runtime";',
        `import { Agent } from "${agentImportPathFromSrc(sourceRoot)}";`,
        "",
        `// ${messages.providerStructureHint}`,
        "<AgentUIProvider>",
        `  {/* ${messages.providerBusinessComment} */}`,
        "  <YourBusinessComponents />",
        `  {/* ${messages.providerAgentComment} */}`,
        "  <Agent />",
        "</AgentUIProvider>",
    ].join("\n");
}
export function CreatorProjectIntegrationGuide({ sourceRoot, mode, hostFramework, onBuild, buildDisabled = false }) {
    const localeMessages = useAgentUILocale();
    const [framework, setFramework] = useState(hostFramework === "vue" ? "bridge" : "react");
    const [expanded, setExpanded] = useState(false);
    const [copyState, setCopyState] = useState("idle");
    const [bridgeCopyState, setBridgeCopyState] = useState("idle");
    const [providerCopyState, setProviderCopyState] = useState("idle");
    const [buildState, setBuildState] = useState("idle");
    const snippet = agentIntegrationSnippet(sourceRoot, localeMessages);
    const providerSnippet = agentProviderIntegrationSnippet(sourceRoot, localeMessages);
    const copySnippet = async () => {
        try {
            await navigator.clipboard.writeText(snippet);
            setCopyState("copied");
        }
        catch {
            setCopyState("failed");
        }
    };
    const copyProviderSnippet = async () => {
        try {
            await navigator.clipboard.writeText(providerSnippet);
            setProviderCopyState("copied");
        }
        catch {
            setProviderCopyState("failed");
        }
    };
    const copyBridgePrompt = async () => {
        try {
            await navigator.clipboard.writeText(localeMessages.integration.bridgePrompt);
            setBridgeCopyState("copied");
        }
        catch {
            setBridgeCopyState("failed");
        }
    };
    return (_jsxs("section", { className: "creator-project-integration-guide creator-ui-scope", "aria-label": localeMessages.integration.integrateAgentUI, children: [_jsxs("header", { children: [_jsx("div", { className: "creator-integration-icon", children: _jsx(Code2, { "aria-hidden": "true" }) }), _jsxs("div", { children: [_jsx("strong", { children: localeMessages.integration.agentUICreated }), _jsx("span", { children: localeMessages.integration.addItToYourApplicationNext })] }), _jsxs(Button, { size: "xs", variant: "ghost", type: "button", "aria-expanded": expanded, onClick: () => setExpanded((current) => !current), children: [expanded ? localeMessages.integration.collapse : localeMessages.integration.viewIntegrationInstructions, _jsx(ChevronDown, { "aria-hidden": "true", className: expanded ? "cui:rotate-180" : undefined })] })] }), expanded ? (_jsxs("div", { className: "creator-project-integration-guide-body", children: [_jsxs("div", { className: "creator-integration-frameworks", role: "group", "aria-label": localeMessages.integration.frameworkChoice, children: [_jsx(Button, { size: "sm", variant: framework === "react" ? "default" : "outline", type: "button", "aria-pressed": framework === "react", onClick: () => setFramework("react"), children: localeMessages.integration.reactIntegration }), _jsx(Button, { size: "sm", variant: framework === "bridge" ? "default" : "outline", type: "button", "aria-pressed": framework === "bridge", onClick: () => setFramework("bridge"), children: localeMessages.integration.bridgeIntegration })] }), framework === "react" ? _jsxs(_Fragment, { children: [_jsxs("section", { className: "creator-integration-step", children: [_jsx("h3", { children: localeMessages.integration.reactDisplayStep }), _jsxs("p", { children: [localeMessages.integration.importFromThePublicEntryPoint, " ", _jsxs("code", { children: [sourceRoot, "/index.ts"] }), "  ", localeMessages.integration.theExampleBelowUsesAComponentInYour] }), _jsxs("div", { className: "creator-project-integration-code-header", children: [_jsx("span", { children: localeMessages.integration.useInExistingComponent }), _jsxs(Button, { size: "xs", variant: "ghost", type: "button", className: "creator-project-integration-copy", onClick: () => void copySnippet(), children: [copyState === "copied" ? _jsx(Check, { "aria-hidden": "true" }) : _jsx(Copy, { "aria-hidden": "true" }), copyState === "copied" ? localeMessages.integration.copied : localeMessages.integration.copyCode] })] }), _jsx("pre", { children: _jsx("code", { children: snippet }) }), copyState === "failed" ? _jsx("span", { role: "alert", children: localeMessages.integration.copyFailedSelectTheCodeAndCopyManually }) : null, _jsxs("p", { children: [getPlacementByMode(localeMessages)[mode], " ", localeMessages.integration.exampleImportPathRelativeToSrc] })] }), _jsxs("section", { className: "creator-integration-step", children: [_jsx("h3", { children: localeMessages.integration.reactConnectStep }), _jsx("p", { children: localeMessages.integration.providerDescription }), _jsxs("details", { children: [_jsx("summary", { children: localeMessages.integration.providerStructureDetails }), _jsx("p", { children: localeMessages.integration.providerConfiguration }), _jsxs("div", { className: "creator-project-integration-code-header", children: [_jsx("span", { children: localeMessages.integration.providerHeading }), _jsxs(Button, { size: "xs", variant: "ghost", type: "button", className: "creator-project-integration-copy", onClick: () => void copyProviderSnippet(), children: [providerCopyState === "copied" ? _jsx(Check, { "aria-hidden": "true" }) : _jsx(Copy, { "aria-hidden": "true" }), providerCopyState === "copied" ? localeMessages.integration.copied : localeMessages.integration.copyCode] })] }), _jsx("pre", { children: _jsx("code", { children: providerSnippet }) }), providerCopyState === "failed" ? _jsx("span", { role: "alert", children: localeMessages.integration.copyFailedSelectTheCodeAndCopyManually }) : null] })] })] }) : _jsxs(_Fragment, { children: [onBuild ? _jsxs("div", { children: [_jsx("p", { children: localeMessages.integration.boundProducerDescription }), _jsx(Button, { size: "sm", type: "button", disabled: buildDisabled || buildState === "building", onClick: async () => {
                                            setBuildState("building");
                                            try {
                                                await onBuild();
                                                setBuildState("passed");
                                            }
                                            catch {
                                                setBuildState("failed");
                                            }
                                        }, children: buildState === "building" ? localeMessages.integration.buildingProducer : localeMessages.integration.buildProducer }), buildState === "passed" ? _jsx("p", { role: "status", children: localeMessages.integration.producerPublished }) : null, buildState === "failed" ? _jsx("p", { role: "alert", children: localeMessages.integration.producerBuildFailed }) : null] }) : null, _jsx("p", { children: localeMessages.integration.bridgeCopyInstruction }), _jsxs("div", { className: "creator-project-integration-code-header", children: [_jsx("span", { children: localeMessages.integration.bridgeCopyPrompt }), _jsxs(Button, { size: "xs", variant: "ghost", type: "button", className: "creator-project-integration-copy", onClick: () => void copyBridgePrompt(), children: [bridgeCopyState === "copied" ? _jsx(Check, { "aria-hidden": "true" }) : _jsx(Copy, { "aria-hidden": "true" }), bridgeCopyState === "copied" ? localeMessages.integration.copied : localeMessages.integration.bridgeCopyButton] })] }), _jsx("pre", { className: "creator-integration-prompt", children: _jsx("code", { children: localeMessages.integration.bridgePrompt }) }), bridgeCopyState === "failed" ? _jsx("span", { role: "alert", children: localeMessages.integration.copyFailedSelectTheCodeAndCopyManually }) : null, _jsxs("details", { children: [_jsx("summary", { children: localeMessages.integration.bridgeManualHeading }), _jsx("p", { children: localeMessages.integration.bridgeManualDescription }), _jsx("pre", { className: "creator-integration-prompt", children: _jsx("code", { children: localeMessages.integration.bridgeManualPrompt }) })] }), _jsx("p", { children: _jsx("strong", { children: localeMessages.integration.bridgeLimitationsHeading }) }), _jsx("p", { children: localeMessages.integration.bridgeLimitations })] })] })) : null] }));
}
//# sourceMappingURL=CreatorProjectIntegrationGuide.js.map