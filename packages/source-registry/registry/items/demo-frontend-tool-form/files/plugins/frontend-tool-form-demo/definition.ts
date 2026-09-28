import { parseUIPluginManifest, type UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { DEMO_FORM_SERVICE } from "../../services/demo-form";
import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
import { createDemoFormService } from "./form-service";
import { FrontendToolFormDemoPlugin } from "./index";
import manifest from "./manifest.json";
export default {
  manifest: parseUIPluginManifest(manifest),
  provides: [DEMO_FORM_SERVICE],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  setup({ services }) { services.provide(DEMO_FORM_SERVICE, createDemoFormService()); },
  Component: FrontendToolFormDemoPlugin,
} satisfies UIPluginDefinition;
