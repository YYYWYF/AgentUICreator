import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import implementation from "@za38.03/agent-ui-plugins/retrieval-chunks";
import { RetrievalChunksPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [], toolkit: { "search_docs": { type: "backend", display: "standalone", render: RetrievalChunksPlugin } }, Component: () => null };
export default definition;
