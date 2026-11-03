import { useAuthSession } from "../../services/hooks/useAuthSession";
import "./styles.css";
import { CanonicalAuthAccountPlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import {useHostUser} from "@za38.03/agent-ui-runtime/ui/application/host-user";

export function AccountView({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const hostUser=useHostUser();
  const { session, snapshot } = useAuthSession();
  return <Implementation hostUser={hostUser} session={session} snapshot={snapshot} {...props} />;
}
