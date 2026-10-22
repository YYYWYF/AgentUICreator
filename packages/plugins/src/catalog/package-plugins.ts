import manifest0 from "../plugins/composer/plugin.json" with { type: "json" };
import manifest1 from "../plugins/copy-action/plugin.json" with { type: "json" };
import manifest2 from "../plugins/reload-action/plugin.json" with { type: "json" };
import manifest3 from "../plugins/feedback-actions/plugin.json" with { type: "json" };
import manifest4 from "../plugins/export-markdown-action/plugin.json" with { type: "json" };
import manifest5 from "../plugins/reasoning/plugin.json" with { type: "json" };
import manifest6 from "../plugins/tool-group/plugin.json" with { type: "json" };
import manifest7 from "../plugins/add-attachment-action/plugin.json" with { type: "json" };
import manifest8 from "../plugins/dictation-action/plugin.json" with { type: "json" };
import manifest9 from "../plugins/submit-action/plugin.json" with { type: "json" };
import manifest10 from "../plugins/response-footer/plugin.json" with { type: "json" };
import manifest11 from "../plugins/conversation-suggestions/plugin.json" with { type: "json" };
import manifest12 from "../plugins/thinking-indicator/plugin.json" with { type: "json" };
import manifest13 from "../plugins/tool-timeline/plugin.json" with { type: "json" };
import manifest14 from "../plugins/tool-fallback/plugin.json" with { type: "json" };
import manifest15 from "../plugins/transient-assistant-messages/plugin.json" with { type: "json" };
import manifest16 from "../plugins/agent-status-message/plugin.json" with { type: "json" };
import manifest17 from "../plugins/agent-plan-message/plugin.json" with { type: "json" };
import manifest18 from "../plugins/job-progress-message/plugin.json" with { type: "json" };
import manifest19 from "../plugins/generated-file-message/plugin.json" with { type: "json" };
import manifest20 from "../plugins/chart-message/plugin.json" with { type: "json" };
import manifest21 from "../plugins/source-citations-message/plugin.json" with { type: "json" };
import manifest22 from "../plugins/retrieval-chunks/plugin.json" with { type: "json" };
import manifest23 from "../plugins/web-search/plugin.json" with { type: "json" };
import manifest24 from "../plugins/conversation-thread-list/plugin.json" with { type: "json" };
import manifest26 from "../plugins/conversation-new/plugin.json" with { type: "json" };
import manifest27 from "../plugins/conversation-quote/plugin.json" with { type: "json" };
import manifest28 from "../plugins/agent-identity/plugin.json" with { type: "json" };
import manifest29 from "../plugins/auth-account/plugin.json" with { type: "json" };
import manifest30 from "../plugins/auth-gate/plugin.json" with { type: "json" };
import manifest31 from "../plugins/conversation-command-source/plugin.json" with { type: "json" };
import manifest32 from "../plugins/conversation-data-source/plugin.json" with { type: "json" };
import manifest33 from "../plugins/conversation-service/plugin.json" with { type: "json" };
import manifest34 from "../plugins/conversation-surface/plugin.json" with { type: "json" };
import manifest35 from "../plugins/lexical-composer-input/plugin.json" with { type: "json" };
import manifest36 from "../plugins/lexical-edit-composer/plugin.json" with { type: "json" };
import manifest37 from "../plugins/locale-provider/plugin.json" with { type: "json" };
import manifest38 from "../plugins/mention-trigger/plugin.json" with { type: "json" };
import manifest39 from "../plugins/slash-command-trigger/plugin.json" with { type: "json" };
import manifest40 from "../plugins/task-group/plugin.json" with { type: "json" };
import manifest41 from "../plugins/theme-provider/plugin.json" with { type: "json" };
import manifest42 from "../plugins/theme-switch/plugin.json" with { type: "json" };
import manifest43 from "../plugins/context-retrieval-message/plugin.json" with { type: "json" };
import localeSwitchManifest from "../plugins/locale-switch/plugin.json" with { type: "json" };
import deliveries from "./plugin-delivery.json" with { type: "json" };
import packageMetadata from "../../package.json" with { type: "json" };
const manifests = { "locale-switch": localeSwitchManifest, "composer": manifest0, "copy-action": manifest1, "reload-action": manifest2, "feedback-actions": manifest3, "export-markdown-action": manifest4, "reasoning": manifest5, "tool-group": manifest6, "add-attachment-action": manifest7, "dictation-action": manifest8, "submit-action": manifest9, "response-footer": manifest10, "conversation-suggestions": manifest11, "thinking-indicator": manifest12, "tool-timeline": manifest13, "tool-fallback": manifest14, "transient-assistant-messages": manifest15, "agent-status-message": manifest16, "agent-plan-message": manifest17, "job-progress-message": manifest18, "generated-file-message": manifest19, "chart-message": manifest20, "source-citations-message": manifest21, "retrieval-chunks": manifest22, "web-search": manifest23, "conversation-thread-list": manifest24, "conversation-new": manifest26, "conversation-quote": manifest27, "agent-identity": manifest28, "auth-account": manifest29, "auth-gate": manifest30, "conversation-command-source": manifest31, "conversation-data-source": manifest32, "conversation-service": manifest33, "conversation-surface": manifest34, "lexical-composer-input": manifest35, "lexical-edit-composer": manifest36, "locale-provider": manifest37, "mention-trigger": manifest38, "slash-command-trigger": manifest39, "task-group": manifest40, "theme-provider": manifest41, "theme-switch": manifest42, "context-retrieval-message": manifest43 };
const all = deliveries.map(delivery => {
  const manifest = manifests[delivery.id as keyof typeof manifests];
  return { pluginId: manifest.id, manifest, application: { enabled: true, alias: delivery.applicationAlias, preserveLegacySource: delivery.preserveLegacySource === true, component: delivery.component, scopeKind: delivery.scopeKind, registration: delivery.registration, runtimeContext: delivery.runtimeContext === true, hostBindings: delivery.hostBindings, railAction: (delivery as { railAction?: string }).railAction, hostApplication: delivery.hostApplication === true, modeApplicationFiles: delivery.applicationModeFiles },
    runtime: { type: "package" as const, package: "@za38.03/agent-ui-plugins", subpath: `./${delivery.id}`, version: packageMetadata.version },
    referenceSourceItemId: `plugin/${delivery.id}`,
    services: delivery.services,
  };
});
export const officialPackagePlugins = all;

export function officialPackagePlugin(pluginId: string) { return all.find(plugin => plugin.pluginId === pluginId); }
