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

export interface ConversationTurnProjection {
  turnId: string;
  requestMessageId: string | null;
  assistantMessageIds: string[];
  headAssistantMessageId: string;
  tailAssistantMessageId: string;
  footerOwnerMessageId: string;
}

/** One visible-branch projection supplies both ownership and action scope. */
export function projectConversationTurns(
  messages: readonly ConversationTurnMessage[],
  liveTurnIds: Readonly<Record<string, string>> = EMPTY,
): ReadonlyMap<string, ConversationTurnProjection> {
  const turns = new Map<string, ConversationTurnProjection>();
  let historyTurnId = "";
  let requestMessageId: string | null = null;
  let liveTurnId: string | undefined;
  for (const message of messages) {
    if (message.role === "user") {
      historyTurnId = `history:user:${message.id}`;
      requestMessageId = message.id;
      liveTurnId = undefined;
    }
    if (!historyTurnId) historyTurnId = `history:leading:${message.id}`;
    if (message.role !== "assistant") continue;
    liveTurnId = liveTurnIds[message.id] ?? liveTurnId;
    const turnId = liveTurnId ?? historyTurnId;
    const turn = turns.get(turnId);
    if (turn) {
      turn.assistantMessageIds.push(message.id);
      turn.tailAssistantMessageId = message.id;
      turn.footerOwnerMessageId = message.id;
    } else {
      turns.set(turnId, {
        turnId, requestMessageId, assistantMessageIds: [message.id],
        headAssistantMessageId: message.id, tailAssistantMessageId: message.id,
        footerOwnerMessageId: message.id,
      });
    }
  }
  return turns;
}

export function projectConversationTurnOwnership(
  messages: readonly ConversationTurnMessage[],
  liveTurnIds: Readonly<Record<string, string>> = EMPTY,
): ReadonlyMap<string, ConversationTurnOwnership> {
  const ownership = new Map<string, ConversationTurnOwnership>();
  let historyTurnId = "";
  for (const message of messages) {
    if (message.role === "user") historyTurnId = `history:user:${message.id}`;
    if (!historyTurnId) historyTurnId = `history:leading:${message.id}`;
    ownership.set(message.id, { turnId: historyTurnId, role: message.role, isFooterOwner: false });
  }
  for (const turn of projectConversationTurns(messages, liveTurnIds).values()) {
    for (const id of turn.assistantMessageIds) ownership.set(id, {
      turnId: turn.turnId, role: "assistant", isFooterOwner: turn.footerOwnerMessageId === id,
    });
  }
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

export function useConversationTurn(messages: readonly ConversationTurnMessage[], messageId: string) {
  const source = useContext(Context);
  const liveTurnIds = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  return [...projectConversationTurns(messages, liveTurnIds).values()]
    .find((turn) => turn.assistantMessageIds.includes(messageId));
}
