import type { ReactNode } from "react";

import {
  getAgentUIThemeColorScheme,
  type AgentUITheme,
  ConversationThreadBase as ConversationThread,
  type ConversationThreadComponents,
  TooltipProvider,
} from "../public.js";

export interface ConversationSurfaceProps {
  autoFocus?: boolean | undefined;
  children?: ReactNode;
  className?: string | undefined;
  components?: ConversationThreadComponents | undefined;
  composer?: ReactNode | null;
  theme?: ConversationTheme;
}

export type ConversationTheme = AgentUITheme;

export function ConversationSurface({
  autoFocus = false,
  children,
  className,
  components,
  composer = null,
  theme = "light",
}: ConversationSurfaceProps) {
  const colorScheme = getAgentUIThemeColorScheme(theme);
  return (
    <div
      className={[
        "agent-ui-conversation",
        "bg-background",
        colorScheme === "dark" ? "dark" : undefined,
        className,
      ].filter(Boolean).join(" ")}
      data-agent-ui-conversation="true"
      data-theme={theme}
      data-color-scheme={colorScheme}
    >
      <TooltipProvider>
        <ConversationThread
          autoFocus={autoFocus}
          components={components}
          composer={composer}
        />
        {children}
      </TooltipProvider>
    </div>
  );
}

export function ConversationWelcome({ title, description }: { title: string; description?: string | undefined }) {
  return <div className="aui-thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
    <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-medium tracking-tight duration-200" style={{ margin: 0, color: "var(--foreground)", fontSize: 24, fontWeight: 600, lineHeight: 1.4 }}>
      <span style={{ color: "inherit", fontSize: "inherit", fontWeight: "inherit" }}>{title}</span>
    </h1>
    {description === undefined ? null : <p className="text-muted-foreground fade-in slide-in-from-bottom-1 animate-in fill-mode-both mt-2 max-w-xl text-sm leading-6 duration-200">{description}</p>}
  </div>;
}
export function ConversationEmptyState({ welcome, suggestions }: { welcome?: ReactNode; suggestions?: ReactNode }) {
  return <div className="conversation-empty-state flex w-full flex-col items-center">
    <div className="conversation-empty-state-welcome w-full">{welcome}</div>
    <div className="conversation-empty-state-suggestions w-full">{suggestions}</div>
  </div>;
}
