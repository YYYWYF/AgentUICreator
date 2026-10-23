import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/source-citations-message";
import { SourceCitationsMessagePlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], toolkit: { "search_sources": { type: "backend", display: "standalone", render: SourceCitationsMessagePlugin } }, Component: () => null };
export default definition;
