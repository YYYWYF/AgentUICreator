// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { watchCreatorConnection } from "../src/dock/creatorConnection.js";

let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

it("connects after late startup, preserves an open dock, removes on stop, and reconnects", async () => {
  vi.useFakeTimers();
  let online = false;
  const fetchStatus = vi.fn(async () => ({ ok: true, json: async () => ({ online }) }));
  vi.stubGlobal("fetch", fetchStatus);
  const dispose = vi.fn();
  const install = vi.fn(() => dispose);
  stop = watchCreatorConnection("/__agent-ui/creator-dock/status", install);
  await vi.advanceTimersByTimeAsync(0);
  expect(install).not.toHaveBeenCalled();
  online = true;
  await vi.advanceTimersByTimeAsync(2000);
  expect(install).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(install).toHaveBeenCalledTimes(1);
  online = false;
  await vi.advanceTimersByTimeAsync(2000);
  expect(dispose).toHaveBeenCalledTimes(1);
  online = true;
  await vi.advanceTimersByTimeAsync(2000);
  expect(install).toHaveBeenCalledTimes(2);
  stop(); stop = undefined;
  const calls = fetchStatus.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetchStatus).toHaveBeenCalledTimes(calls);
  expect(dispose).toHaveBeenCalledTimes(2);
});

it("treats unavailable service as offline and never installs after disposal during a probe", async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(() => new Promise(r => { resolve = r; })));
  const install = vi.fn(() => vi.fn());
  stop = watchCreatorConnection("/status", install);
  await vi.advanceTimersByTimeAsync(2000);
  stop(); stop = undefined;
  resolve({ ok: true, json: async () => ({ online: true }) });
  await vi.advanceTimersByTimeAsync(0);
  expect(install).not.toHaveBeenCalled();
});

it("ignores a stale probe after a back-forward cache restore", async () => {
  vi.useFakeTimers();
  let finishOld!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn()
    .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValue({ ok: true, json: async () => ({ online: false }) }));
  const install = vi.fn(() => vi.fn());
  stop = watchCreatorConnection("/status", install);
  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("pageshow"));
  finishOld({ ok: true, json: async () => ({ online: true }) });
  await vi.advanceTimersByTimeAsync(0);
  expect(install).not.toHaveBeenCalled();
});
