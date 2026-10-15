import { prepareWorkbench } from "./prepare-workbench.mjs";

prepareWorkbench();
await import("../packages/creator/dist/cli.js");
