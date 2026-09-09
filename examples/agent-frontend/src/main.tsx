import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing #root element");
}

const previewPluginErrors =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("plugin-error-boundary");
const previewAgentUIPrimitiveGallery =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("agent-ui-gallery");
async function loadRootComponent(): Promise<ComponentType> {
  if (previewAgentUIPrimitiveGallery) {
    return (await import("./dev/AgentUIPrimitiveGallery")).AgentUIPrimitiveGallery;
  }

  await import("antd/dist/reset.css");
  if (previewPluginErrors) {
    return (await import("./PluginErrorBoundaryPreview")).PluginErrorBoundaryPreview;
  }
  return (await import("./App")).App;
}

void loadRootComponent().then((RootComponent) => {
  createRoot(rootElement).render(
    <StrictMode>
      <RootComponent />
    </StrictMode>,
  );
});
