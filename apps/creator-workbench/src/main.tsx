import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";

import { CreatorWorkbench } from "@agent-ui/creator/ui";
import {
  createCreatorRuntimeCompositionReporter,
  createCreatorRuntimeDiagnosticReporter,
} from "@agent-ui/creator/runtime-diagnostics";
import { App } from "@agent-ui/example-agent-frontend/App";

function TargetPreview({ threadId }: { threadId: string }) {
  const onRuntimeDiagnostic = useMemo(
    () => createCreatorRuntimeDiagnosticReporter({ threadId }),
    [threadId],
  );
  const onRuntimeComposition = useMemo(
    () => createCreatorRuntimeCompositionReporter({ threadId }),
    [threadId],
  );
  return (
    <App
      onRuntimeComposition={onRuntimeComposition}
      onRuntimeDiagnostic={onRuntimeDiagnostic}
    />
  );
}

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("缺少 #root 元素");
}

createRoot(rootElement).render(
  <StrictMode>
    <CreatorWorkbench>
      {({ threadId }) => <TargetPreview threadId={threadId} />}
    </CreatorWorkbench>
  </StrictMode>,
);
