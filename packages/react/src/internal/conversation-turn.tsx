"use client";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

/** Normalized product metadata. No AG-UI event or upstream message-model changes. */
export interface ConversationTurnSource {
  getSnapshot(): Readonly<Record<string, string>>;
  subscribe(listener: () => void): () => void;
}
export interface ConversationTurnMessage { id: string; role: string }
export interface ConversationTurnOwnership { turnId: string; role: string; isFooterOwner: boolean }
const EMPTY: Readonly<Record<string, string>> = Object.freeze({});
const fallbackSource: ConversationTurnSource = { getSnapshot: () => EMPTY, subscribe: () => () => undefined };
const Context = createContext<ConversationTurnSource>(fallbackSource);

/** Ownership is derived only from the currently visible branch, never all branches. */
export function projectConversationTurnOwnership(
  messages: readonly ConversationTurnMessage[],
  liveTurnIds: Readonly<Record<string, string>> = EMPTY,
): ReadonlyMap<string, ConversationTurnOwnership> {
  const ownership = new Map<string, ConversationTurnOwnership>();
  const tails = new Map<string, string>();
  let historyTurnId = "";
  for (const message of messages) {
    if (message.role === "user") historyTurnId = `history:user:${message.id}`;
    if (!historyTurnId) historyTurnId = `history:leading:${message.id}`;
    const turnId = message.role === "assistant" ? liveTurnIds[message.id] ?? historyTurnId : historyTurnId;
    ownership.set(message.id, { turnId, role: message.role, isFooterOwner: false });
    if (message.role === "assistant") tails.set(turnId, message.id);
  }
  for (const id of tails.values()) ownership.get(id)!.isFooterOwner = true;
  return ownership;
}

export function ConversationTurnProvider({ source, children }: { source: ConversationTurnSource; children: ReactNode }) {
  return <Context.Provider value={source}>{children}</Context.Provider>;
}

export function useConversationTurnOwnership(messages: readonly ConversationTurnMessage[], messageId: string) {
  const source = useContext(Context);
  const liveTurnIds = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  return projectConversationTurnOwnership(messages, liveTurnIds).get(messageId);
}
