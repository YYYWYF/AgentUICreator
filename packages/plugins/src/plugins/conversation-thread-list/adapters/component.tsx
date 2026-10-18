import "./styles.css";
import { CanonicalConversationThreadList, type ConversationThreadListPluginProps, CanonicalConversationThreadListRailAction, type ConversationThreadListRailActionProps } from "@za38.03/agent-ui-plugins";
export function ConversationThreadListPlugin(props: ConversationThreadListPluginProps) { return <CanonicalConversationThreadList {...props} />; }
export function ConversationThreadListRailAction(props: ConversationThreadListRailActionProps) { return <CanonicalConversationThreadListRailAction {...props} />; }
