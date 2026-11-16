import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

// Match the package-manager process helpers: prefer a JS launcher, and quote
// every argument when Windows requires its .cmd shim.
export function npmInvocation(args, environment = process.env, platform = process.platform) {
  const entry = environment.npm_execpath;
  const basename = platform === "win32" ? path.win32.basename : path.basename;
  if (entry && /^npm(?:-cli)?\.(?:c?js|mjs)$/iu.test(basename(entry))) {
    return { command: process.execPath, args: [entry, ...args], shell: false };
  }
  if (platform !== "win32") return { command: "npm", args: [...args], shell: false };
  if (args.some(arg => /["%\r\n!]/u.test(arg))) throw new Error("Unsupported Windows npm argument");
  return { command: "npm.cmd", args: args.map(arg => `"${arg}"`), shell: true };
}

export function execNpm(args, options = {}) {
  const invocation = npmInvocation(args, options.env ?? process.env);
  return execute(invocation.command, invocation.args, { ...options, shell: invocation.shell, windowsHide: true });
}
