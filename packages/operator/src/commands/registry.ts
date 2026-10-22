import { themeCommand } from "./theme.js";
import { installCommand } from "./install.js";
import { syncCommand } from "./sync.js";
export const creatorCommandRegistry = new Map([themeCommand, installCommand, syncCommand].map(command => [command.id, command]));
