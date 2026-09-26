export interface ConversationTurnMessage { id: string; role: string }

/** One user request and its assistant messages on the visible top-level branch. */
export interface ConversationTurnGroup {
  turnId: string;
  requestMessageId: string | null;
  assistantMessageIds: readonly string[];
  headAssistantMessageId: string;
  tailAssistantMessageId: string;
  headAssistantIndex: number;
  tailAssistantIndex: number;
}

/** User requests alone delimit turns; system/tool records never split a turn. */
export function projectConversationTurns(
  messages: readonly ConversationTurnMessage[],
): ReadonlyMap<string, ConversationTurnGroup> {
  type MutableTurn = Omit<ConversationTurnGroup, "assistantMessageIds"> & { assistantMessageIds: string[] };
  const turns = new Map<string, MutableTurn>();
  let turnId = "";
  let requestMessageId: string | null = null;
  messages.forEach((message, index) => {
    if (message.role === "user") {
      turnId = `history:user:${message.id}`;
      requestMessageId = message.id;
    }
    if (!turnId) turnId = `history:leading:${message.id}`;
    if (message.role !== "assistant") return;
    const turn = turns.get(turnId);
    if (turn) {
      turn.assistantMessageIds.push(message.id);
      turn.tailAssistantMessageId = message.id;
      turn.tailAssistantIndex = index;
    } else {
      turns.set(turnId, {
        turnId, requestMessageId, assistantMessageIds: [message.id],
        headAssistantMessageId: message.id, tailAssistantMessageId: message.id,
        headAssistantIndex: index, tailAssistantIndex: index,
      });
    }
  });
  return turns;
}

/** Footer placement and all response actions consume this exact group. */
export function resolveConversationTurnGroup(
  messages: readonly ConversationTurnMessage[],
  currentMessageId: string,
): ConversationTurnGroup | null {
  for (const turn of projectConversationTurns(messages).values()) {
    if (turn.assistantMessageIds.includes(currentMessageId)) return turn;
  }
  return null;
}
