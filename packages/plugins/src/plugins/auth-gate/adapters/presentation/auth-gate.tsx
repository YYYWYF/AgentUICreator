import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { Button, Input, useAgentUILocale } from "../../../../public.js";
import type { AuthSessionSnapshot } from "./auth-contract.js";
export interface AuthGatePluginProps { renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode; session?: {signIn(input:{account:string;password:string}):Promise<void>} | undefined; state?: AuthSessionSnapshot; rootProps?: ComponentProps<"div">; formProps?: ComponentProps<"form">; accountProps?: ComponentProps<typeof Input>; passwordProps?: ComponentProps<typeof Input>; submitProps?: ComponentProps<typeof Button>; }
export function CanonicalAuthGatePlugin({ session, state = {status:"checking",user:null,busy:false,error:null}, rootProps, formProps, accountProps, passwordProps, submitProps }: AuthGatePluginProps) {
  const messages = useAgentUILocale("auth");
  const [account, setAccount] = useState(""); const [password, setPassword] = useState("");
  if (state.status === "checking") return <div className="auth-gate-plugin" role="status" {...rootProps}>{messages.checking}</div>;
  return <div className="auth-gate-plugin" {...rootProps}><form className="auth-gate-form" {...formProps} onSubmit={event => {
    formProps?.onSubmit?.(event); if(event.defaultPrevented)return;
    event.preventDefault(); const credentials = { account, password }; setPassword(""); void session?.signIn(credentials);
  }} aria-busy={state.busy}>
    <h1>{messages.title}</h1>
    <label>{messages.account}<Input name="username" autoComplete="username" required value={account} disabled={state.busy} {...accountProps} onChange={event => {accountProps?.onChange?.(event);setAccount(event.target.value);}} /></label>
    <label>{messages.password}<Input name="password" type="password" autoComplete="current-password" required value={password} disabled={state.busy} {...passwordProps} onChange={event => {passwordProps?.onChange?.(event);setPassword(event.target.value);}} /></label>
    {state.error && <p role="alert">{state.error === "sign-in-failed" ? messages.signInFailed : messages.signOutFailed}</p>}
    <Button type="submit" disabled={state.busy || !session} {...submitProps}>{state.busy ? messages.working : messages.signIn}</Button>
  </form></div>;
}
