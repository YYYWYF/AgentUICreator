import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

// Reuse pnpm's JS entry when invoked by a package script. This avoids .cmd
// execution and shell quoting of workspace paths on Windows.
export function pnpmInvocation(args, options = {}, environment = process.env, platform = process.platform) {
  const entry = environment.npm_execpath;
  if (entry && /^pnpm(?:[.-].*)?\.(?:c?js|mjs)$/iu.test(path.basename(entry))) {
    return { command: process.execPath, args: [entry, ...args], options: { ...options, shell: false } };
  }
  if (platform === "win32" && entry && /^pnpm\.exe$/iu.test(path.basename(entry))) {
    return { command: entry, args, options: { ...options, shell: false } };
  }
  if (platform === "win32") {
    if (args.some(arg => /["%\r\n!]/u.test(arg))) throw new Error("Unsupported Windows pnpm argument");
    return { command: "pnpm.cmd", args: args.map(arg => `"${arg}"`), options: { ...options, shell: true } };
  }
  return { command: "pnpm", args, options: { ...options, shell: false } };
}
export function spawnPnpm(args, options) {
  const invocation = pnpmInvocation(args, options);
  return spawn(invocation.command, invocation.args, invocation.options);
}
export function spawnPnpmSync(args, options) {
  const invocation = pnpmInvocation(args, options);
  return spawnSync(invocation.command, invocation.args, invocation.options);
}
