import { ExampleLocaleHost } from "./ExampleLocaleHost";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  useAgentUILocale, AGENT_UI_THEME_PRESETS, isAgentUITheme, type AgentUITheme,
  AgentUIRoot, Button, NativeSelect, NativeSelectOption,
  AgentUIDialog, AgentUIDialogContent, AgentUIPopover, AgentUIPopoverTrigger, AgentUIPopoverContent,
  TooltipProvider, ConversationThread, ConversationCanonicalComposer, ConversationComposerSend, ConversationComposerCancel,
  ConversationComposerMentionTrigger, ConversationComposerCommandTrigger,
  ConversationToolCall, ConversationSource, Collapsible, CollapsibleTrigger, CollapsibleContent,
  ConversationThreadListRoot, ConversationThreadListNew, ConversationThreadListItem, ConversationThreadListItemByIndex, useConversationThreadListGroups,
  type ConversationMentionSource, type ConversationSlashCommandSource,
} from "@agent-ui/react";
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { themeShowcaseLocale as copy } from "./theme-showcase.locale";
import "@agent-ui/react/styles.css";
import "./theme-showcase.css";

const binding = createEphemeralConversationThreadBinding();
const initialThread = binding.getThreadId();
binding.getThreadListSnapshot = () => ({ threads: [
  { id: initialThread, status: "regular", title: copy.threadOne },
  { id: "theme-design-review", status: "regular", title: copy.threadTwo },
], archivedThreads: [] });
const mentionSource: ConversationMentionSource = {
  cacheKey: "theme-showcase",
  search: async ({ query }) => copy.mention.toLowerCase().includes(query.toLowerCase())
    ? [{ id: "design", type: "team", label: copy.mention }] : [],
};
const commands = [{ id: "summarize", label: copy.command, mode: "directive" as const }];
const commandSource: ConversationSlashCommandSource = { getSnapshot: () => commands, subscribe: () => () => undefined };
function Welcome() { const copy = useAgentUILocale("themeShowcase"); return <div className="showcase-welcome"><h2>{copy.welcome}</h2><p>{copy.welcomeText}</p></div>; }
const threadComponents = { Welcome };
function ThreadListItem() {
  const copy = useAgentUILocale("themeShowcase");
  return <ConversationThreadListItem actions={{ rename: false, archive: false, delete: false }} labels={{
    newChat: copy.newChat, moreOptions: copy.threadList, running: copy.activeTool,
    rename: copy.threadList, archive: copy.threadList, delete: copy.threadList,
  }} />;
}
function ThreadList() {
  const copy = useAgentUILocale("themeShowcase");
  const { threadIds } = useConversationThreadListGroups();
  return <ConversationThreadListRoot>
    <ConversationThreadListNew>{copy.newChat}</ConversationThreadListNew>
    {threadIds.map((id, index) => <ConversationThreadListItemByIndex key={id} index={index} components={{ ThreadListItem }} />)}
  </ConversationThreadListRoot>;
}

function ThemeShowcase() {
  const copy = useAgentUILocale("themeShowcase");
  const triggerLabels = useAgentUILocale("triggers");
  const [theme, setTheme] = useState<AgentUITheme>("light");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toolOpen, setToolOpen] = useState(true);
  const [reasoningOpen, setReasoningOpen] = useState(true);
  return <AgentUIRoot theme={theme}>
    <TooltipProvider>
      <main className="theme-showcase">
        <header><h1>{copy.title}</h1><NativeSelect aria-label={copy.theme} value={theme} onChange={(event) => {
          if (isAgentUITheme(event.currentTarget.value)) setTheme(event.currentTarget.value);
        }}>{Object.keys(AGENT_UI_THEME_PRESETS).filter(isAgentUITheme).map((preset) => <NativeSelectOption key={preset} value={preset}>{copy[preset]}</NativeSelectOption>)}</NativeSelect></header>
        <div className="showcase-grid">
          <aside className="showcase-sidebar" aria-label={copy.threadList}>
            <h2>{copy.threadList}</h2><ThreadList />
          </aside>
          <section className="showcase-card" aria-label={copy.samples}>
            <Welcome />
            <p className="showcase-user">{copy.user}</p><p>{copy.assistant}</p>
            <div className="showcase-actions"><Button>{copy.primary}</Button><Button variant="secondary">{copy.secondary}</Button>
              <Button variant="outline" onClick={() => setDialogOpen(true)}>{copy.dialog}</Button>
              <AgentUIPopover><AgentUIPopoverTrigger render={<Button variant="outline">{copy.popover}</Button>} /><AgentUIPopoverContent>{copy.popoverText}</AgentUIPopoverContent></AgentUIPopover>
            </div>
            <ConversationToolCall label={copy.tool} activeLabel={copy.activeTool} query={copy.query} request={copy.request} result={copy.result} running={false} open={toolOpen} onOpenChange={setToolOpen} />
            <Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}><CollapsibleTrigger>{copy.reasoning}</CollapsibleTrigger><CollapsibleContent className="showcase-reasoning">{copy.reasoningText}</CollapsibleContent></Collapsible>
            <ConversationSource sourceType="url" id="theme-docs" url="https://ui.shadcn.com/docs/theming" title={copy.source} />
            <div className="showcase-statuses"><span className="success">{copy.success}</span><span className="warning">{copy.warning}</span><span className="error">{copy.error}</span></div>
            <div className="showcase-chart" aria-label={copy.tokens}>{[1, 2, 3, 4, 5].map((index) => <span key={index} style={{ background: `var(--chart-${index})` }} />)}</div>
          </section>
        </div>
        <section className="showcase-live agent-ui-conversation" aria-label={copy.live}>
          <ConversationThread components={threadComponents} labels={{ generationStopped: copy.stopped }} composer={
            <ConversationCanonicalComposer placeholder={copy.composer} inputAriaLabel={copy.composer}
              triggers={<><ConversationComposerMentionTrigger source={mentionSource} labels={triggerLabels} /><ConversationComposerCommandTrigger source={commandSource} labels={triggerLabels} /></>}
              submitAction={<><ConversationComposerSend label={copy.send} /><ConversationComposerCancel label={copy.stop} /></>}
            />
          } />
        </section>
      </main>
      <AgentUIDialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <AgentUIDialogContent showCloseButton={false}><AgentUIDialog.Title>{copy.dialog}</AgentUIDialog.Title><AgentUIDialog.Description>{copy.dialogText}</AgentUIDialog.Description><Button onClick={() => setDialogOpen(false)}>{copy.close}</Button></AgentUIDialogContent>
      </AgentUIDialog.Root>
    </TooltipProvider>
  </AgentUIRoot>;
}

createRoot(document.getElementById("theme-showcase")!).render(
  <ExampleLocaleHost><ConversationRuntimeProvider endpoint="/agent" threadBinding={binding}><ThemeShowcase /></ConversationRuntimeProvider></ExampleLocaleHost>,
);
