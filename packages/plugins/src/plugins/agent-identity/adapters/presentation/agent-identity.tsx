import type { ComponentProps, ReactNode } from "react";
import { BotIcon as Bot } from "../../../../plugin-support.js";
import { useAgentUILocale, useAgentUILocaleCode } from "../../../../public.js";
export interface AgentIdentityPluginProps { renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode; config?: { name?: string | Partial<Record<"en-US"|"zh-CN",string>>; logo?: string; description?: string }; rootProps?: ComponentProps<"div">; logoProps?: ComponentProps<"img">; nameProps?: ComponentProps<"span">; descriptionProps?: ComponentProps<"span">; children?: ReactNode; }
export function CanonicalAgentIdentityPlugin({config, rootProps, logoProps, nameProps, descriptionProps, children}: AgentIdentityPluginProps) {
  const messages = useAgentUILocale("agentIdentity");
  const locale = useAgentUILocaleCode();
  const name = typeof config?.name === "string" ? config.name : config?.name?.[locale] || messages.name;
  return <div className="agent-identity-plugin" role="group" aria-label={name} title={name} data-ui-plugin="agent-identity" {...rootProps}>
    {children ?? <>
      <div className="agent-identity-content">
        <div className="agent-identity-logo">
          {config?.logo ? <img src={config?.logo} alt="" {...logoProps} /> : <Bot aria-hidden="true" />}
        </div>
        <div className="agent-identity-heading">
          <span className="agent-identity-name" {...nameProps}>{name}</span>
          {config?.description && <span className="agent-identity-description" {...descriptionProps}>{config?.description}</span>}
        </div>
      </div>
    </>}
  </div>;
}
