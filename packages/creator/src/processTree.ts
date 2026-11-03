import { execFile, type ChildProcess } from "node:child_process";

/** Children using this helper must be spawned detached on POSIX. */
export function signalProcessTree(child: ChildProcess, force = false) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    execFile("taskkill.exe", ["/pid", String(child.pid), "/T", ...(force ? ["/F"] : [])], { windowsHide: true, timeout: 3000 }, error => {
      if (error && child.exitCode === null && child.signalCode === null) child.kill(force ? "SIGKILL" : "SIGTERM");
    });
  } else {
    try { process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM"); }
    catch { if (child.exitCode === null && child.signalCode === null) child.kill(force ? "SIGKILL" : "SIGTERM"); }
  }
}

export async function terminateProcessTree(child: ChildProcess, timeoutMs = 3000) {
  if (child.exitCode !== null || child.signalCode !== null) { signalProcessTree(child, true); return; }
  await new Promise<void>((resolve, reject) => {
    const finish = () => { clearTimeout(forceTimer); clearTimeout(deadline); child.off("close", finish); resolve(); };
    const forceTimer = setTimeout(() => signalProcessTree(child, true), timeoutMs);
    const deadline = setTimeout(() => { clearTimeout(forceTimer); child.off("close", finish); reject(new Error("CREATOR_PROCESS_STOP_TIMEOUT")); }, timeoutMs + 4000);
    child.once("close", finish);
    signalProcessTree(child);
  });
}
