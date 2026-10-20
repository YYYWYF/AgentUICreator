import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import {AUTH_SESSION_SERVICE} from "../../services/auth/session";
import implementation from "@za38.03/agent-ui-plugins/auth-account";
import { AuthAccountPlugin } from "./index";
const definition: UIPluginDefinition = { manifest: implementation.manifest, provides: [], inject: [], optionalInject: [AUTH_SESSION_SERVICE, "agent-ui.locale"], Component: AuthAccountPlugin };
export default definition;
