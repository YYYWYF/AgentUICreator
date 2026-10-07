import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES, type CreatorLocaleMessages } from "./i18n/locale.js";
import { useEffect, useRef, useState } from "react";
import { CONNECTION_API, type AgentConnectionState } from "../agent-connection/types.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";
import { Button } from "./components/button.js";
import { Input } from "./components/input.js";
export const CONNECTION_CHANGED = "agent-ui-creator:connection-changed";
export async function readAgentConnection(workspaceId: string, body?: unknown, localeMessages: CreatorLocaleMessages = DEFAULT_CREATOR_MESSAGES): Promise<AgentConnectionState> {
  const response = await fetch(CONNECTION_API, {
    headers: { "Content-Type": "application/json", [CREATOR_WORKSPACE_ID_HEADER]: workspaceId },
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? localeMessages.agentConnection.connectionFailed);
  return value;
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
    setSaving(true); setError("");
    try {
      const value = await readAgentConnection(workspaceId, { activeSource, ...(activeSource === "connected" ? { endpoint: endpoint.trim() } : {}) }, localeMessages);
      setState(value); setEndpoint(value.endpoint ?? "");
      window.dispatchEvent(new CustomEvent(CONNECTION_CHANGED, { detail: { workspaceId, state: value } }));
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }
  const sourceBusy = running || Boolean(state?.running);
  if (!visible && state?.configured !== false && !error) return null;
  return <section className="cui:p-3 cui:space-y-3" aria-label={localeMessages.agentConnection.agentConnectionSettings}>
    <strong>{state?.configured ? localeMessages.agentConnection.agentConnectionSettings : localeMessages.agentConnection.connectAnAGUIAgentServiceOrExplore}</strong>
    <label className="cui:block cui:space-y-1">{localeMessages.agentConnection.agentServiceAddress}<Input value={endpoint} placeholder="http://localhost:8000/agent" onChange={event => setEndpoint(event.target.value)} disabled={saving || sourceBusy} /></label>
    <p className="cui:text-xs cui:text-muted-foreground">{localeMessages.agentConnection.creatorForwardsDevelopmentPreviewRequestsToAvoidBrowser}</p>
    <div className="cui:flex cui:gap-2 cui:flex-wrap">
      <Button size="sm" disabled={!state || saving || sourceBusy || !endpoint.trim()} onClick={() => void save("connected")}>{localeMessages.agentConnection.useThisAddress}</Button>
      <Button size="sm" variant="outline" disabled={!state || saving || sourceBusy} onClick={() => void save("mock")}>{state?.configured ? localeMessages.agentConnection.useDemoAgent : localeMessages.agentConnection.useDemoAgent}</Button>
    </div>
    {state?.configured && <p className="cui:text-xs">{state.activeSource === "connected" ? localeMessages.agentConnection.currentlyUsingYourAgentService : localeMessages.agentConnection.currentlyUsingDemoAgentMock}</p>}
    {sourceBusy && <p role="status">{localeMessages.agentConnection.stopTheCurrentRunBeforeSwitchingAgentSources}</p>}
    {error && <p role="alert">{error}</p>}
    {!state && error && <Button size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>{localeMessages.agentConnection.reloadConnectionSettings}</Button>}
    <p className="cui:text-xs cui:text-muted-foreground">{localeMessages.agentConnection.theDeployedAppConnectsDirectlyToYourAgent}</p>
  </section>;
}
