import { memo, StrictMode, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";

import { CreatorWorkbench } from "@agent-ui/creator/ui";
import {
  createCreatorRuntimeCompositionReporter,
  createCreatorRuntimeDiagnosticReporter,
} from "@agent-ui/creator/runtime-diagnostics";
import { createVisualObservationReporter } from "@agent-ui/creator/visual-observation";
import { App } from "@agent-ui/example-agent-frontend/App";

declare const __CREATOR_RUNTIME_DIAGNOSTICS_ENABLED__: boolean;

const runtimeDiagnosticsEnabled =
  __CREATOR_RUNTIME_DIAGNOSTICS_ENABLED__;
const visualObservationEnabled =
  import.meta.env.VITE_ENABLE_VISUAL_OBSERVATION === "true";

interface PreviewThreadIdRef {
  current: string;
}

const TargetPreview = memo(function TargetPreview({
  threadIdRef,
}: {
  threadIdRef: PreviewThreadIdRef;
}) {
  const onRuntimeDiagnostic = useMemo(
    () =>
      runtimeDiagnosticsEnabled
        ? createCreatorRuntimeDiagnosticReporter({
            threadId: () => threadIdRef.current,
          })
        : undefined,
    [threadIdRef],
  );
  const onRuntimeComposition = useMemo(
    () =>
      runtimeDiagnosticsEnabled
        ? createCreatorRuntimeCompositionReporter({
            threadId: () => threadIdRef.current,
          })
        : undefined,
    [threadIdRef],
  );
  const onPreviewCommitted = useMemo(
    () =>
      visualObservationEnabled
        ? createVisualObservationReporter()
        : undefined,
    [],
  );
  return (
    <App
      onPreviewCommitted={onPreviewCommitted}
      onRuntimeComposition={onRuntimeComposition}
      onRuntimeDiagnostic={onRuntimeDiagnostic}
    />
  );
});

function TargetPreviewHost({ threadId }: { threadId: string }) {
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  return <TargetPreview threadIdRef={threadIdRef} />;
}

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("缺少 #root 元素");
}

createRoot(rootElement).render(
  <StrictMode>
    <CreatorWorkbench>
      {({ threadId }) => <TargetPreviewHost threadId={threadId} />}
    </CreatorWorkbench>
  </StrictMode>,
);
