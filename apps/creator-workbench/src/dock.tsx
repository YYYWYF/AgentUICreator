import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CreatorWorkbench } from "@agent-ui/creator/ui";

const root = document.getElementById("root");
if (root === null) throw new Error("缺少 #root 元素");

createRoot(root).render(
  <StrictMode>
    <CreatorWorkbench layout="dock">{null}</CreatorWorkbench>
  </StrictMode>,
);
