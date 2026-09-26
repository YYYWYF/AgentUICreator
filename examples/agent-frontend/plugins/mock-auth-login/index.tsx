import { useId, useState } from "react";
import { ArrowRight, UserRound } from "lucide-react";
import { Button } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useMockAuthLocale } from "./i18n";
import { useAgentUIThemeMode } from "../../agent-ui/theme/useAgentUITheme";
import { usePluginService } from "../../runtime/plugins";
import { AUTH_SESSION_SERVICE, type AuthSessionService } from "../../services/auth-session";
import "./styles.css";

export function MockAuthLoginPlugin(_props: UIPluginComponentProps) {
  const { messages: locale, direction } = useMockAuthLocale();
  const theme = useAgentUIThemeMode();
  const session = usePluginService<AuthSessionService>(AUTH_SESSION_SERVICE);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function login() {
    if (session === undefined || pending) return;
    setPending(true);
    setFailed(false);
    try {
      await session.login();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      dir={direction}
      className={`mock-auth-login agent-ui-conversation${theme === "dark" ? " dark" : ""}`}
      data-theme={theme}
      data-ui-plugin="mock-auth-login"
    >
      <div className="mock-auth-login-card">
        <div className="mock-auth-login-icon"><UserRound aria-hidden="true" /></div>
        <span className="mock-auth-login-badge">{locale.demo}</span>
        <h1 id={titleId}>{locale.title}</h1>
        <p>{locale.description}</p>
        <Button
          className="mock-auth-login-button"
          disabled={session === undefined || pending}
          onClick={() => { void login(); }}
          type="button"
        >
          {pending ? locale.signingIn : locale.signIn}
          <ArrowRight aria-hidden="true" />
        </Button>
        {failed ? <p role="alert">{locale.failed}</p> : null}
        <small>{locale.hint}</small>
      </div>
    </section>
  );
}
