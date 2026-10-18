import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AgentRuntime, AgentRuntimeSnapshot, AgentUserInput, AgentInterruptResponse } from "@za38.03/agent-ui-core";

/** Presentation only. Never forwarded to AG-UI or used to authorize a session. */
export interface AgentUIUser {
  userId?: string | undefined;
  userName?: string | undefined;
  avatar?: string | undefined;
}

export type AgentUIConnectionStatus = "initializing" | "ready" | "blocked" | "error";
export interface AgentUIHostSnapshot<TState = unknown> {
  status: AgentUIConnectionStatus;
  runtime: AgentRuntimeSnapshot<TState> | null;
}
export interface AgentUIEventMap<TState = unknown> {
  ready: { threadId: string };
  "status-change": { status: AgentUIConnectionStatus };
  "thread-change": { threadId: string };
  "run-start": { threadId: string; run: AgentRuntimeSnapshot<TState>["run"] };
  /** End of a wire run, including interruption, cancellation and error; not a success signal. */
  "run-end": { threadId: string; run: AgentRuntimeSnapshot<TState>["run"] };
}

export interface AgentUIHost<TState = unknown> {
  getSnapshot(): AgentUIHostSnapshot<TState>;
  subscribe(listener: () => void): () => void;
  on<K extends keyof AgentUIEventMap<TState>>(event: K, listener: (payload: AgentUIEventMap<TState>[K]) => void): () => void;
  /** Delegates to the canonical runtime. Settlement is not proof of successful completion. */
  sendMessage(input: string | AgentUserInput): Promise<void>;
  startNewConversation(): Promise<void>;
  resumeInterrupts(responses: AgentInterruptResponse[]): Promise<void>;
  abortRun(): void;
}

export class AgentUIHostError extends Error {
  constructor(readonly code: "AGENT_UI_NOT_READY" | "AGENT_UI_SESSION_ENDED" | "AGENT_UI_PROVIDER_MISSING" | "AGENT_UI_MULTIPLE_SURFACES") {
    super(code);
    this.name = "AgentUIHostError";
  }
}

class HostStore implements AgentUIHost {
  private snapshot: AgentUIHostSnapshot = { status: "initializing", runtime: null };
  private source: AgentRuntime | undefined;
  private listeners = new Set<() => void>();
  private events = new Map<string, Set<(payload: never) => void>>();
  private pending = new Set<() => void>();
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  on: AgentUIHost["on"] = (event, listener) => {
    const listeners = this.events.get(event) ?? new Set();
    this.events.set(event, listeners);
    listeners.add(listener as (payload: never) => void);
    return () => { listeners.delete(listener as (payload: never) => void); };
  };
  private emit<K extends keyof AgentUIEventMap>(event: K, payload: AgentUIEventMap[K]) {
    for (const listener of [...(this.events.get(event) ?? [])]) {
      try { void Promise.resolve(listener(payload as never)).catch(error => console.error("AGENT_UI_HOST_LISTENER_FAILED", error)); }
      catch (error) { console.error("AGENT_UI_HOST_LISTENER_FAILED", error); }
    }
  }
  setStatus(status: AgentUIConnectionStatus) {
    if (this.snapshot.status === status && (status === "ready" || this.snapshot.runtime === null)) return;
    this.snapshot = { status, runtime: status === "ready" ? this.snapshot.runtime : null };
    for (const listener of [...this.listeners]) listener();
    this.emit("status-change", { status });
  }
  bind(source: AgentRuntime) {
    this.source = source;
    const update = () => {
      if (this.source !== source) return;
      const previous = this.snapshot;
      const runtime = source.getSnapshot();
      if (previous.status === "ready" && previous.runtime === runtime) return;
      this.snapshot = { status: "ready", runtime };
      for (const listener of [...this.listeners]) listener();
      const threadId = runtime.conversation.id;
      if (previous.status !== "ready") { this.emit("status-change", { status: "ready" }); this.emit("ready", { threadId }); }
      if (previous.runtime?.conversation.id !== threadId) this.emit("thread-change", { threadId });
      if (runtime.run.status === "running" && previous.runtime?.run.status !== "running") this.emit("run-start", { threadId, run: runtime.run });
      if (previous.runtime?.run.status === "running" && runtime.run.status !== "running") this.emit("run-end", { threadId, run: runtime.run });
    };
    const unsubscribe = source.subscribe(update);
    update();
    return () => {
      unsubscribe();
      if (this.source !== source) return;
      this.source = undefined;
      for (const cancel of [...this.pending]) cancel();
      this.setStatus("initializing");
    };
  }
  private required() {
    if (this.snapshot.status !== "ready" || this.source === undefined) throw new AgentUIHostError("AGENT_UI_NOT_READY");
    return this.source;
  }
  private async invoke(action: (source: AgentRuntime) => Promise<void>) {
    const source = this.required();
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { this.pending.delete(cancel); reject(new AgentUIHostError("AGENT_UI_SESSION_ENDED")); };
      this.pending.add(cancel);
      try { Promise.resolve(action(source)).then(resolve, reject).finally(() => this.pending.delete(cancel)); }
      catch (error) { this.pending.delete(cancel); reject(error); }
    });
  }
  sendMessage = (input: string | AgentUserInput) => this.invoke(source => source.sendMessage(input));
  startNewConversation = async () => this.required().startNewConversation();
  resumeInterrupts = (responses: AgentInterruptResponse[]) => this.invoke(source => source.resumeInterrupts(responses));
  abortRun = () => this.required().abort();
}

const HostContext = createContext<HostStore | null>(null);
const UserContext = createContext<AgentUIUser | null | undefined>(undefined);
const SurfaceContext = createContext<{ target: HTMLElement | null; setTarget(target: HTMLElement | null): void } | null>(null);

export function AgentUIHostUserProvider({ user, children }: { user?: AgentUIUser | null | undefined; children: ReactNode }) {
  const profile = user == null ? user : { userId: user.userId, userName: user.userName, avatar: user.avatar };
  return <UserContext.Provider value={profile}>{children}</UserContext.Provider>;
}
export function useAgentUIUser() { return useContext(UserContext); }

/** Package-owned host environment. Generated composition supplies its single runtime binding. */
export function AgentUIProvider({ user, children }: { user?: AgentUIUser | null | undefined; children: ReactNode }) {
  const [store] = useState(() => new HostStore());
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return <HostContext.Provider value={store}><AgentUIHostUserProvider user={user}>
    <SurfaceContext.Provider value={{ target, setTarget }}>{children}</SurfaceContext.Provider>
  </AgentUIHostUserProvider></HostContext.Provider>;
}

export function useOptionalAgentUI<TState = unknown>(): AgentUIHost<TState> | null {
  return useContext(HostContext) as AgentUIHost<TState> | null;
}
export function useAgentUI<TState = unknown>(): AgentUIHost<TState> {
  const host = useOptionalAgentUI<TState>();
  if (host === null) throw new AgentUIHostError("AGENT_UI_PROVIDER_MISSING");
  return host;
}
/** Select stable fields/references, rather than allocating an object in the selector. */
export function useAgentUIState<T, TState = unknown>(selector: (snapshot: AgentUIHostSnapshot<TState>) => T): T {
  const host = useAgentUI<TState>();
  return useSyncExternalStore(host.subscribe, () => selector(host.getSnapshot()), () => selector(host.getSnapshot()));
}
export function useAgentUIEvent<K extends keyof AgentUIEventMap>(event: K, listener: (payload: AgentUIEventMap[K]) => void) {
  const host = useAgentUI();
  const current = useRef(listener);
  useLayoutEffect(() => { current.current = listener; }, [listener]);
  useEffect(() => host.on(event, payload => current.current(payload)), [host, event]);
}

/** Generated-composition seam; never creates or owns another conversation runtime. */
export function AgentUIRuntimeBinding({ runtime }: { runtime: AgentRuntime }) {
  const store = useContext(HostContext);
  useLayoutEffect(() => store?.bind(runtime), [store, runtime]);
  const active = useRef(runtime);
  active.current = runtime;
  useLayoutEffect(() => () => active.current.abort(), []);
  return null;
}
export function AgentUIConnectionState({ status }: { status: Exclude<AgentUIConnectionStatus, "ready"> }) {
  const store = useContext(HostContext);
  useLayoutEffect(() => { store?.setStatus(status); }, [store, status]);
  return null;
}
/** Generated React composition uses this target for its context-preserving portal. */
export function useAgentUISurfaceTarget() { return useContext(SurfaceContext)?.target ?? null; }
export function AgentUIOutlet() {
  const surface = useContext(SurfaceContext);
  const owned = useRef<HTMLElement | null>(null);
  const setTarget = surface?.setTarget;
  const target = surface?.target;
  const ref = useCallback((node: HTMLDivElement | null) => {
    owned.current = node;
    setTarget?.(node);
  }, [setTarget]);
  useLayoutEffect(() => {
    if (target && owned.current && target !== owned.current) throw new AgentUIHostError("AGENT_UI_MULTIPLE_SURFACES");
  }, [target]);
  if (surface === null) throw new AgentUIHostError("AGENT_UI_PROVIDER_MISSING");
  return <div ref={ref} data-agent-ui-outlet="" style={{ display: "contents" }} />;
}
