import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { atomicPurgeWrite } from "./plugin-purge-transaction";
import { readOptionalBuffer } from "./source-registry/lock";
import { AgentUISourceError, assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";

// One cross-process admission lock prevents another Host request from inspecting
// or committing a half-written composite transaction. Stale owners are recovered
// by the caller after acquiring this lock, before it reads project facts.
const LOCK = ".agentuicreator/control/project-control.lock";
export async function acquireProjectControlLock(root: string): Promise<() => Promise<void>> {
  await assertNoSymbolicLinkTraversal(root, LOCK);
  await mkdir(path.dirname(path.join(root, LOCK)), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await atomicPurgeWrite(path.join(root, LOCK), Buffer.from(String(process.pid)), true);
      return () => unlink(path.join(root, LOCK));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const source = await readOptionalBuffer(path.join(root, LOCK));
      if (!source) continue;
      const owner = Number(source.toString());
      if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error("Invalid ProjectControl lock.");
      try { process.kill(owner, 0); }
      catch (ownerError) {
        if ((ownerError as NodeJS.ErrnoException).code === "ESRCH") { await unlink(path.join(root, LOCK)); continue; }
        throw ownerError;
      }
      throw new AgentUISourceError("PROJECT_CONTROL_BUSY", "Another Host request is active; retry after it completes.");
    }
  }
  throw new AgentUISourceError("PROJECT_CONTROL_BUSY", "Host admission changed; retry.");
}
