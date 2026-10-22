import { prepareTypeScriptAuthoring } from "./prepare-typescript-authoring.mjs";
import {
  cleanGeneratedPluginResourceViews,
  materializePluginSources,
} from "../packages/plugins/scripts/materialize-plugin-sources.mjs";

export const pluginResourceViewsReadyEnv = "AGENTUICREATOR_PLUGIN_RESOURCE_VIEWS_READY";

export async function withPluginResourceViews(task) {
  if (process.env[pluginResourceViewsReadyEnv] === "1") return task();
  try {
    await materializePluginSources(undefined, { resourceViews: true });
    await prepareTypeScriptAuthoring();
    return await task();
  } finally {
    await cleanGeneratedPluginResourceViews();
  }
}
