import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CreatorWorkbench } from "@agent-ui/creator/ui";
import { App } from "@agent-ui/example-agent-frontend/App";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("缺少 #root 元素");
}

createRoot(rootElement).render(
  <StrictMode>
    <CreatorWorkbench>
      <App />
    </CreatorWorkbench>
  </StrictMode>,
);
