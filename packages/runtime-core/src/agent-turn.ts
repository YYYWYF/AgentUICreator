import type { AgentMessage } from "./agent-message.js";

export type AgentUserMessage = Extract<AgentMessage, { role: "user" }>;

export interface AgentTurn {
  /** Stable id equal to the user message id that initiated this turn. */
  id: string;
  /** User message that initiated this turn. */
  userMessage: AgentUserMessage;
  /**
   * Every message after the initiating user message and before the next user
   * message. Tool, reasoning, activity and producer boundaries are preserved.
   */
  responseMessages: AgentMessage[];
}

export interface AgentTurnProjection {
  /** Messages that occurred before the first user turn. */
  leadingMessages: AgentMessage[];
  turns: AgentTurn[];
}

/**
 * Derives stable conversation turns from message order without introducing a
 * second source of truth. A new user message is the only turn boundary.
 */
export function projectAgentTurns(
  messages: readonly AgentMessage[],
): AgentTurnProjection {
  const leadingMessages: AgentMessage[] = [];
  const turns: AgentTurn[] = [];
  let currentTurn: AgentTurn | undefined;

  for (const message of messages) {
    if (message.role === "user") {
      currentTurn = {
        id: message.id,
        userMessage: message,
        responseMessages: [],
      };
      turns.push(currentTurn);
      continue;
    }

    if (currentTurn === undefined) {
      leadingMessages.push(message);
      continue;
    }

    currentTurn.responseMessages.push(message);
  }

  return { leadingMessages, turns };
}
