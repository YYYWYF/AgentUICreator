import { useAuthSession } from "../../services/hooks/useAuthSession";
import "./styles.css";
import { CanonicalAuthGatePlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";

export function LoginScreen({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const { session, snapshot: state } = useAuthSession();
  return <Implementation session={session} state={state} {...props} />;
}
