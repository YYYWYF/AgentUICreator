import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { localizeCreatorPresentation, useAgentUILocale, DEFAULT_CREATOR_MESSAGES } from "./i18n/locale.js";
import { useEffect, useRef, useState } from "react";
import { CONNECTION_API } from "../agent-connection/types.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { Button } from "./components/button.js";
import { Input } from "./components/input.js";
import { NativeSelect, NativeSelectOption } from "./components/native-select.js";
import { useCreatorRefresh } from "./creatorRefresh.js";
import { resolveAgentConnectionEndpoint } from "../agent-connection/endpoint.js";
import { requestBusinessPageUrl } from "../host-preview/businessPageUrl.js";
export const CONNECTION_CHANGED = "agent-ui-creator:connection-changed";
function getUnavailableMessage(localeMessages = DEFAULT_CREATOR_MESSAGES) { return localeMessages.agentConnection.couldNotReadConnectionSettingsMakeSureThe; }
function getConnectionErrors(localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return {
        "Preview workspace changed. Reload the preview.": localeMessages.agentConnection.theProjectHasChangedRefreshThePreviewAnd,
        "Workspace changed.": localeMessages.agentConnection.theProjectHasChangedRefreshThePreviewAnd,
        "Stop the current run before switching Agent source.": localeMessages.agentConnection.stopTheCurrentRunBeforeSwitchingAgentSources,
        "Connection changes require same-origin requests.": localeMessages.agentConnection.changeConnectionSettingsOnTheCreatorDevelopmentService,
        "Agent connection is being updated.": localeMessages.agentConnection.connectionSettingsAreBeingUpdatedTryAgainShortly,
        "Invalid Agent endpoint.": localeMessages.agentConnection.invalidServiceAddressEnterACompleteHTTPOr,
        "Invalid URL": localeMessages.agentConnection.invalidServiceAddressEnterACompleteHTTPOr,
        "Use an HTTP(S) Agent endpoint without credentials or fragments.": localeMessages.agentConnection.useHTTPOrHTTPSWithoutAUsernamePassword,
        "Agent endpoint is required.": localeMessages.agentConnection.enterTheAgentServiceAddressFirst,
        "BUSINESS_PAGE_URL_REQUIRED": localeMessages.agentConnection.relativeAddressRequiresBusinessPage,
        "Select Mock or Connected Agent.": localeMessages.agentConnection.chooseYourOwnAgentOrADemoAgent,
    };
}
export async function readAgentConnection(workspaceId, body, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    let response;
    try {
        response = await fetch(CONNECTION_API, {
            cache: "no-store",
            headers: { "Content-Type": "application/json", [CREATOR_WORKSPACE_ID_HEADER]: workspaceId },
            ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
        });
    }
    catch {
        throw new Error(localeMessages.agentConnection.couldNotConnectToCreatorCheckThatIts);
    }
    if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error(getUnavailableMessage(localeMessages));
    let value;
    try {
        value = await response.json();
    }
    catch {
        throw new Error(getUnavailableMessage(localeMessages));
    }
    if (!response.ok) {
        const serverError = value && typeof value === "object" && "error" in value ? value.error : undefined;
        throw new Error(typeof serverError === "string" && getConnectionErrors(localeMessages)[serverError]
            ? getConnectionErrors(localeMessages)[serverError]
            : body === undefined ? getUnavailableMessage(localeMessages) : localeMessages.agentConnection.settingsWereNotSavedRetryShortlyIfThe);
    }
    if (!isConnectionState(value))
        throw new Error(getUnavailableMessage(localeMessages));
    return value;
}
function isConnectionState(value) {
    return value !== null && typeof value === "object" && "activeSource" in value &&
        (value.activeSource === "mock" || value.activeSource === "connected") &&
        "configured" in value && typeof value.configured === "boolean" &&
        "running" in value && typeof value.running === "boolean" &&
        (!("enabled" in value) || typeof value.enabled === "boolean") &&
        (!("endpoint" in value) || typeof value.endpoint === "string") &&
        (!("connectionMode" in value) || value.connectionMode === "direct" || value.connectionMode === "proxy");
}
export function AgentConnectionPanel({ workspaceId, visible }) {
    const localeMessages = useAgentUILocale();
    const localeMessagesRef = useRef(localeMessages);
    localeMessagesRef.current = localeMessages;
    const [state, setState] = useState();
    const [endpoint, setEndpoint] = useState("");
    const [connectionMode, setConnectionMode] = useState("proxy");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [retry, setRetry] = useState(0);
    useCreatorRefresh(data => {
        if (data.projectId !== workspaceId || !data.connection || saving)
            return;
        const next = data.connection;
        if (!state || endpoint === (state.endpoint ?? ""))
            setEndpoint(next.endpoint ?? "");
        if (!state || connectionMode === (state.connectionMode ?? "proxy"))
            setConnectionMode(next.connectionMode ?? "proxy");
        setState(next);
        setError("");
    });
    useEffect(() => {
        let active = true;
        setState(undefined);
        setError("");
        setEndpoint("");
        setConnectionMode("proxy");
        void readAgentConnection(workspaceId, undefined, localeMessagesRef.current).then(value => { if (active) {
            setState(value);
            setEndpoint(value.endpoint ?? "");
            setConnectionMode(value.connectionMode ?? "proxy");
        } }).catch(error => { if (active)
            setError(error.message); });
        const observe = (event) => {
            const value = Boolean(event.detail?.running);
            setRunning(value);
            setState(previous => previous ? { ...previous, running: value } : previous);
        };
        window.addEventListener("agent-ui-creator:preview-running", observe);
        return () => { active = false; window.removeEventListener("agent-ui-creator:preview-running", observe); };
    }, [workspaceId, retry]);
    async function save(activeSource, enabled = true) {
        setSaving(true);
        setError("");
        try {
            let resolvedEndpoint;
            if (enabled && activeSource === "connected") {
                try {
                    resolvedEndpoint = resolveAgentConnectionEndpoint(endpoint);
                }
                catch (error) {
                    if (!(error instanceof Error) || error.message !== "BUSINESS_PAGE_URL_REQUIRED")
                        throw error;
                    resolvedEndpoint = resolveAgentConnectionEndpoint(endpoint, await requestBusinessPageUrl(workspaceId));
                }
            }
            const value = await readAgentConnection(workspaceId, { activeSource, enabled, connectionMode, ...(resolvedEndpoint === undefined ? {} : { endpoint: resolvedEndpoint }) }, localeMessages);
            setState(value);
            setEndpoint(value.endpoint ?? "");
            setConnectionMode(value.connectionMode ?? "proxy");
            window.dispatchEvent(new CustomEvent(CONNECTION_CHANGED, { detail: { workspaceId, state: value } }));
        }
        catch (error) {
            setError(error instanceof Error ? getConnectionErrors(localeMessages)[error.message] ?? error.message : localeMessages.agentConnection.settingsWereNotSavedTryAgainShortly);
        }
        finally {
            setSaving(false);
        }
    }
    async function saveConnectionMode(nextMode) {
        if (!state || saving || sourceBusy || nextMode === (state.connectionMode ?? "proxy"))
            return;
        const previousMode = state.connectionMode ?? "proxy";
        setConnectionMode(nextMode);
        setSaving(true);
        setError("");
        try {
            const value = await readAgentConnection(workspaceId, { activeSource: state.activeSource, connectionMode: nextMode }, localeMessages);
            setState(value);
            setConnectionMode(value.connectionMode ?? "proxy");
            window.dispatchEvent(new CustomEvent(CONNECTION_CHANGED, { detail: { workspaceId, state: value } }));
        }
        catch (error) {
            setConnectionMode(previousMode);
            setError(error instanceof Error ? error.message : localeMessages.agentConnection.settingsWereNotSavedTryAgainShortly);
        }
        finally {
            setSaving(false);
        }
    }
    const sourceBusy = running || Boolean(state?.running);
    if (!visible)
        return null;
    return _jsxs("section", { className: "creator-agent-connection", "aria-label": localeMessages.agentConnection.agentConnectionSettings, "aria-busy": saving || (!state && !error), children: [_jsx("p", { className: "cui:text-xs cui:text-muted-foreground", children: localeMessages.agentConnection.connectAnAGUIAgentServiceOrExplore }), _jsxs("label", { className: "cui:block cui:space-y-1", children: [localeMessages.agentConnection.agentServiceAddress, _jsx(Input, { value: endpoint, placeholder: localeMessages.agentConnection.forExampleHttpLocalhost8000Agent, onChange: event => setEndpoint(event.target.value), disabled: !state || saving || sourceBusy })] }), _jsx("p", { className: "cui:text-xs cui:text-muted-foreground", children: localeMessages.agentConnection.relativeAddressHelp }), _jsx("p", { className: "cui:text-xs cui:text-muted-foreground", children: connectionMode === "direct" ? localeMessages.agentConnection.directConnectionHelp : localeMessages.agentConnection.forwardingHelp }), _jsxs("div", { className: "cui:flex cui:gap-2 cui:flex-wrap", children: [_jsx(Button, { size: "sm", disabled: !state || saving || sourceBusy || !endpoint.trim(), onClick: () => void save("connected"), children: localeMessages.agentConnection.useThisAddress }), _jsx(Button, { size: "sm", variant: "outline", disabled: !state || saving || sourceBusy, onClick: () => void save("mock"), children: localeMessages.agentConnection.useDemoAgent }), _jsx(Button, { size: "sm", variant: "outline", disabled: !state || saving || sourceBusy || state.enabled === false, onClick: () => state && void save(state.activeSource, false), children: localeMessages.agentConnection.disableTemporaryConnection })] }), _jsxs("label", { className: "cui:block cui:space-y-1", children: [localeMessages.agentConnection.connectionMode, _jsxs(NativeSelect, { value: connectionMode, onChange: event => void saveConnectionMode(event.target.value), disabled: !state || saving || sourceBusy, children: [_jsx(NativeSelectOption, { value: "direct", children: localeMessages.agentConnection.directConnection }), _jsx(NativeSelectOption, { value: "proxy", children: localeMessages.agentConnection.enableForwarding })] })] }), state?.enabled === false ? _jsx("p", { className: "cui:text-xs", role: "status", children: localeMessages.agentConnection.currentlyUsingApplicationEndpoint }) : state?.configured && _jsx("p", { className: "cui:text-xs", children: state.activeSource === "connected" ? localeMessages.agentConnection.currentlyUsingYourAgentService : localeMessages.agentConnection.currentlyUsingDemoAgentMock }), state?.configured && state.enabled !== false && state.activeSource === "connected" && _jsx("p", { className: "cui:text-xs", children: (state.connectionMode ?? "proxy") === "direct" ? localeMessages.agentConnection.currentDirectConnection : localeMessages.agentConnection.currentForwarding }), state?.activeSource === "mock" && state.enabled !== false && state.configured && _jsx("p", { className: "cui:text-xs cui:text-muted-foreground", children: localeMessages.agentConnection.chooseADemoInTheMockAgentPanel }), !state && !error && _jsx("p", { role: "status", children: localeMessages.agentConnection.readingConnectionSettings }), saving && _jsx("p", { role: "status", children: localeMessages.agentConnection.savingConnectionSettings }), sourceBusy && _jsx("p", { role: "status", children: localeMessages.agentConnection.stopTheCurrentRunBeforeSwitchingAgentSources }), error && _jsx("div", { role: "alert", className: "cui:rounded-md cui:border cui:border-destructive/30 cui:bg-destructive/5 cui:p-3 cui:text-sm", children: _jsx("p", { children: localizeCreatorPresentation(error, localeMessages) }) }), !state && error && _jsx(Button, { size: "sm", variant: "outline", onClick: () => setRetry(value => value + 1), children: localeMessages.agentConnection.reloadConnectionSettings }), _jsxs("details", { className: "cui:text-xs cui:text-muted-foreground cui:space-y-2", children: [_jsx("summary", { className: "cui:cursor-pointer", children: localeMessages.agentConnection.connectionAndDeployment }), _jsx("p", { children: localeMessages.agentConnection.creatorForwardsDevelopmentPreviewRequestsToAvoidBrowser }), _jsx("p", { children: localeMessages.agentConnection.theDeployedAppConnectsDirectlyToYourAgent })] })] });
}
//# sourceMappingURL=AgentConnectionPanel.js.map