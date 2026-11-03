import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { ChevronsUpDownIcon as ChevronsUpDown, LogOutIcon as LogOut, UserRoundIcon as UserRound } from "../../../../plugin-support.js";
import { Button, AgentUIPopover, AgentUIPopoverTrigger, AgentUIPopoverContent, useAgentUILocale } from "../../../../public.js";
export interface AuthAccountUser { userId?:string | undefined; userName?:string | undefined; avatar?:string | undefined; }
export interface AuthAccountPluginProps extends Omit<ComponentProps<"div">, "children"> { signOutText?: ReactNode; renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode; renderScopedSlot?: (name: string, scope: { kind: string; value: unknown }, fallback?: ReactNode) => ReactNode; hostUser?: AuthAccountUser | null | undefined; session?: {signOut():Promise<void>} | undefined; snapshot?: {user:AuthAccountUser|null;busy:boolean};  buttonProps?: ComponentProps<typeof AgentUIPopoverTrigger>; menuProps?: ComponentProps<typeof AgentUIPopoverContent>; signOutButtonProps?: ComponentProps<typeof Button>; }
export function CanonicalAuthAccountPlugin({renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, signOutText, hostUser, session, snapshot = {user:null,busy:false}, buttonProps, menuProps, signOutButtonProps, ...rootProps}: AuthAccountPluginProps) {
  const messages = useAgentUILocale("auth");
  const user = hostUser === undefined ? snapshot.user : hostUser;
  const busy = snapshot.busy;
  const [menu, setMenu] = useState(false);
  const userName = user?.userName?.trim() || messages.notSignedIn;
  const userId = user?.userId?.trim();
  const avatarUrl = user?.avatar?.trim();
  const avatar = <span className="auth-account-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : <UserRound size={18} />}</span>;
  const identity = <span className="auth-account-details"><strong>{userName}</strong>{userId && <span>{userId}</span>}</span>;
  if (hostUser !== undefined || !user) return <div {...rootProps} className={["auth-account-plugin", rootProps.className].filter(Boolean).join(" ")} data-ui-plugin="auth-account" >
    <div className="auth-account-trigger" title={userName}>{avatar}{identity}</div>
  </div>;
  return <div {...rootProps} className={["auth-account-plugin", rootProps.className].filter(Boolean).join(" ")} data-ui-plugin="auth-account" >
    <AgentUIPopover open={menu} onOpenChange={setMenu}>
      <AgentUIPopoverTrigger className="auth-account-trigger" aria-label={messages.accountMenu} title={userName} {...buttonProps}>
        {avatar}{identity}<ChevronsUpDown className="auth-account-chevron" aria-hidden="true" />
      </AgentUIPopoverTrigger>
      <AgentUIPopoverContent side="top" align="end" sideOffset={10} className="auth-account-popover" aria-label={messages.accountMenu} {...menuProps}>
        <div className="auth-account-menu-heading">{messages.account}</div>
        <div className="auth-account-profile">{avatar}{identity}</div>
        <div className="auth-account-menu-actions">
          <Button className="auth-account-sign-out" variant="ghost" disabled={busy} {...signOutButtonProps} onClick={event => { signOutButtonProps?.onClick?.(event); if (!event.defaultPrevented) { setMenu(false); void session?.signOut(); } }}>
            {signOutText ?? signOutButtonProps?.children ?? <><LogOut aria-hidden="true" /><span>{messages.signOut}</span></>}
          </Button>
        </div>
      </AgentUIPopoverContent>
    </AgentUIPopover>
  </div>;
}
