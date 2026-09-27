# Creator Workbench

`pnpm dev` builds the development infrastructure, ensures the platform Host, and starts the Workbench on port 5174 alongside `creator-host-sandbox` on port 5176. The left pane previews the real Host URL in an iframe. The Host retains its own independent build and development scripts; Workbench does not import its React application.

Creator configuration is read from the workspace root `.env.creator.local`. `VITE_CREATOR_HOST_PREVIEW_URL` can select another running Host preview. Project inspection, mutation, verification, and mock resource installation use `@agent-ui/project-control/dev`; initialization uses `@agent-ui/bootstrap`. Assistant and embedded integration remain separate Host examples.

The generated Agent exposes generic `observability` callbacks and development observation events. The shared `@agent-ui/creator/host-preview/vite` plugin injects the Creator adapter only during Vite serve. It reuses the existing runtime and visual reporters in the Host document, where screenshot capture can see the real Host DOM. Workbench opens a MessageChannel for each iframe load and selected workspace/thread; it uploads reports to its own Creator server with that session's identity. Reload or thread changes close the old channel and reconnect, replaying the latest Host observations. Standalone Hosts render without connecting to a Creator server, and production Agent source never imports Creator.

Runtime reporting follows the Workbench's runtime-diagnostics configuration; visual capture requires `VITE_ENABLE_VISUAL_OBSERVATION=true`. Playwright uses the shared supervisor to start Workbench on 5179 and the platform Host on 5180, queries Host UI through `frameLocator`, and retains runtime geometry, screenshot/afterHash, and reload assertions.

Bootstrap accepts an explicit initialization adapter. Workbench composes `initializeAgentUIProject(input, createAgentUIInitializationHost())`; Bootstrap does not import Project Control.
