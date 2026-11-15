// Real-browser fixture. Bundled with an isolated host React, never workspace overrides.
import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  AgentUIRoot, AgentUILocaleProvider, Button, Input, ConversationThreadListNew,
} from "@za38.03/agent-ui-plugins";
import { ConversationThreadListPlugin } from "@za38.03/agent-ui-plugins/conversation-thread-list";
import { ConversationThreadListPlugin as SourceThreadList } from "../../dist/sources/takeover/conversation-thread-list/index";
import {
  ConversationRuntimeProvider, createEphemeralConversationThreadBinding,
  type ConversationThreadBinding,
} from "@za38.03/agent-ui-runtime";
import "@za38.03/agent-ui-plugins/styles.css";

const query = new URLSearchParams(location.search);
const theme = query.get("theme") === "dark" ? "dark" : "light";
document.documentElement.style.colorScheme = theme;
document.body.dataset.surface = query.get("surface") ?? "panel";
type HistoryRecord = { id: string; title: string } & ({ status: "regular" } | { status: "archived" });
const records: HistoryRecord[] = [
  { id: "first", title: "First history", status: "regular" },
  { id: "second", title: "Second history", status: "regular" },
];
const binding: ConversationThreadBinding = {
  ...createEphemeralConversationThreadBinding("first"),
  getThreadListSnapshot: () => ({
    isLoading: false,
    threads: records.filter(record => record.status === "regular"),
    archivedThreads: records.filter(record => record.status === "archived"),
  }),
  loadThread: async () => ({ messages: [] }),
  renameThread: async (id, title) => { records.find(record => record.id === id)!.title = title; },
  archiveThread: async id => { records.find(record => record.id === id)!.status = "archived"; },
  unarchiveThread: async id => { records.find(record => record.id === id)!.status = "regular"; },
  deleteThread: async id => { records.splice(records.findIndex(record => record.id === id), 1); },
};

const refs = {
  button: React.createRef<HTMLButtonElement>(),
  input: React.createRef<HTMLInputElement>(),
  newThread: React.createRef<HTMLButtonElement>(),
};
const callbacks: Record<string, HTMLElement | null> = {};
const callbackDetached: Record<string, boolean> = {};
const callbackRef = (name: string) => (node: HTMLElement | null) => {
  callbacks[name] = node;
  if (node === null) callbackDetached[name] = true;
};
const callbackButton = callbackRef("button");
const callbackInput = callbackRef("input");
const callbackNewThread = callbackRef("newThread");
const fixture = {
  reactVersion: React.version, refs, callbacks, callbackDetached,
  unmountControls: () => {},
};
(window as unknown as { reactMenuFixture: typeof fixture }).reactMenuFixture = fixture;

function Fixture() {
  const [controlsMounted, setControlsMounted] = React.useState(true);
  fixture.unmountControls = () => setControlsMounted(false);
  const List = query.get("delivery") === "source" ? SourceThreadList : ConversationThreadListPlugin;
  return <ConversationRuntimeProvider endpoint="/unused-agent" threadBinding={binding}>
    <AgentUIRoot theme={theme}>
      <AgentUILocaleProvider locale="en-US">
        <List theme={theme} showArchived />
        {controlsMounted && <div className="ref-controls">
          <Button ref={refs.button} data-ref="button">Object button</Button>
          <Button ref={callbackButton} data-ref="callback-button">Callback button</Button>
          <Input ref={refs.input} data-ref="input" defaultValue="Select this text" />
          <Input ref={callbackInput} data-ref="callback-input" />
          <ConversationThreadListNew ref={refs.newThread} data-ref="newThread" />
          <ConversationThreadListNew ref={callbackNewThread} data-ref="callback-newThread" />
        </div>}
      </AgentUILocaleProvider>
    </AgentUIRoot>
  </ConversationRuntimeProvider>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
