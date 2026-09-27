import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CreatorWorkbench } from "@agent-ui/creator/ui";

declare const __CREATOR_HOST_WORKSPACE_ID__: string;

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("缺少 #root 元素");
const previewUrl = import.meta.env.VITE_CREATOR_HOST_PREVIEW_URL || "http://127.0.0.1:5176/?creator-preview";

createRoot(rootElement).render(
  <StrictMode>
    <CreatorWorkbench previewWorkspaceId={__CREATOR_HOST_WORKSPACE_ID__}>
      <iframe title="Host Application" src={previewUrl} style={{ width: "100%", height: "100%", border: 0 }} />
    </CreatorWorkbench>
  </StrictMode>,
);
