import { createContext, useContext, type ComponentType } from "react";
import type { ConversationToolCallProps } from "../public.js";

/** Share the existing semantic tool renderer with frontend tools and nested tasks. */
export type ConversationDefaultToolProps = ConversationToolCallProps & { resultOnly?: boolean };
export const ConversationToolRendererContext = createContext<ComponentType<ConversationDefaultToolProps> | undefined>(undefined);
export const useConversationToolRenderer = () => useContext(ConversationToolRendererContext);
