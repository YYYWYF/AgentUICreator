import { syncCommand } from "./sync.js";
export const creatorCommandRegistry = new Map([syncCommand, { id: "enable", kind: "choice", scope: "project" } as const, { id: "disable", kind: "choice", scope: "project" } as const].map(command => [command.id, command]));
