import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/agent-status-message";
import { AgentStatusMessagePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], toolkit: { "mock_agent_status": { type: "backend", display: "standalone", render: AgentStatusMessagePlugin } }, Component: () => null };
export default definition;
