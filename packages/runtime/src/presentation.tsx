import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useSyncExternalStore,
} from "react";
import type {
  ConversationThreadComponents,
  ConversationToolCallProps,
} from "./plugin-api/conversation.js";
import { useConversationToolRenderer } from "./conversation-support/tool-renderer-context.js";
import { useOptionalAgentUIProject } from "./ui/project-context.js";
import type {
  AgentUILocaleCode,
  AgentUILocaleMessages,
  AgentUILocaleOverrides,
} from "./locale.js";
export type AgentUITheme = string;
export type AgentUIColorScheme = "light" | "dark";
export interface ConversationSurfacePresentationProps {
  autoFocus?: boolean | undefined;
  children?: ReactNode;
  className?: string | undefined;
  components?: ConversationThreadComponents | undefined;
  composer?: ReactNode | null | undefined;
  theme?: AgentUITheme | undefined;
}
export interface AgentUISidebarPresentationItem {
  id: string;
  icon: string;
  label: string;
  content: ReactNode;
  railAction?: ReactNode;
}
export interface AgentUISidebarPresentationProps {
  items: readonly AgentUISidebarPresentationItem[];
  defaultActive: string | null;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}
/** Instances and components are supplied by the application, never selected by Runtime. */
export interface AgentUIPresentation {
  Surface?: ComponentType<ConversationSurfacePresentationProps>;
  Welcome?: ComponentType<{ title: string; description?: string | undefined }>;
  EmptyState?: ComponentType<{ welcome?: ReactNode; suggestions?: ReactNode }>;
  UserEditComposer?: ComponentType;
  ToolFallback?: ComponentType<
    ConversationToolCallProps & { resultOnly?: boolean }
  >;
  Root?: ComponentType<{ theme: AgentUITheme; children: ReactNode }>;
  Sidebar?: ComponentType<AgentUISidebarPresentationProps>;
  defaultTheme?: AgentUITheme;
  resolveLocale?: (
    locale: AgentUILocaleCode,
    messages?: AgentUILocaleOverrides,
  ) => AgentUILocaleMessages;
}
export function useAgentUIPresentation(): AgentUIPresentation {
  return useOptionalAgentUIProject()?.presentation ?? {};
}
export function ConversationSurface(
  props: ConversationSurfacePresentationProps,
) {
  const View = useAgentUIPresentation().Surface;
  return View ? <View {...props} /> : (props.children ?? null);
}
export function ConversationWelcome(props: {
  title: string;
  description?: string | undefined;
}) {
  const View = useAgentUIPresentation().Welcome;
  return View ? <View {...props} /> : null;
}
export function ConversationEmptyState(props: {
  welcome?: ReactNode;
  suggestions?: ReactNode;
}) {
  const View = useAgentUIPresentation().EmptyState;
  return View ? (
    <View {...props} />
  ) : (
    <>
      {props.welcome}
      {props.suggestions}
    </>
  );
}
export function ConversationCanonicalUserEditComposer() {
  const View = useAgentUIPresentation().UserEditComposer;
  return View ? <View /> : null;
}
export function ConversationDefaultTool(
  props: ConversationToolCallProps & { resultOnly?: boolean },
) {
  const selected = useConversationToolRenderer();
  const presentation = useAgentUIPresentation();
  const View = selected ?? presentation.ToolFallback;
  return View ? <View {...props} /> : null;
}
export function AgentUIRoot(props: {
  theme: AgentUITheme;
  children: ReactNode;
}) {
  const View = useAgentUIPresentation().Root;
  return View ? <View {...props} /> : props.children;
}
export function AgentUISidebarFrame(props: AgentUISidebarPresentationProps) {
  const View = useAgentUIPresentation().Sidebar;
  return View ? <View {...props} /> : props.children;
}
export function useAgentUIThemeSnapshot(
  service:
    | { getTheme(): string; subscribe(listener: () => void): () => void }
    | undefined,
): string {
  const fallback = useAgentUIPresentation().defaultTheme ?? "light";
  const subscribe = useCallback(
    (listener: () => void) => service?.subscribe(listener) ?? (() => {}),
    [service],
  );
  const get = useCallback(
    () => service?.getTheme() ?? fallback,
    [service, fallback],
  );
  return useSyncExternalStore(subscribe, get, get);
}
