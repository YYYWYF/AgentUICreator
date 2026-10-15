import { execFile } from "node:child_process";
import { promisify } from "node:util";

export function browserInvocation(url: string, platform: NodeJS.Platform = process.platform) {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return {
    command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url],
  };
  return { command: "xdg-open", args: [url] };
}

export async function openCreatorBrowser(url: string) {
  const invocation = browserInvocation(url);
  await promisify(execFile)(invocation.command, invocation.args, { timeout: 10_000 });
}
