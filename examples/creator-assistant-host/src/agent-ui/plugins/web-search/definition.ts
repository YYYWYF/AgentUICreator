import type { UIPluginDefinition } from "@za38.03/agent-ui-plugins";
import implementation from "@za38.03/agent-ui-plugins/web-search";
import { WebSearchPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], toolkit: { "web_search": { type: "backend", display: "standalone", render: WebSearchPlugin } }, Component: () => null };
export default definition;
