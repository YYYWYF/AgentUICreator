import { ApiOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { Tabs, type TabsProps } from "antd";
import { useState, type ReactNode } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

import "./styles.css";

type InspectorTab = "tool" | "resources";

const inspectorTabs: NonNullable<TabsProps["items"]> = [
  {
    key: "tool",
    label: (
      <span>
        <ApiOutlined />
        Tool
      </span>
    ),
  },
  {
    key: "resources",
    label: (
      <span>
        <FolderOpenOutlined />
        Resources
      </span>
    ),
  },
];

function renderActiveSlot(
  activeTab: InspectorTab,
  renderSlot: UIPluginComponentProps["renderSlot"],
): ReactNode {
  switch (activeTab) {
    case "tool":
      return renderSlot("inspector.tool");
    case "resources":
      return renderSlot("inspector.resources");
  }
}

function isInspectorTab(key: string): key is InspectorTab {
  return key === "tool" || key === "resources";
}

export function WorkspaceInspectorPlugin({
  renderSlot,
}: UIPluginComponentProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("tool");

  return (
    <aside
      aria-label="Workspace Inspector"
      className="workspace-inspector-plugin"
      data-inspector-active-tab={activeTab}
      data-ui-plugin="workspace-inspector"
    >
      <Tabs
        activeKey={activeTab}
        className="workspace-inspector-tabs"
        items={inspectorTabs}
        onChange={(key) => {
          if (isInspectorTab(key)) {
            setActiveTab(key);
          }
        }}
        size="small"
      />

      <section
        aria-label={`${activeTab} inspector content`}
        className="workspace-inspector-content"
        data-inspector-panel={activeTab}
      >
        {renderActiveSlot(activeTab, renderSlot)}
      </section>
    </aside>
  );
}
