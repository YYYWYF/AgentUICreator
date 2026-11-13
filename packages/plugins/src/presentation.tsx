import type { AgentUIPresentation } from "@za38.03/agent-ui-runtime/presentation";
import {
  ConversationSurface,
  ConversationWelcome,
  ConversationEmptyState,
} from "./internal/conversation-surface.js";
import { AgentUIRoot } from "./internal/style-boundary/AgentUIRoot.js";
import {
  AgentUISidebarFrame,
  ConversationCanonicalUserEditComposer,
  ConversationDefaultTool,
  type AgentUISidebarItem,
} from "./public.js";
import {
  resolveAgentUILocaleMessages,
  type AgentUILocaleOverrides,
} from "./locale.js";
import {
  AGENT_UI_DEFAULT_THEME,
  isAgentUITheme,
} from "./theme/theme-contract.js";
/** Project-owned composition selects these defaults; Runtime imports no Plugin. */
export function createDefaultAgentUIPresentation(): AgentUIPresentation {
  return {
    Surface: (props) => (
      <ConversationSurface
        {...props}
        theme={
          isAgentUITheme(props.theme) ? props.theme : AGENT_UI_DEFAULT_THEME
        }
      />
    ),
    Welcome: ConversationWelcome,
    EmptyState: ConversationEmptyState,
    UserEditComposer: ConversationCanonicalUserEditComposer,
    ToolFallback: ConversationDefaultTool,
    Root: (props) => (
      <AgentUIRoot
        {...props}
        theme={
          isAgentUITheme(props.theme) ? props.theme : AGENT_UI_DEFAULT_THEME
        }
      />
    ),
    Sidebar: (props) => (
      <AgentUISidebarFrame
        {...props}
        items={props.items as AgentUISidebarItem[]}
      />
    ),
    defaultTheme: AGENT_UI_DEFAULT_THEME,
    resolveLocale: (locale, messages) =>
      resolveAgentUILocaleMessages(locale, messages as AgentUILocaleOverrides),
  };
}
