import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { ChevronsUpDownIcon as ChevronsUpDown, LogOutIcon as LogOut, UserRoundIcon as UserRound } from "../../../../plugin-support.js";
import { Button, AgentUIPopover, AgentUIPopoverTrigger, AgentUIPopoverContent, useAgentUILocale } from "../../../../public.js";
export interface AuthAccountUser { userId?:string | undefined; userName?:string | undefined; avatar?:string | undefined; }
export interface AuthAccountPluginProps { renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode; hostUser?: AuthAccountUser | null | undefined; session?: {signOut():Promise<void>} | undefined; snapshot?: {user:AuthAccountUser|null;busy:boolean}; rootProps?: ComponentProps<"div">; triggerProps?: ComponentProps<typeof AgentUIPopoverTrigger>; contentProps?: ComponentProps<typeof AgentUIPopoverContent>; signOutProps?: ComponentProps<typeof Button>; }
export function CanonicalAuthAccountPlugin({hostUser, session, snapshot = {user:null,busy:false}, rootProps, triggerProps, contentProps, signOutProps}: AuthAccountPluginProps) {
  const messages = useAgentUILocale("auth");
  const user = hostUser === undefined ? snapshot.user : hostUser;
  const busy = snapshot.busy;
  const [menu, setMenu] = useState(false);
  const userName = user?.userName?.trim() || messages.notSignedIn;
  const userId = user?.userId?.trim();
  const avatarUrl = user?.avatar?.trim();
  const avatar = <span className="auth-account-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : <UserRound size={18} />}</span>;
  const identity = <span className="auth-account-details"><strong>{userName}</strong>{userId && <span>{userId}</span>}</span>;
  if (hostUser !== undefined || !user) return <div className="auth-account-plugin" data-ui-plugin="auth-account" {...rootProps}>
    <div className="auth-account-trigger" title={userName}>{avatar}{identity}</div>
  </div>;
  return <div className="auth-account-plugin" data-ui-plugin="auth-account" {...rootProps}>
    <AgentUIPopover open={menu} onOpenChange={setMenu}>
      <AgentUIPopoverTrigger className="auth-account-trigger" aria-label={messages.accountMenu} title={userName} {...triggerProps}>
        {avatar}{identity}<ChevronsUpDown className="auth-account-chevron" aria-hidden="true" />
      </AgentUIPopoverTrigger>
      <AgentUIPopoverContent side="top" align="end" sideOffset={10} className="auth-account-popover" aria-label={messages.accountMenu} {...contentProps}>
        <div className="auth-account-menu-heading">{messages.account}</div>
        <div className="auth-account-profile">{avatar}{identity}</div>
        <div className="auth-account-menu-actions">
          <Button className="auth-account-sign-out" variant="ghost" disabled={busy} {...signOutProps} onClick={event => { signOutProps?.onClick?.(event); if (!event.defaultPrevented) { setMenu(false); void session?.signOut(); } }}>
            <LogOut aria-hidden="true" /><span>{messages.signOut}</span>
          </Button>
        </div>
      </AgentUIPopoverContent>
    </AgentUIPopover>
  </div>;
}
