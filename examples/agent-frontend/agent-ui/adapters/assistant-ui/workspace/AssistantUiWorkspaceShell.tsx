import type { UIPluginComponentProps } from "../../../../framework/contracts/ui-plugin";
import { useAgentUIThemeMode } from "../../theme/useAgentUITheme";
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from "../../../vendor/assistant-ui/components/ui/sidebar";

export function AssistantUiWorkspaceShell({
  renderSlot,
}: UIPluginComponentProps) {
  const theme = useAgentUIThemeMode();

  return (
    <SidebarProvider
      className={[
        "agent-ui-assistant-ui",
        theme === "dark" ? "dark" : undefined,
      ].filter(Boolean).join(" ")}
      data-agent-ui-assistant-ui="true"
      data-theme={theme}
    >
      <div
        className="flex h-full min-h-0 w-full"
        data-agent-ui-composition="workspace"
      >
        <Sidebar collapsible="none">
          <SidebarContent className="px-2">
            {renderSlot("agent-conversations", undefined, { sizing: "fill" })}
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="min-h-0 overflow-hidden">
          {renderSlot("workspace.conversation", undefined, { sizing: "fill" })}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
