import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { realpathSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "vite";
import { generatedProjectFixture, repositoryRoot } from "../../../../packages/project-control/tests/support/generated-project";
import { writeGeneratedPluginRegistry } from "../../../../packages/project-control/src/generate-plugin-registry";
import { loadAgentUISourceRegistry } from "../../../../packages/source-registry/src/loader";
import { builtinMockScenarios, createMockAgentVitePlugin, createMockConversationApiVitePlugin } from "@agent-ui/mock-agent";

export async function createI18nPluginHost(releaseIds: readonly string[]) {
  const root = realpathSync(await mkdtemp(path.join(tmpdir(), "agent-ui-visual-host-")));
  await cp(await generatedProjectFixture(), root, { recursive: true });
  const registry = await loadAgentUISourceRegistry();
  const plugins = registry.items.filter(item => item.id.startsWith("plugin/") && releaseIds.includes(item.id.slice(7)));
  for (const item of registry.items.filter(item => item.id.startsWith("foundation/") || plugins.includes(item))) {
    for (const file of item.loadedFiles) {
      const target = path.join(root, "agent-ui", file.target);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
  }
  // Composer is dependency-owned; the source-registry legacy copy is not installed.
  await rm(path.join(root, "agent-ui/plugins/assistant-ui-composer"), { recursive: true, force: true });
  // Prefer current workspace releases to stale installed fixture tarballs.
  for (const name of ["react", "runtime-core", "runtime-react", "runtime-conversation"]) {
    const target = path.join(root, "node_modules/@agent-ui", name);
    await rm(target, { recursive: true, force: true });
    await symlink(path.join(repositoryRoot, "packages", name), target, "dir");
  }
  for (const name of ["@assistant-ui/react", "@assistant-ui/react-markdown"]) {
    const target = path.join(root, "node_modules", name);
    await mkdir(path.dirname(target), { recursive: true });
    await symlink(path.join(repositoryRoot, "packages/react/node_modules", name), target, "dir");
  }
  const model = JSON.parse(await readFile(path.join(root, "agent-ui/app-ui/app-ui.json"), "utf8"));
  const surface = model.root.children[1].child.plugins[0];
  surface.slots.toolTimeline = [{ id: "timeline-main", pluginId: "assistant-ui-tool-timeline", enabled: true }];
  surface.slots.thinkingIndicator = [{ id: "thinking-main", pluginId: "assistant-ui-thinking-indicator", enabled: true }];
  surface.slots.headerActions = [{ id: "theme-switch-main", pluginId: "theme-switch", enabled: true }];
  surface.slots.userEditComposer = [{ id: "lexical-edit-main", pluginId: "assistant-ui-lexical-edit-composer", enabled: true }];
  surface.slots.composer[0].slots.input = [{ id: "lexical-input-main", pluginId: "assistant-ui-lexical-composer-input", enabled: true }];
  for (const item of plugins) {
    const manifest = JSON.parse(item.loadedFiles.find(file => file.target === `plugins/${item.id.slice(7)}/manifest.json`)!.content.toString());
    if (((manifest.capabilities ?? []).includes("headless") || manifest.data?.messageUI) && !model.applicationPlugins.some((p: {pluginId: string}) => p.pluginId === manifest.id)) {
      model.applicationPlugins.push({ id: `${manifest.id}-main`, pluginId: manifest.id, enabled: true });
    }
  }
  // The fixture declares responsive behavior explicitly and preserves AppUIModel ownership.
  model.root.children.reverse();
  model.root.sizes = ["minmax(0, 1fr)", "280px"];
  model.root.responsive = { type: "trailing-drawer", primaryIndex: 0, drawerIndex: 1, minPrimaryWidth: 320 };
  await writeFile(path.join(root, "agent-ui/app-ui/app-ui.json"), JSON.stringify(model));
  await writeFile(path.join(root, "agent-ui/application/runtime-config.generated.ts"), 'export const agentUIRuntimeConfig = { mode: "platform" } as const;');
  await writeFile(path.join(root, "agent-ui/agent-ui/conversation/config/conversation-runtime-config.ts"), (await readFile(path.join(root, "agent-ui/agent-ui/conversation/config/conversation-runtime-config.ts"), "utf8")).replace('conversationDataEndpoint: string | undefined = undefined', 'conversationDataEndpoint: string | undefined = "/__agent-ui/mock-data"'));
  const probeRoot = path.join(root, "agent-ui/plugins/visual-test-probe");
  await mkdir(probeRoot, { recursive: true });
  await writeFile(path.join(probeRoot, "manifest.json"), JSON.stringify({ id: "visual-test-probe", name: "Visual test probe", description: "Host fixture instrumentation", version: "0.0.1", capabilities: ["theme-control"] }));
  await writeFile(path.join(probeRoot, "definition.ts"), `
    import { useConversationRuntimeBridge } from "@agent-ui/runtime-conversation";
    import { usePluginService } from "../../runtime/plugins";
    import { CONVERSATION_MENTION_SOURCE } from "../../services/composer-triggers";
    import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";
    import { AGENT_UI_CONVERSATION_SERVICE } from "../../services/conversations";
    import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";
    function Probe() { const bridge = useConversationRuntimeBridge();
      window.__i18nProbe = { runtime: bridge.agentRuntime, binding: bridge.threadBinding,
        locale: usePluginService(AGENT_UI_LOCALE_SERVICE), conversation: usePluginService(AGENT_UI_CONVERSATION_SERVICE), theme: usePluginService(AGENT_UI_THEME_SERVICE) }; return null; }
    export default { manifest: { id: "visual-test-probe", name: "Visual test probe", description: "Host fixture instrumentation", version: "0.0.1", capabilities: ["theme-control"] },
      provides: [CONVERSATION_MENTION_SOURCE], optionalInject: [AGENT_UI_LOCALE_SERVICE, AGENT_UI_CONVERSATION_SERVICE, AGENT_UI_THEME_SERVICE],
      setup: ({services}) => { services.provide(CONVERSATION_MENTION_SOURCE, { cacheKey: "visual-fixture", search: async ({query}) => query === "missing" ? [] : [{id:"fixture",type:"document",label:"Fixture document with a deliberately long label for layout verification",description:"Host test data"}] }); }, Component: Probe };
  `);
  surface.slots.headerActions.push({ id: "visual-probe", pluginId: "visual-test-probe", enabled: true });
  await writeFile(path.join(root, "agent-ui/app-ui/app-ui.json"), JSON.stringify(model));
  await writeGeneratedPluginRegistry(root);
  await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/visual.tsx"></script>');
  await writeFile(path.join(root, "visual.tsx"), `
    import { useState } from "react"; import { createRoot } from "react-dom/client";
    import { Agent } from "./agent-ui/application/Agent"; import { DemoAttachmentAdapter } from "@agent-ui/mock-agent/attachments";
    import "./src/preview-shell.css";
    const params = new URLSearchParams(location.search); const attachmentAdapter = new DemoAttachmentAdapter();
    const feedbackAdapter = { submit: async () => undefined };
    const dictationAdapter = { listen() { let end; const session = { status:{type:"starting"}, stop:async () => {session.status={type:"ended",reason:"stopped"}; end?.({transcript:"Dictation fixture",isFinal:true});}, cancel:()=>{session.status={type:"ended",reason:"cancelled"};}, onSpeechStart:(cb)=>{queueMicrotask(()=>{session.status={type:"running"};cb();});return ()=>{};}, onSpeechEnd:(cb)=>{end=cb;return ()=>{};}, onSpeech:()=>()=>{} }; return session; } };
    function Host() { const [locale, setLocale] = useState(params.get("locale") || "zh-CN");
      return <><select data-testid="locale" aria-label="Fixture locale" value={locale} onChange={e => setLocale(e.target.value)} style={{position:"fixed",left:8,top:4,zIndex:100}}><option>zh-CN</option><option>en-US</option></select>
      <Agent locale={locale} feedbackAdapter={feedbackAdapter} dictationAdapter={dictationAdapter} attachmentAdapter={attachmentAdapter} endpoint={"/agent?scenario=" + (params.get("scenario") || "simple-chat") + "&speed=" + (params.get("speed") || "0.05")} /></>; }
    createRoot(document.getElementById("root")).render(<Host />);
  `);
  const server = await createServer({ configFile: false, root, cacheDir: path.join(root, ".vite"), plugins: [react(), tailwindcss(), createMockAgentVitePlugin({ endpoint: "/agent", scenarios: builtinMockScenarios, defaultScenarioId: "simple-chat" }), createMockConversationApiVitePlugin({ endpoint: "/__agent-ui/mock-data" })], resolve: { dedupe: ["react", "react-dom"] }, optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "@agent-ui/react", "@agent-ui/react/lexical", "@agent-ui/runtime-conversation", "@agent-ui/runtime-core", "@agent-ui/runtime-react", "@base-ui/react/**", "@assistant-ui/react", "@assistant-ui/react-markdown", "@assistant-ui/react-lexical", "@assistant-ui/react-generative-ui", "@assistant-ui/react-hook-form", "lexical", "@ag-ui/client", "@ag-ui/core", "zod", "zustand"] }, server: { hmr: false, watch: null, host: "127.0.0.1", port: 0, fs: { allow: [root, repositoryRoot] } } });
  await server.listen();
  return { setMessagePresentation: async (options: { timeline: boolean; thinking: boolean; reasoning: boolean }) => {
    surface.slots.toolTimeline[0].enabled = options.timeline;
    surface.slots.thinkingIndicator[0].enabled = options.thinking;
    surface.slots.reasoningGroup[0].enabled = options.reasoning;
    await writeFile(path.join(root, "agent-ui/app-ui/app-ui.json"), JSON.stringify(model));
    await writeGeneratedPluginRegistry(root);
    server.moduleGraph.invalidateAll();
  }, setLegacyFooter: async (legacy: boolean) => {
    const footer = surface.slots.assistantResponseFooter ?? surface.slots.assistantMessageFooter;
    delete surface.slots.assistantResponseFooter; delete surface.slots.assistantMessageFooter;
    footer[0].pluginId = legacy ? "assistant-ui-message-footer" : "assistant-ui-response-footer";
    surface.slots[legacy ? "assistantMessageFooter" : "assistantResponseFooter"] = footer;
    await writeFile(path.join(root, "agent-ui/app-ui/app-ui.json"), JSON.stringify(model));
    await writeGeneratedPluginRegistry(root);
    server.moduleGraph.invalidateAll();
  }, url: server.resolvedUrls!.local[0]!, plugins: plugins.map(item => item.id.slice(7)).sort(), close: async () => { await server.close(); await rm(root, { recursive: true, force: true }); } };
}
