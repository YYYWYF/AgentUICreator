import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { TaskGroupPlugin } from "./index";
import manifestJson from "./manifest.json";
export const taskGroupPlugin = { manifest: parseUIPluginManifest(manifestJson), provides: [], inject: [], optionalInject: [], Component: TaskGroupPlugin } satisfies UIPluginDefinition;
export default taskGroupPlugin;
