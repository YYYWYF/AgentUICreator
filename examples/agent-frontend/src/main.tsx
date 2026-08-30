import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

import "antd/dist/reset.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing #root element");
}

const previewPluginErrors =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("plugin-error-boundary");
const RootComponent = previewPluginErrors
  ? lazy(async () => {
      const module = await import("./PluginErrorBoundaryPreview");
      return { default: module.PluginErrorBoundaryPreview };
    })
  : App;

createRoot(rootElement).render(
  <StrictMode>
    <Suspense fallback={null}>
      <RootComponent />
    </Suspense>
  </StrictMode>,
);
