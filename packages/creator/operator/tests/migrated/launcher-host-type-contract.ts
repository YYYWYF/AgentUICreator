import type * as Host from "../../src/host.mjs";
import { createAgentUIInitializationHost } from "../../src/project/bootstrap-host.js";
import { inspectCreatorProject } from "../../src/project/creator-project-inspector.js";
import { installDemoPlugin } from "../../src/project/install-demo-plugin.js";
import { handleUIOperatorRequest } from "../../src/handler.js";

// These assignments are checked by the Operator test typecheck. The
// Node-facing declarations must remain compatible with the owning implementation.
const host: typeof Host.createAgentUIInitializationHost = createAgentUIInitializationHost;
const inspect: typeof Host.inspectCreatorProject = inspectCreatorProject;
const install: typeof Host.installDemoPlugin = installDemoPlugin;
const control: typeof Host.handleUIOperatorRequest = handleUIOperatorRequest;

export const launcherHostTypeContract = { host, inspect, install, control };
