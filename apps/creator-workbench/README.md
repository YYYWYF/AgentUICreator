# Creator Workbench

`pnpm dev` builds the development infrastructure, ensures the platform Host, and starts the Workbench on port 5174 alongside `creator-host-sandbox` on port 5176. The left pane previews the real Host URL in an iframe. The Host retains its own independent build and development scripts; Workbench does not import its React application.

Creator configuration is read from the workspace root `.env.creator.local`. `VITE_CREATOR_HOST_PREVIEW_URL` can select another running Host preview. Project inspection, mutation, verification, and mock resource installation use `@agent-ui/project-control/dev`; initialization uses `@agent-ui/bootstrap`. Assistant and embedded integration remain separate Host examples.
