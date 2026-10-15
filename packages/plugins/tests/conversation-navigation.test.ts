import { describe, expect, it, vi } from "vitest";

const threads = vi.hoisted(() => ({
  switchToThread: vi.fn(),
  switchToNewThread: vi.fn(),
  reloadMainThread: vi.fn(),
}));

vi.mock("@assistant-ui/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("@assistant-ui/react")>(),
  useAui: () => ({ threads }),
}));

import { useConversationNavigation } from "../src/public.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Conversation navigation promises", () => {
  it("returns the upstream switch promise and stays pending until switching completes", async () => {
    const existing = deferred();
    const created = deferred();
    threads.switchToThread.mockReturnValue(existing.promise);
    threads.switchToNewThread.mockReturnValue(created.promise);
    const navigation = useConversationNavigation();
    const switched = navigation.switchToThread("B");
    const newThread = navigation.switchToNewThread();
    expect(threads.switchToThread).toHaveBeenCalledWith("B");
    expect(switched).toBe(existing.promise);
    expect(newThread).toBe(created.promise);
    const onSwitched = vi.fn();
    const onCreated = vi.fn();
    void switched.then(onSwitched);
    void newThread.then(onCreated);
    await Promise.resolve();
    expect(onSwitched).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    existing.resolve();
    created.resolve();
    await Promise.all([switched, newThread]);
    expect(onSwitched).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("preserves the upstream reload promise", async () => {
    const reload = deferred();
    threads.reloadMainThread.mockReturnValue(reload.promise);
    const result = useConversationNavigation().reloadCurrentThread();
    expect(result).toBe(reload.promise);
    reload.resolve();
    await result;
  });
});
