import { Bot } from "lucide-react";
import { useAgentUILocaleCode, AgentUISidebarHeader as SidebarHeader, AgentUISidebarMenu as SidebarMenu, AgentUISidebarMenuItem as SidebarMenuItem, AgentUISidebarMenuButton as SidebarMenuButton } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
import { agentIdentityConfig } from "./config";
import "./styles.css";

export function AgentIdentityPlugin(_props: UIPluginComponentProps) {
  const messages = useAgentUILocale("agentIdentity");
  const locale = useAgentUILocaleCode();
  const name = typeof agentIdentityConfig.name === "string" ? agentIdentityConfig.name : agentIdentityConfig.name[locale] || messages.name;
  return <SidebarHeader className="agent-identity-plugin" role="group" aria-label={name} data-ui-plugin="agent-identity">
    <SidebarMenu><SidebarMenuItem>
      <SidebarMenuButton size="lg" render={<div />} className="agent-identity-content" tooltip={name}>
        <div className="agent-identity-logo">
          {agentIdentityConfig.logo ? <img src={agentIdentityConfig.logo} alt="" /> : <Bot aria-hidden="true" />}
        </div>
        <div className="agent-identity-heading">
          <span className="agent-identity-name">{name}</span>
          {agentIdentityConfig.description && <span className="agent-identity-description">{agentIdentityConfig.description}</span>}
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem></SidebarMenu>
  </SidebarHeader>;
}
