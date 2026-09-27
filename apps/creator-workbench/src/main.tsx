import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CreatorWorkbench } from "@agent-ui/creator/ui";
import { connectCreatorHostPreview } from "@agent-ui/creator/host-preview";

declare const __CREATOR_HOST_WORKSPACE_ID__: string;
declare const __CREATOR_RUNTIME_DIAGNOSTICS_ENABLED__: boolean;

function HostPreview({ threadId, workspaceId }: { threadId: string; workspaceId: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const url = new URL(import.meta.env.VITE_CREATOR_HOST_PREVIEW_URL || "http://127.0.0.1:5176/", location.href);
  url.searchParams.set("creator-preview", "");
  useEffect(() => {
    if (frame.current === null) return;
    return connectCreatorHostPreview(frame.current, {
      threadId, workspaceId,
      runtimeDiagnostics: __CREATOR_RUNTIME_DIAGNOSTICS_ENABLED__,
      visualObservation: import.meta.env.VITE_ENABLE_VISUAL_OBSERVATION === "true",
    });
  }, [threadId, workspaceId, loadRevision]);
  return <iframe ref={frame} title="Host Application" src={url.href} onLoad={() => setLoadRevision(value => value + 1)} style={{ width: "100%", height: "100%", border: 0 }} />;
}

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("缺少 #root 元素");
createRoot(rootElement).render(
  <StrictMode>
    <CreatorWorkbench previewWorkspaceId={__CREATOR_HOST_WORKSPACE_ID__}>
      {context => <HostPreview {...context} />}
    </CreatorWorkbench>
  </StrictMode>,
);
