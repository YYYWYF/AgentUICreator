import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { CreatorWorkbench } from "../src/ui/CreatorWorkbench.js";
import { connectCreatorDockHost } from "../src/host-preview/hostPreviewWorkbench.js";

const workspaceId = new URLSearchParams(location.search).get("workspace") ?? undefined;
function DockHostBridge({ threadId, workspaceId }: { threadId: string; workspaceId: string }) {
  useEffect(() => connectCreatorDockHost({ threadId, workspaceId, runtimeDiagnostics: false, visualObservation: false }), [threadId, workspaceId]);
  return null;
}
const root = document.getElementById("root");
if (root) createRoot(root).render(
  <StrictMode>
    <CreatorWorkbench layout="dock" previewWorkspaceId={workspaceId}
      onLocaleChange={locale => { document.documentElement.lang = locale; }}>
      {context => <DockHostBridge {...context} />}
    </CreatorWorkbench>
  </StrictMode>,
);
