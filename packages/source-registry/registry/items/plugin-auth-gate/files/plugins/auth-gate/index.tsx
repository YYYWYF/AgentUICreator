import { useState } from "react";
import { Button, Input } from "@agent-ui/react";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import { useAgentUILocale } from "@agent-ui/react";
import type { AuthSessionService, AuthSessionSnapshot } from "../../services/auth/session";
import "./styles.css";
const fallback: AuthSessionSnapshot = { status: "checking", user: null, busy: false, error: null };
export function LoginScreen() {
  const messages = useAgentUILocale("auth");
  const session = usePluginService<AuthSessionService>("auth.session");
  const state = usePluginServiceSnapshot(session, fallback);
  const [account, setAccount] = useState(""); const [password, setPassword] = useState("");
  if (state.status === "checking") return <div className="auth-gate-plugin" role="status">{messages.checking}</div>;
  return <div className="auth-gate-plugin"><form className="auth-gate-form" onSubmit={event => {
    event.preventDefault(); const credentials = { account, password }; setPassword(""); void session?.signIn(credentials);
  }} aria-busy={state.busy}>
    <h1>{messages.title}</h1>
    <label>{messages.account}<Input name="username" autoComplete="username" required value={account} disabled={state.busy} onChange={event => setAccount(event.target.value)} /></label>
    <label>{messages.password}<Input name="password" type="password" autoComplete="current-password" required value={password} disabled={state.busy} onChange={event => setPassword(event.target.value)} /></label>
    {state.error && <p role="alert">{state.error === "sign-in-failed" ? messages.signInFailed : messages.signOutFailed}</p>}
    <Button type="submit" disabled={state.busy || !session}>{state.busy ? messages.working : messages.signIn}</Button>
  </form></div>;
}
