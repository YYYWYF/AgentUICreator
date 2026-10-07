import { localizeCreatorPresentation, useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages } from "./i18n/locale.js";
import { useEffect, useRef, useState } from "react";
import { CONNECTION_API, type AgentConnectionState } from "../agent-connection/types.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { Button } from "./components/button.js";
import { Input } from "./components/input.js";
import { useCreatorRefresh } from "./creatorRefresh.js";
export const CONNECTION_CHANGED = "agent-ui-creator:connection-changed";
function getUnavailableMessage(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES) { return localeMessages.agentConnection.couldNotReadConnectionSettingsMakeSureThe; }
function getConnectionErrors(localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Record<string, string> { return {
  "Preview workspace changed. Reload the preview.": localeMessages.agentConnection.theProjectHasChangedRefreshThePreviewAnd,
  "Workspace changed.": localeMessages.agentConnection.theProjectHasChangedRefreshThePreviewAnd,
  "Stop the current run before switching Agent source.": localeMessages.agentConnection.stopTheCurrentRunBeforeSwitchingAgentSources,
  "Connection changes require same-origin requests.": localeMessages.agentConnection.changeConnectionSettingsOnTheCreatorDevelopmentService,
  "Agent connection is being updated.": localeMessages.agentConnection.connectionSettingsAreBeingUpdatedTryAgainShortly,
  "Invalid Agent endpoint.": localeMessages.agentConnection.invalidServiceAddressEnterACompleteHTTPOr,
  "Invalid URL": localeMessages.agentConnection.invalidServiceAddressEnterACompleteHTTPOr,
  "Use an HTTP(S) Agent endpoint without credentials or fragments.": localeMessages.agentConnection.useHTTPOrHTTPSWithoutAUsernamePassword,
  "Agent endpoint is required.": localeMessages.agentConnection.enterTheAgentServiceAddressFirst,
  "Select Mock or Connected Agent.": localeMessages.agentConnection.chooseYourOwnAgentOrADemoAgent,
}; }
export async function readAgentConnection(workspaceId: string, body?: unknown, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Promise<AgentConnectionState> {
  let response: Response;
  try {
    response = await fetch(CONNECTION_API, {
      cache: "no-store",
      headers: { "Content-Type": "application/json", [CREATOR_WORKSPACE_ID_HEADER]: workspaceId },
      ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    });
  } catch { throw new Error(localeMessages.agentConnection.couldNotConnectToCreatorCheckThatIts); }
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(getUnavailableMessage(localeMessages));
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new Error(getUnavailableMessage(localeMessages)); }
  if (!response.ok) {
    const serverError = value && typeof value === "object" && "error" in value ? value.error : undefined;
    throw new Error(typeof serverError === "string" && getConnectionErrors(localeMessages)[serverError]
      ? getConnectionErrors(localeMessages)[serverError]
      : body === undefined ? getUnavailableMessage(localeMessages) : localeMessages.agentConnection.settingsWereNotSavedRetryShortlyIfThe);
  }
  if (!isConnectionState(value)) throw new Error(getUnavailableMessage(localeMessages));
  return value;
}
function isConnectionState(value: unknown): value is AgentConnectionState {
  return value !== null && typeof value === "object" && "activeSource" in value &&
    (value.activeSource === "mock" || value.activeSource === "connected") &&
    "configured" in value && typeof value.configured === "boolean" &&
    "running" in value && typeof value.running === "boolean" &&
    (!("endpoint" in value) || typeof value.endpoint === "string");
}
export function AgentConnectionPanel({ workspaceId, visible }: { workspaceId: string; visible: boolean }) {
  const localeMessages = useAgentUILocale();
  const localeMessagesRef = useRef(localeMessages);
  localeMessagesRef.current = localeMessages;
  const [state, setState] = useState<AgentConnectionState>();
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [retry, setRetry] = useState(0);
  useCreatorRefresh(data => {
    if (data.projectId !== workspaceId || !data.connection || saving) return;
    const next = data.connection;
    if (!state || endpoint === (state.endpoint ?? "")) setEndpoint(next.endpoint ?? "");
    setState(next); setError("");
  });
  useEffect(() => {
    let active = true;
    setState(undefined); setError(""); setEndpoint("");
    void readAgentConnection(workspaceId, undefined, localeMessagesRef.current).then(value => { if (active) { setState(value); setEndpoint(value.endpoint ?? ""); } }).catch(error => { if (active) setError(error.message); });
    const observe = (event: Event) => {
      const value = Boolean((event as CustomEvent).detail?.running);
      setRunning(value);
      setState(previous => previous ? { ...previous, running: value } : previous);
    };
    window.addEventListener("agent-ui-creator:preview-running", observe);
    return () => { active = false; window.removeEventListener("agent-ui-creator:preview-running", observe); };
  }, [workspaceId, retry]);
  async function save(activeSource: "mock" | "connected") {
    if (activeSource === "connected") {
      try {
        const url = new URL(endpoint.trim());
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
          setError(getConnectionErrors(localeMessages)["Use an HTTP(S) Agent endpoint without credentials or fragments."]!); return;
        }
      } catch { setError(getConnectionErrors(localeMessages)["Invalid Agent endpoint."]!); return; }
    }
    setSaving(true); setError("");
    try {
      const value = await readAgentConnection(workspaceId, { activeSource, ...(activeSource === "connected" ? { endpoint: endpoint.trim() } : {}) }, localeMessages);
      setState(value); setEndpoint(value.endpoint ?? "");
      window.dispatchEvent(new CustomEvent(CONNECTION_CHANGED, { detail: { workspaceId, state: value } }));
    } catch (error) { setError(error instanceof Error ? error.message : localeMessages.agentConnection.settingsWereNotSavedTryAgainShortly); }
    finally { setSaving(false); }
  }
  const sourceBusy = running || Boolean(state?.running);
  if (!visible) return null;
  return <section className="creator-agent-connection" aria-label={localeMessages.agentConnection.agentConnectionSettings} aria-busy={saving || (!state && !error)}>
    <p className="cui:text-xs cui:text-muted-foreground">{localeMessages.agentConnection.connectAnAGUIAgentServiceOrExplore}</p>
    <label className="cui:block cui:space-y-1">{localeMessages.agentConnection.agentServiceAddress}<Input value={endpoint} placeholder={localeMessages.agentConnection.forExampleHttpLocalhost8000Agent} onChange={event => setEndpoint(event.target.value)} disabled={!state || saving || sourceBusy} /></label>
    <div className="cui:flex cui:gap-2 cui:flex-wrap">
      <Button size="sm" disabled={!state || saving || sourceBusy || !endpoint.trim()} onClick={() => void save("connected")}>{localeMessages.agentConnection.useThisAddress}</Button>
      <Button size="sm" variant="outline" disabled={!state || saving || sourceBusy} onClick={() => void save("mock")}>{localeMessages.agentConnection.useDemoAgent}</Button>
    </div>
    {state?.configured && <p className="cui:text-xs">{state.activeSource === "connected" ? localeMessages.agentConnection.currentlyUsingYourAgentService : localeMessages.agentConnection.currentlyUsingDemoAgentMock}</p>}
    {state?.activeSource === "mock" && state.configured && <p className="cui:text-xs cui:text-muted-foreground">{localeMessages.agentConnection.chooseADemoInTheMockAgentPanel}</p>}
    {!state && !error && <p role="status">{localeMessages.agentConnection.readingConnectionSettings}</p>}
    {saving && <p role="status">{localeMessages.agentConnection.savingConnectionSettings}</p>}
    {sourceBusy && <p role="status">{localeMessages.agentConnection.stopTheCurrentRunBeforeSwitchingAgentSources}</p>}
    {error && <div role="alert" className="cui:rounded-md cui:border cui:border-destructive/30 cui:bg-destructive/5 cui:p-3 cui:text-sm"><p>{localizeCreatorPresentation(error, localeMessages)}</p></div>}
    {!state && error && <Button size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>{localeMessages.agentConnection.reloadConnectionSettings}</Button>}
    <details className="cui:text-xs cui:text-muted-foreground cui:space-y-2">
      <summary className="cui:cursor-pointer">{localeMessages.agentConnection.connectionAndDeployment}</summary>
      <p>{localeMessages.agentConnection.creatorForwardsDevelopmentPreviewRequestsToAvoidBrowser}</p>
      <p>{localeMessages.agentConnection.theDeployedAppConnectsDirectlyToYourAgent}</p>
    </details>
  </section>;
}
