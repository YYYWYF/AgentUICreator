"use client";

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MessagesSquare, Folder, FolderOpen, Files, Search, Settings, Database, ChartNoAxesCombined, List, Bot, BookOpen, Star, CircleHelp } from "lucide-react";
import { useAgentUILocale } from "../locale.js";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarTrigger, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarFooter } from "./adapters/assistant-ui/components/ui/sidebar.js";
import { Sheet, SheetContent, SheetTitle } from "./adapters/assistant-ui/components/ui/sheet.js";

const icons = { "messages-square": MessagesSquare, folder: Folder, "folder-open": FolderOpen, files: Files, search: Search, settings: Settings, database: Database, "chart-no-axes-combined": ChartNoAxesCombined, list: List, bot: Bot, "book-open": BookOpen, star: Star, "circle-help": CircleHelp };
export type AgentUISidebarIcon = keyof typeof icons;
export interface AgentUISidebarItem {
  id: string;
  icon: AgentUISidebarIcon;
  label: string;
  content: ReactNode;
  /** Optional plugin-owned shortcut, already wrapped in its runtime context. */
  railAction?: ReactNode;
}
const NavigationContext = createContext<() => void>(() => {});
/** Plugins explicitly report navigation; no DOM selectors or conversation policy here. */
export function useAgentUISidebarNavigation() { return useContext(NavigationContext); }

export function AgentUISidebarFrame({ items, defaultActive, header, footer, children }: {
  items: readonly AgentUISidebarItem[];
  defaultActive: string | null;
  header?: ReactNode;
  footer?: ReactNode;
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
  const singleColumn = header !== undefined && items.length <= 1;
  const close = () => setActiveItemId(null);
  const content = active && <NavigationContext.Provider value={() => { if (narrow) close(); }}>{active.content}</NavigationContext.Provider>;
  const accountFooter = (collapsed: boolean) => footer === undefined ? null : <SidebarFooter className="agent-ui-sidebar-footer" data-collapsed={collapsed}>{footer}</SidebarFooter>;
  const trigger = <SidebarTrigger title={messages.toggleSidebar} className="agent-ui-sidebar-entry" disabled={items.length === 0} aria-expanded={!!active} aria-controls={active ? panelId : undefined}
    onClick={event => { lastTrigger.current = event.currentTarget; }} />;
  return (
    <div ref={shell} className="agent-ui-sidebar-frame" data-sidebar-mode={narrow ? "drawer" : "inline"} data-sidebar-active={active?.id ?? ""} data-sidebar-presentation={header === undefined ? "legacy" : singleColumn ? "single" : "multiple"}>
      <SidebarProvider isMobile={false} open={!!active} onOpenChange={open => setActiveItemId(open ? items[0]?.id ?? null : null)} className="agent-ui-sidebar-provider" style={{ minHeight: 0, height: "100%", "--sidebar-width": narrow ? "48px" : "280px", "--sidebar-width-icon": "48px" } as CSSProperties}>
        <Sidebar collapsible="icon" className="agent-ui-sidebar-container">
          {header !== undefined && <div className="agent-ui-sidebar-brand">{header}{singleColumn && active && !narrow && <div className="agent-ui-sidebar-brand-trigger">{trigger}</div>}</div>}
          <div className="agent-ui-sidebar-rail" role="navigation" aria-label={messages.sidebar}>
            {!(singleColumn && active && !narrow) && <SidebarHeader>{trigger}</SidebarHeader>}
            <SidebarContent>
              {items.map(item => item.railAction && active?.id !== item.id ? <NavigationContext.Provider key={item.id} value={() => { if (narrow) close(); }}>{item.railAction}</NavigationContext.Provider> : null)}
              {!singleColumn && <SidebarMenu>
                {items.map(item => {
                  const Icon = icons[item.icon];
                  return <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton type="button" ref={element => { if (element) triggers.current.set(item.id, element); else triggers.current.delete(item.id); }}
                      className="agent-ui-sidebar-entry" tooltip={{ children: item.label, hidden: false }} aria-label={item.label}
                      aria-expanded={active?.id === item.id} aria-controls={active?.id === item.id ? panelId : undefined}
                      isActive={active?.id === item.id} onClick={() => { lastTrigger.current = triggers.current.get(item.id) ?? null; setActiveItemId(id => id === item.id ? null : item.id); }}>
                      <Icon aria-hidden="true" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>;
                })}
              </SidebarMenu>}
            </SidebarContent>
            {!active && accountFooter(true)}
          </div>
          {!narrow && active && <aside className="agent-ui-sidebar-panel" id={panelId} aria-label={active.label}>
            {header === undefined && <SidebarHeader className="agent-ui-sidebar-panel-header">{active.label}</SidebarHeader>}
            <div className="agent-ui-sidebar-panel-content">{content}</div>
            {accountFooter(false)}
          </aside>}
        </Sidebar>
        <SidebarInset className="agent-ui-sidebar-inset">{children}</SidebarInset>
      </SidebarProvider>
      <div ref={setPortal} className="agent-ui-sidebar-portal" />
      {narrow && portal && <Sheet modal="trap-focus" open={!!active} onOpenChange={open => { if (!open) close(); }}>
        <SheetContent container={portal} contained side="left" className="agent-ui-sidebar-sheet" id={panelId}
          finalFocus={lastTrigger}>
          <SheetTitle className={header === undefined ? "agent-ui-sidebar-panel-header" : "sr-only"}>{active?.label ?? messages.sidebar}</SheetTitle>
          <div className="agent-ui-sidebar-panel-content">{content}</div>
            {accountFooter(false)}
        </SheetContent>
      </Sheet>}
    </div>
  );
}
