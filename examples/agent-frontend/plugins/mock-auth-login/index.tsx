import { Button, Card, Input, Typography } from "antd";
import { useState, type FormEvent } from "react";

import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import {
  AUTH_SESSION_SERVICE,
  type AuthSessionService,
  type AuthSessionSnapshot,
} from "../../services/auth-session";

import "./styles.css";

const ANONYMOUS_SESSION: AuthSessionSnapshot = { authenticated: false };

export function MockAuthLoginPlugin() {
  const auth = usePluginService<AuthSessionService>(AUTH_SESSION_SERVICE);
  const authSnapshot = usePluginServiceSnapshot(auth, ANONYMOUS_SESSION);
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("123456");
  const [validationMessage, setValidationMessage] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (email.trim().length === 0 || password.trim().length === 0) {
      setValidationMessage("Enter a non-empty email and password.");
      return;
    }

    setValidationMessage(undefined);
    auth?.login({ email });
  }

  return (
    <section
      className="mock-auth-login-plugin"
      data-authenticated={authSnapshot.authenticated}
      data-ui-plugin="mock-auth-login"
    >
      <Card className="mock-auth-login-card">
        <div className="mock-auth-login-heading">
          <Typography.Title level={2}>Agent UI Creator</Typography.Title>
          <Typography.Text type="secondary">
            Sign in to enter workspace
          </Typography.Text>
        </div>

        <form className="mock-auth-login-form" onSubmit={handleSubmit}>
          <label htmlFor="mock-auth-email">Email</label>
          <Input
            autoComplete="email"
            id="mock-auth-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="demo@example.com"
            value={email}
          />

          <label htmlFor="mock-auth-password">Password</label>
          <Input.Password
            autoComplete="current-password"
            id="mock-auth-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="123456"
            value={password}
          />

          {validationMessage === undefined ? null : (
            <Typography.Text role="alert" type="danger">
              {validationMessage}
            </Typography.Text>
          )}

          <Button
            block
            disabled={auth === undefined}
            htmlType="submit"
            size="large"
            type="primary"
          >
            Sign in
          </Button>
        </form>

        <Typography.Text className="mock-auth-login-note" type="secondary">
          Mock authentication only
        </Typography.Text>
      </Card>
    </section>
  );
}
