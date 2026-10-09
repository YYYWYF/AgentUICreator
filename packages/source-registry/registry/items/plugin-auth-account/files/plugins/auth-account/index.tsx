import { useState } from "react";
import { Button } from "@agent-ui/react";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import { useAgentUILocale } from "@agent-ui/react";
import type { AuthSessionService, AuthSessionSnapshot } from "../../services/auth/session";
import "./styles.css";
const fallback: AuthSessionSnapshot = { status: "checking", user: null, busy: false, error: null };
export function AccountView() {
  const messages = useAgentUILocale("auth");
  const session = usePluginService<AuthSessionService>("auth.session");
  const { user, busy } = usePluginServiceSnapshot(session, fallback);
  const [menu, setMenu] = useState(false);
  if (!user) return null;
  return <div className="auth-account-plugin">
    <Button className="auth-account-trigger" variant="ghost" aria-label={messages.accountMenu} title={user.displayName} aria-expanded={menu} onClick={() => setMenu(!menu)}>
      <span className="auth-account-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.slice(0, 1)}</span>
      <span className="auth-account-details"><strong>{user.displayName}</strong>{user.email && <span>{user.email}</span>}</span>
    </Button>
    {menu && <Button className="auth-account-sign-out" disabled={busy} onClick={() => { setMenu(false); void session?.signOut(); }}>{messages.signOut}</Button>}
  </div>;
}
