import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/job-progress-message";
import { JobProgressMessagePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], toolkit: { "run_ci_job": { type: "backend", display: "standalone", render: JobProgressMessagePlugin } }, Component: () => null };
export default definition;
