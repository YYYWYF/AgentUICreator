import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/generated-file-message";
import { GeneratedFileMessagePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], toolkit: { "generate_file": { type: "backend", display: "standalone", render: GeneratedFileMessagePlugin } }, Component: () => null };
export default definition;
