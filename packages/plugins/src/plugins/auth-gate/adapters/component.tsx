import "./styles.css";
import { CanonicalAuthGatePlugin, type AuthGatePluginProps } from "@za38.03/agent-ui-plugins";
export function AuthGatePlugin(props: AuthGatePluginProps) { return <CanonicalAuthGatePlugin {...props} />; }

export type {AuthSessionService,AuthSessionSnapshot} from "./adapters/auth-contract";
