import { AgentUILocaleProvider as SourceLocaleProvider } from "../src/locale.js";
// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, ConversationCanonicalSuggestions, CanonicalContextRetrievalMessage,
  CanonicalAskUserQuestion, CanonicalConversationSurfacePlugin, CanonicalAuthGatePlugin, CanonicalAuthAccountPlugin, type ContextRetrievalData } from "../dist/index.js";
import { ConversationSuggestionsPlugin as SourceSuggestions } from "../dist/sources/takeover/conversation-suggestions/index";
import { ContextRetrievalMessagePlugin as SourceRetrieval } from "../dist/sources/takeover/context-retrieval-message/index";
import { AskUserQuestionPlugin as SourceQuestion } from "../dist/sources/takeover/ask-user-question/index";
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });
async function mount(children: ReactNode) {
  let runtime!: AssistantRuntime;
  let content = children;
  function Host() {
    runtime = useLocalRuntime({ async *run() { yield { content: [{ type: "text" as const, text: "done" }] }; } });
    return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale="en-US">{content}</AgentUILocaleProvider></AssistantRuntimeProvider>;
  }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<Host />));
  return { host, get runtime() { return runtime; }, async rerender(next: ReactNode) { content = next; await act(async () => root!.render(<Host />)); } };
}
it("static suggestion props use the existing composer and respect prevented selections", async () => {
  const result = await mount(<ConversationCanonicalSuggestions items={[{ title: "My account", label: "Business description", prompt: "Read my account" }]} sendOnSelect={false} />);
  const button = result.host.querySelector("button")!;
  expect(button.textContent).toContain("My account");
  expect(button.textContent).toContain("Business description");
  await act(async () => button.click());
  expect(result.runtime.thread.composer.getState().text).toBe("Read my account");
  await result.rerender(<ConversationCanonicalSuggestions items={[]} />);
  expect(result.host.querySelector("button")).toBeNull();
  await result.rerender(<ConversationCanonicalSuggestions items={[{ prompt: "Other" }]} sendOnSelect={false} buttonProps={{ onClick: event => event.preventDefault() }} />);
  await act(async () => result.host.querySelector<HTMLButtonElement>("button")!.click());
  expect(result.runtime.thread.composer.getState().text).toBe("Read my account");
});
it("retrieval props customize the title and content without replacing its data parsing", async () => {
  const renderer = vi.fn((_data: ContextRetrievalData, content: ReactNode) => <section data-custom-content>{content}</section>);
  const { host } = await mount(<CanonicalContextRetrievalMessage data={{ source: "rag", content: [{ query: "Business query", context: ["A passage"] }] }} title="Project knowledge" className={"project-retrieval"} expanded={true} renderContent={renderer} />);
  expect(host.querySelector("details")?.open).toBe(true);
  expect(host.querySelector("details")?.classList.contains("agent-ui-context-retrieval-message")).toBe(true);
  expect(host.querySelector(".project-retrieval")?.textContent).toContain("Project knowledge");
  expect(host.querySelector("[data-custom-content]")?.textContent).toContain("A passage");
  expect(renderer.mock.calls[0]?.[0].source).toBe("rag");
});
it("retrieval expansion supports both default and controlled state", async () => {
  const changed = vi.fn();
  const data = { source: "rag", content: [] };
  const result = await mount(<CanonicalContextRetrievalMessage data={data} defaultExpanded onExpandedChange={changed} />);
  let details = result.host.querySelector("details")!;
  expect(details.open).toBe(true);
  await act(async () => { details.open = false; details.dispatchEvent(new Event("toggle")); });
  expect(changed).toHaveBeenLastCalledWith(false);
  await result.rerender(<CanonicalContextRetrievalMessage data={data} expanded={false} onExpandedChange={changed} />);
  details = result.host.querySelector("details")!;
  await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
  expect(changed).toHaveBeenLastCalledWith(true);
  expect(details.open).toBe(false);
  await result.rerender(<CanonicalContextRetrievalMessage data={data} expanded onExpandedChange={changed} />);
  expect(result.host.querySelector("details")?.open).toBe(true);
});
it("question presentation overrides preserve historical read-only behavior", async () => {
  const addResult = vi.fn();
  const request = { steps: [{ id: "q", question: "Business question", options: [], selectionMode: "text", minSelections: 1, maxSelections: 1 }] };
  const { host } = await mount(<CanonicalAskUserQuestion toolCallId="q" toolName="ask_user_question" args={request} result={{ answers: { q: ["Recorded answer"] } }} status={{ type: "complete" }} addResult={addResult} className={"project-question"} />);
  expect(host.querySelector(".project-question")?.textContent).toContain("Recorded answer");
  expect(host.querySelector("textarea")).toBeNull();
  expect(host.querySelector("button")).toBeNull();
  expect(addResult).not.toHaveBeenCalled();
});
it("question labels override only the requested presentation copy", async () => {
  const { host } = await mount(<AgentUILocaleProvider messages={{humanQuestion:{unavailable:"Project-specific unavailable question"}}}><CanonicalAskUserQuestion toolCallId="invalid" toolName="ask_user_question" args={{}} status={{ type: "complete" }} /></AgentUILocaleProvider>);
  expect(host.textContent).toBe("Project-specific unavailable question");
});
it("surface structural fallbacks preserve adapter behavior", async () => {
  const { host } = await mount(<CanonicalConversationSurfacePlugin
    Adapter={({ welcome, autoFocus, className }) => <div className={className} data-autofocus={autoFocus}>{welcome}</div>}
    className={"project-surface"} autoFocus={true} welcome={"Project welcome"} />);
  expect(host.querySelector("[data-autofocus]")?.getAttribute("data-autofocus")).toBe("true");
  expect(host.textContent).toContain("Project welcome");
});
it("login button children remain configurable without losing submit semantics", async () => {
  const signIn = vi.fn(async () => {});
  const { host } = await mount(<CanonicalAuthGatePlugin session={{ signIn }} state={{ status: "anonymous", user: null, busy: false, error: null }} submitButtonProps={{ children: "Enter business app" }} />);
  expect(host.querySelector("button")?.textContent).toBe("Enter business app");
  expect(host.querySelector("button")?.type).toBe("submit");
});
it("account sign-out children remain configurable", async () => {
  const signOut = vi.fn(async () => {});
  const { host } = await mount(<CanonicalAuthAccountPlugin session={{ signOut }} snapshot={{ user: { userId: "1", userName: "Project user" }, busy: false }} signOutButtonProps={{ children: "Leave business app" }} />);
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(document.body.textContent).toContain("Leave business app");
});
it("portable implementations preserve the same common application props", async () => {
  const result = await mount(<>
    <SourceSuggestions items={[{ prompt: "Portable business question" }]} sendOnSelect={false} renderSlot={(_name, fallback) => fallback} renderScopedSlot={(_name, _scope, fallback) => fallback} />
    <SourceRetrieval data={{ source: "rag", content: [] }} title="Portable knowledge" renderContent={() => <p>Portable content</p>} />
    <SourceLocaleProvider messages={{humanQuestion:{unavailable:"Portable question label"}}}><SourceQuestion toolCallId="invalid" toolName="ask_user_question" args={{}} status={{ type: "complete" }} /></SourceLocaleProvider>
  </>);
  expect(result.host.textContent).toContain("Portable knowledge");
  expect(result.host.textContent).toContain("Portable content");
  expect(result.host.textContent).toContain("Portable question label");
  await act(async () => result.host.querySelector<HTMLButtonElement>("button")!.click());
  expect(result.runtime.thread.composer.getState().text).toBe("Portable business question");
});
