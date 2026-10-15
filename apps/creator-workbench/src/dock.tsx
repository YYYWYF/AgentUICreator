import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { CreatorWorkbench } from "@za38.03/agent-ui-creator/ui";
import { connectCreatorDockHost } from "@za38.03/agent-ui-creator/host-preview";

declare const __CREATOR_HOST_WORKSPACE_ID__: string;
function DockHostBridge({ threadId, workspaceId }: { threadId: string; workspaceId: string }) {
  useEffect(() => connectCreatorDockHost({ threadId, workspaceId, runtimeDiagnostics: false, visualObservation: false }), [threadId, workspaceId]);
  return null;
}

const root = document.getElementById("root");
if (root === null) throw new Error("缺少 #root 元素");

createRoot(root).render(
  <StrictMode>
    <CreatorWorkbench layout="dock" previewWorkspaceId={__CREATOR_HOST_WORKSPACE_ID__}>{context => <DockHostBridge {...context} />}</CreatorWorkbench>
  </StrictMode>,
);
