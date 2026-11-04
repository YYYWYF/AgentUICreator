import type { CreatorCommandExecuteRequest, CreatorCommandResult } from "../../commands/types.js";
import { type CreatorLocaleMessages } from "../i18n/locale.js";
/** Confirmation only resumes the exact Host-held preparation, never a bare approval flag. */
export declare function confirmPluginEnablement(request: CreatorCommandExecuteRequest, result: CreatorCommandResult, messages: CreatorLocaleMessages["commands"], pluginLabel: (id: string) => string, confirm: (message: string) => boolean, execute: (request: CreatorCommandExecuteRequest) => Promise<CreatorCommandResult>): Promise<CreatorCommandResult | undefined>;
//# sourceMappingURL=confirmPluginEnablement.d.ts.map