import { syncCommand } from "./sync.js";
export const creatorCommandRegistry = new Map([syncCommand, { id: "enable", kind: "choice", scope: "project" }, { id: "disable", kind: "choice", scope: "project" }].map(command => [command.id, command]));
//# sourceMappingURL=registry.js.map