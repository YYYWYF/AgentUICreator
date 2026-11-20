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
import { useOptionalProject } from "./ui/project-context.js";
import type { ConversationInputControllerFactory } from './plugin-api/input-controller.js';
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
  /** Optional application-owned input behavior; Runtime provides no implementation. */
  createInputController?: ConversationInputControllerFactory;
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
export function usePresentation(): AgentUIPresentation {
  return useOptionalProject()?.presentation ?? {};
}
export function ConversationSurface(
  props: ConversationSurfacePresentationProps,
) {
  const View = usePresentation().Surface;
  return View ? <View {...props} /> : (props.children ?? null);
}
export function ConversationWelcome(props: {
  title: string;
  description?: string | undefined;
}) {
  const View = usePresentation().Welcome;
  return View ? <View {...props} /> : null;
}
export function ConversationEmptyState(props: {
  welcome?: ReactNode;
  suggestions?: ReactNode;
}) {
  const View = usePresentation().EmptyState;
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
  const View = usePresentation().UserEditComposer;
  return View ? <View /> : null;
}
export function ConversationDefaultTool(
  props: ConversationToolCallProps & { resultOnly?: boolean },
) {
  const selected = useConversationToolRenderer();
  const presentation = usePresentation();
  const View = selected ?? presentation.ToolFallback;
  return View ? <View {...props} /> : null;
}
export function AgentUIRoot(props: {
  theme: AgentUITheme;
  children: ReactNode;
}) {
  const View = usePresentation().Root;
  return View ? <View {...props} /> : props.children;
}
export function AgentUISidebarFrame(props: AgentUISidebarPresentationProps) {
  const View = usePresentation().Sidebar;
  return View ? <View {...props} /> : props.children;
}
export function useThemeSnapshot(
  service:
    | { getTheme(): string; subscribe(listener: () => void): () => void }
    | undefined,
): string {
  const fallback = usePresentation().defaultTheme ?? "light";
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
