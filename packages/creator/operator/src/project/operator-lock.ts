import { randomUUID } from "node:crypto";
import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { atomicPurgeWrite } from "./plugin-purge-transaction";
import { readOptionalBuffer } from "./source-registry/lock";
import { AgentUISourceError, assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";

const DIRECTORY = ".agent-ui/creator/control/operator-locks";
const PID_LOCK_PATHS = [
  ".agent-ui/creator/control/operator.lock",
  ".agentuicreator/control/operator.lock",
] as const;
interface Ticket { pid: number; token: string; number: number | null }
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}
async function remove(file: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await unlink(file); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return;
      // Concurrent readers/deleters can temporarily hold a Windows ticket open.
      // Retry only transient sharing errors; permanent failures still surface.
      if (process.platform !== "win32" || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "") || attempt >= 5) throw error;
      await delay(10 * (attempt + 1));
    }
  }
}
async function tickets(root: string): Promise<Ticket[]> {
  const values: Ticket[] = [];
  for (const name of await readdir(path.join(root, DIRECTORY))) {
    if (!/^\d+\.[0-9a-f-]{36}\.json$/.test(name)) continue; // Atomic-write temporary files are not tickets.
    const logical = `${DIRECTORY}/${name}`;
    await assertNoSymbolicLinkTraversal(root, logical);
    const file = path.join(root, DIRECTORY, name);
    const source = await readOptionalBuffer(file);
    if (!source) continue;
    const ticket = JSON.parse(source.toString()) as Ticket;
    if (!Number.isSafeInteger(ticket.pid) || ticket.pid <= 0 ||
        name !== `${ticket.pid}.${ticket.token}.json` ||
        (ticket.number !== null && (!Number.isSafeInteger(ticket.number) || ticket.number < 1))) {
      throw new Error("Invalid Operator ticket.");
    }
    // Unique paths are never reused. Concurrent stale cleanup cannot remove a
    // successor's lock; disappearance during cleanup is harmless.
    if (!alive(ticket.pid)) { await remove(file); continue; }
    values.push(ticket);
  }
  return values;
}

// Lamport bakery admission across processes. Each invocation exclusively owns
// one immutable identity/path, including during choosing, cancellation and exit.
// There is no shared unlink/replacement race and no dependency on Unix signals.
export async function acquireOperatorLock(root: string, { waitMs = 0 }: { waitMs?: number } = {}): Promise<() => Promise<void>> {
  await assertNoSymbolicLinkTraversal(root, DIRECTORY);
  await mkdir(path.join(root, DIRECTORY), { recursive: true });
  const deadline = performance.now() + waitMs;
  const own: Ticket = { pid: process.pid, token: randomUUID(), number: null };
  const file = path.join(root, DIRECTORY, `${own.pid}.${own.token}.json`);
  const release = () => remove(file);
  await atomicPurgeWrite(file, Buffer.from(JSON.stringify(own)), true);
  try {
    own.number = 1 + Math.max(0, ...(await tickets(root)).map(value => value.number ?? 0));
    await atomicPurgeWrite(file, Buffer.from(JSON.stringify(own)));
    for (;;) {
      // An older running Operator uses the former PID lock. Fail closed while
      // it is live. Dead legacy files are ignored, never reused or unlinked.
      let blockedByPidLock = false;
      for (const relativePath of PID_LOCK_PATHS) {
        await assertNoSymbolicLinkTraversal(root, relativePath);
        const legacy = await readOptionalBuffer(path.join(root, relativePath));
        const legacyPid = legacy ? Number(legacy.toString()) : null;
        if (legacyPid !== null && (!Number.isSafeInteger(legacyPid) || legacyPid <= 0)) throw new Error("Invalid Operator lock.");
        if (legacyPid !== null && alive(legacyPid)) blockedByPidLock = true;
      }
      const blocked = blockedByPidLock || (await tickets(root)).some(value =>
        value.token !== own.token && (value.number === null || value.number < own.number! ||
          (value.number === own.number && value.token < own.token)));
      if (!blocked) return release;
      if (performance.now() >= deadline) throw new AgentUISourceError("OPERATOR_BUSY", "Another Host request is active; retry after it completes.");
      await delay(Math.min(25, Math.max(1, deadline - performance.now())));
    }
  } catch (error) {
    await release();
    throw error;
  }
}
