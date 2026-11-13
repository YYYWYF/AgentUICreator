import { createContext, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AgentUIProvider as AgentUIHostProvider, useAgentUI, useAgentUIUser, type AgentUIUser, type AgentUIHost, type AgentUIHostSnapshot } from "./AgentUIProvider.js";

export interface AgentUIAgentIdentity { agentId: string }
export interface AgentUIThreadRef { agentId: string; threadId: string }
export interface AgentUIAgentSnapshot extends AgentUIAgentIdentity {
  connection: AgentUIHostSnapshot;
  threads: ReturnType<AgentUIHost["getThreads"]>;
}
export interface AgentUIAgentsSnapshot {
  agents: readonly AgentUIAgentSnapshot[];
}
export interface AgentUIAgents {
  getSnapshot(): AgentUIAgentsSnapshot;
  subscribe(listener: () => void): () => void;
  agent(agentId: string): AgentUIHost;
  /** Only this explicit action creates a new conversation. */
  createThread(agentId: string): Promise<AgentUIThreadRef>;
  /** History navigation restores the exact Thread instead of creating one. */
  openThread(target: AgentUIThreadRef): Promise<void>;
}

interface Entry extends AgentUIAgentIdentity { host: AgentUIHost }

class AgentsStore implements AgentUIAgents {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private snapshot: AgentUIAgentsSnapshot = { agents: [] };
  private navigation: Promise<unknown> = Promise.resolve();
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish = () => {
    this.snapshot = { agents: [...this.entries.values()].map(({ agentId, host }) => ({
      agentId, connection: host.getSnapshot(), threads: host.getThreads(),
    })) };
    for (const listener of [...this.listeners]) listener();
  };
  register(entry: Entry) {
    if (!entry.agentId.trim() || entry.agentId !== entry.agentId.trim() || entry.agentId.length > 100) throw new Error("AGENT_UI_INVALID_AGENT");
    if (this.entries.has(entry.agentId)) throw new Error("AGENT_UI_DUPLICATE_AGENT");
    this.entries.set(entry.agentId, entry);
    const unsubscribeHost = entry.host.subscribe(this.publish);
    const unsubscribeThreads = entry.host.subscribeThreads(this.publish);
    this.publish();
    return () => {
      unsubscribeHost(); unsubscribeThreads();
      if (this.entries.get(entry.agentId) !== entry) return;
      this.entries.delete(entry.agentId);
      this.publish();
    };
  }
  private entry(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error("AGENT_UI_AGENT_NOT_FOUND");
    return entry;
  }
  private assertCurrent(entry: Entry) {
    if (this.entries.get(entry.agentId) !== entry) throw new Error("AGENT_UI_SESSION_ENDED");
  }
  agent = (id: string) => this.entry(id).host;
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.navigation.then(operation);
    this.navigation = task.catch(() => {});
    return task;
  }
  createThread = async (id: string): Promise<AgentUIThreadRef> => {
    const entry = this.entry(id);
    return this.enqueue(async () => {
      this.assertCurrent(entry);
      const threadId = await entry.host.createThread();
      this.assertCurrent(entry);
      return { agentId: id, threadId };
    });
  };
  openThread = async (target: AgentUIThreadRef) => {
    const { agentId, threadId } = target;
    const entry = this.entry(agentId);
    return this.enqueue(async () => {
      this.assertCurrent(entry);
      await entry.host.openThread(threadId);
      this.assertCurrent(entry);
    });
  };
}

const AgentsContext = createContext<AgentsStore | null>(null);
const AgentIdentityContext = createContext<AgentUIAgentIdentity | undefined>(undefined);

/** Public entry for both a single Host and a group of isolated assistants. */
export function AgentUIProvider({ user, children }: { user?: AgentUIUser | null | undefined; children: ReactNode }) {
  const [store] = useState(() => new AgentsStore());
  return <AgentUIHostProvider user={user}><AgentsContext.Provider value={store}>{children}</AgentsContext.Provider></AgentUIHostProvider>;
}
export function useOptionalAgentUIAgents(): AgentUIAgents | null { return useContext(AgentsContext); }
export function useAgentUIAgents(): AgentUIAgents {
  const store = useOptionalAgentUIAgents();
  if (!store) throw new Error("AGENT_UI_AGENTS_PROVIDER_MISSING");
  return store;
}
export function useAgentUIAgentsState<T>(selector: (snapshot: AgentUIAgentsSnapshot) => T): T {
  const store = useAgentUIAgents();
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()), () => selector(store.getSnapshot()));
}
export function useAgentUIAgentIdentity() { return useContext(AgentIdentityContext); }
function RegisterAgent({ identity, children }: { identity: AgentUIAgentIdentity; children: ReactNode }) {
  const store = useContext(AgentsContext);
  const host = useAgentUI();
  const { agentId } = identity;
  const value = useMemo(() => ({ agentId }), [agentId]);
  useLayoutEffect(() => {
    if (!store) throw new Error("AGENT_UI_AGENTS_PROVIDER_MISSING");
    return store.register({ agentId, host });
  }, [store, host, agentId]);
  return <AgentIdentityContext.Provider value={value}>{children}</AgentIdentityContext.Provider>;
}
/** Always supplies a separate Host and surface, even inside an existing Host. */
export function AgentUIAgentProvider({ agentId, children }: AgentUIAgentIdentity & { children: ReactNode }) {
  const user = useAgentUIUser();
  return <AgentUIHostProvider user={user}><RegisterAgent identity={{ agentId }}>{children}</RegisterAgent></AgentUIHostProvider>;
}
