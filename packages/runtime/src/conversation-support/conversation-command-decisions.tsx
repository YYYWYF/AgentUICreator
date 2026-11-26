import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuiState } from '@assistant-ui/react';
import type { ConversationCommandDecisionBinding } from "../plugin-api/conversation.js";

interface CommandRecord {
  readonly request: ConversationCommandDecisionBinding['request'];
  decision?: string;
}
const recordsByScope = new WeakMap<object, Map<string, CommandRecord>>();
const CommandRecordsContext = createContext<Map<string, CommandRecord> | undefined>(undefined);

// Runtime owns pending commands and transport; fallback presentation only consumes them.
const CommandDecisionsContext = createContext<
  ReadonlyMap<string, ConversationCommandDecisionBinding>
>(new Map());

export function ConversationCommandDecisionProvider({
  decisions,
  scope,
  children,
}: {
  decisions: ReadonlyMap<string, ConversationCommandDecisionBinding>;
  scope?: object;
  children: ReactNode;
}) {
  const ownScope = useRef({});
  const records = useMemo(() => {
    const identity = scope ?? ownScope.current;
    let value = recordsByScope.get(identity);
    if (!value) { value = new Map(); recordsByScope.set(identity, value); }
    return value;
  }, [scope]);
  return (
    <CommandDecisionsContext.Provider value={decisions}>
      <CommandRecordsContext.Provider value={records}>{children}</CommandRecordsContext.Provider>
    </CommandDecisionsContext.Provider>
  );
}

export function useConversationCommandDecision(toolCallId: string) {
  return useContext(CommandDecisionsContext).get(toolCallId);
}

export function useConversationCommandDecisions() {
  return useContext(CommandDecisionsContext);
}

/** Display provenance only, from observed requests in this existing Thread bridge. */
export function useConversationCommandDecisionRecord(toolCallId: string, supplied?: ConversationCommandDecisionBinding) {
  const pending = useConversationCommandDecision(toolCallId) ?? supplied;
  const shared = useContext(CommandRecordsContext);
  const local = useRef(new Map<string, CommandRecord>());
  const records = shared ?? local.current;
  const messageId = useAuiState(state => state.optional.message?.id);
  const key = JSON.stringify([messageId ?? null, toolCallId]);
  const [, update] = useState(0);
  let record = records.get(key);
  if (pending && record?.request !== pending.request) {
    record = { request: pending.request };
    records.set(key, record);
  }
  if (!record) return undefined;
  const observed = record;
  return {
    request: observed.request,
    decision: observed.decision,
    pending: pending !== undefined,
    submit: pending ? async (decision: string) => {
      await pending.submit(decision);
      if (records.get(key) === observed) {
        observed.decision = decision;
        update(value => value + 1);
      }
    } : undefined,
  };
}
