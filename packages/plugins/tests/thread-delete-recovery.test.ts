import { expect, it, vi } from "vitest";
import { deleteThreadWithSelectionRecovery } from "../src/internal/thread-delete-recovery.js";

function fixture() {
  let active = "A", empty = true; const listeners = new Set<() => void>();
  const change = (id: string) => { active = id; listeners.forEach(listener => listener()); };
  const select = vi.fn(async (id: string) => { change(id); });
  let fail!: (error: Error) => void, succeed!: () => void;
  const pending = new Promise<void>((resolve, reject) => { succeed = resolve; fail = reject; });
  const port = { getActiveId: () => active, isActiveEmpty: () => empty, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, delete: () => { change("fallback"); return pending; }, select };
  return { port, change, select, fail, succeed, listeners, setEmpty(value: boolean) { empty = value; } };
}
it("restores the selected thread after deletion fails and releases observation", async () => {
  const f = fixture(), task = deleteThreadWithSelectionRecovery("A", f.port); f.fail(new Error("503")); await expect(task).rejects.toThrow("503"); expect(f.select).toHaveBeenCalledExactlyOnceWith("A"); expect(f.listeners.size).toBe(0);
});
it("does not move the user back after navigation while deletion waited", async () => {
  const f = fixture(), task = deleteThreadWithSelectionRecovery("A", f.port); f.change("B"); f.fail(new Error("503")); await expect(task).rejects.toThrow("503"); expect(f.select).not.toHaveBeenCalled(); expect(f.listeners.size).toBe(0);
});
it("does not replace a new draft started while deletion waited", async () => {
  const f = fixture(), task = deleteThreadWithSelectionRecovery("A", f.port); f.setEmpty(false); f.fail(new Error("503")); await expect(task).rejects.toThrow("503"); expect(f.select).not.toHaveBeenCalled();
});
it("retains canonical navigation after successful deletion", async () => {
  const f = fixture(), task = deleteThreadWithSelectionRecovery("A", f.port); f.succeed(); await task; expect(f.select).not.toHaveBeenCalled(); expect(f.listeners.size).toBe(0);
});
it("does not select an inactive thread when its deletion fails", async () => {
  const f = fixture(); f.change("B"); const task = deleteThreadWithSelectionRecovery("A", f.port); f.fail(new Error("503")); await expect(task).rejects.toThrow("503"); expect(f.select).not.toHaveBeenCalled();
});
