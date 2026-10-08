"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MessagesSquare, Folder, FolderOpen, Files, Search, Settings, Database, ChartNoAxesCombined, List, Bot, BookOpen, Star, CircleHelp } from "lucide-react";
import { useAgentUILocale } from "../locale.js";
import { SidebarProvider, Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset } from "./adapters/assistant-ui/components/ui/sidebar.js";
import { Sheet, SheetContent, SheetTitle } from "./adapters/assistant-ui/components/ui/sheet.js";

const icons = { "messages-square": MessagesSquare, folder: Folder, "folder-open": FolderOpen, files: Files, search: Search, settings: Settings, database: Database, "chart-no-axes-combined": ChartNoAxesCombined, list: List, bot: Bot, "book-open": BookOpen, star: Star, "circle-help": CircleHelp };
export type AgentUISidebarIcon = keyof typeof icons;
export interface AgentUISidebarItem {
  id: string;
  icon: AgentUISidebarIcon;
  label: string;
  content: ReactNode;
}
const NavigationContext = createContext<() => void>(() => {});
/** Plugins explicitly report navigation; no DOM selectors or conversation policy here. */
export function useAgentUISidebarNavigation() { return useContext(NavigationContext); }

export function AgentUISidebarFrame({ items, defaultActive, children }: {
  items: readonly AgentUISidebarItem[];
  defaultActive: string | null;
  children: ReactNode;
}) {
  const messages = useAgentUILocale("accessibility");
  const [activeItemId, setActiveItemId] = useState<string | null>(() => defaultActive);
  const [narrow, setNarrow] = useState(true);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const active = items.find(item => item.id === activeItemId);
  useEffect(() => {
    if (activeItemId !== null && !items.some(item => item.id === activeItemId)) setActiveItemId(null);
  }, [items, activeItemId]);
  useLayoutEffect(() => {
    const element = shell.current;
    if (!element) return;
    const measure = () => setNarrow(element.getBoundingClientRect().width < 648);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const close = () => setActiveItemId(null);
  const content = active && <NavigationContext.Provider value={() => { if (narrow) close(); }}>{active.content}</NavigationContext.Provider>;
  return (
    <div ref={shell} className="agent-ui-sidebar-frame" data-sidebar-mode={narrow ? "drawer" : "inline"} data-sidebar-active={active?.id ?? ""}>
      <SidebarProvider isMobile={narrow} open={false} className="agent-ui-sidebar-provider" style={{ minHeight: 0, height: "100%", "--sidebar-width": "48px" } as CSSProperties}>
        <Sidebar collapsible="none" className="agent-ui-sidebar-rail" role="navigation" aria-label={messages.sidebar}>
          <SidebarContent>
            <SidebarMenu>
              {items.map(item => {
                const Icon = icons[item.icon];
                return <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton type="button" ref={element => { if (element) triggers.current.set(item.id, element); else triggers.current.delete(item.id); }}
                    className="agent-ui-sidebar-entry" tooltip={item.label} aria-label={item.label}
                    aria-expanded={active?.id === item.id} aria-controls={active?.id === item.id ? panelId : undefined}
                    isActive={active?.id === item.id} onClick={() => { lastTrigger.current = triggers.current.get(item.id) ?? null; setActiveItemId(id => id === item.id ? null : item.id); }}>
                    <Icon aria-hidden="true" />
                  </SidebarMenuButton>
                </SidebarMenuItem>;
              })}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        {!narrow && <div className="agent-ui-sidebar-panel-track" data-open={!!active}>
          {active && <aside className="agent-ui-sidebar-panel" id={panelId} aria-label={active.label}>{content}</aside>}
        </div>}
        <SidebarInset className="agent-ui-sidebar-inset">{children}</SidebarInset>
      </SidebarProvider>
      <div ref={setPortal} className="agent-ui-sidebar-portal" />
      {narrow && portal && <Sheet modal="trap-focus" open={!!active} onOpenChange={open => { if (!open) close(); }}>
        <SheetContent container={portal} contained side="left" className="agent-ui-sidebar-sheet" id={panelId}
          finalFocus={lastTrigger}>
          <SheetTitle className="sr-only">{active?.label ?? messages.sidebar}</SheetTitle>
          {content}
        </SheetContent>
      </Sheet>}
    </div>
  );
}
