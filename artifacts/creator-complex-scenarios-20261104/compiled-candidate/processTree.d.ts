import { type ChildProcess } from "node:child_process";
/** Children using this helper must be spawned detached on POSIX. */
export declare function signalProcessTree(child: ChildProcess, force?: boolean): void;
export declare function terminateProcessTree(child: ChildProcess, timeoutMs?: number): Promise<void>;
//# sourceMappingURL=processTree.d.ts.map