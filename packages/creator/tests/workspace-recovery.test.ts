import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CreatorWorkspacePublicState } from "../src/workspace/types.js";
import { DEFAULT_CREATOR_MESSAGES } from "../src/ui/i18n/locale.js";
import { recoverWorkspace } from "../src/ui/workspaceRecovery.js";
import { CreatorWorkspaceRequestError, getWorkspaceState, selectWorkspaceProject } from "../src/ui/workspaceClient.js";

vi.mock("../src/ui/workspaceClient.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/ui/workspaceClient.js")>(),
  getWorkspaceState: vi.fn(), selectWorkspaceProject: vi.fn(),
}));

const ready = {
  status: "ready", workspace: { id: "project", name: "Project", displayPath: "C:\\work\\项目 alpha" },
  project: { mode: "assistant", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
} as const satisfies CreatorWorkspacePublicState;
const unavailable = (code: string): CreatorWorkspacePublicState => ({
  ...ready, runtime: { status: "unavailable", code, message: code },
});
const recover = (signal = new AbortController().signal) => recoverWorkspace(null, DEFAULT_CREATOR_MESSAGES, signal);

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getWorkspaceState).mockReset().mockResolvedValue(ready);
  vi.mocked(selectWorkspaceProject).mockReset().mockResolvedValue(ready);
});
afterEach(() => { vi.useRealTimers(); });

it("does one settled read and retains no timer or request after ready", async () => {
  expect(await recover()).toEqual(ready);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(getWorkspaceState).toHaveBeenCalledTimes(1);
  expect(selectWorkspaceProject).not.toHaveBeenCalled();
});

it("waits through a transitional response only during recovery", async () => {
  vi.mocked(getWorkspaceState).mockResolvedValueOnce({ ...ready, runtime: { status: "starting" } });
  const pending = recover();
  await vi.advanceTimersByTimeAsync(500);
  expect(await pending).toEqual(ready);
  expect(getWorkspaceState).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("retries transport errors with bounded backoff, then stops", async () => {
  vi.mocked(getWorkspaceState).mockRejectedValue(new TypeError("offline"));
  const pending = expect(recover()).rejects.toThrow("offline");
  await vi.advanceTimersByTimeAsync(7_500);
  await pending;
  expect(getWorkspaceState).toHaveBeenCalledTimes(5);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(getWorkspaceState).toHaveBeenCalledTimes(5);
});

it.each([408, 429, 502, 503])("retries temporary HTTP %s failures", async status => {
  vi.mocked(getWorkspaceState).mockRejectedValueOnce(new CreatorWorkspaceRequestError("temporary", {}, status));
  const pending = recover();
  await vi.advanceTimersByTimeAsync(500);
  expect(await pending).toEqual(ready);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not retry an invalid directory or a malformed successful response", async () => {
  for (const error of [
    new CreatorWorkspaceRequestError("missing", { code: "ENOENT" }, 400),
    new CreatorWorkspaceRequestError("invalid", { code: "CREATOR_WORKSPACE_RESPONSE_INVALID" }, 200),
  ]) {
    vi.mocked(getWorkspaceState).mockRejectedValueOnce(error);
    await expect(recover()).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  }
  expect(getWorkspaceState).toHaveBeenCalledTimes(2);
});

it("retries failed startup for the server's current project, without refreshing a ready worker", async () => {
  vi.mocked(getWorkspaceState).mockResolvedValue(unavailable("CREATOR_START_TIMEOUT"));
  expect(await recoverWorkspace("/old/project", DEFAULT_CREATOR_MESSAGES, new AbortController().signal)).toEqual(ready);
  expect(selectWorkspaceProject).toHaveBeenCalledWith(ready.workspace.displayPath, DEFAULT_CREATOR_MESSAGES, expect.any(AbortSignal));
  expect(vi.getTimerCount()).toBe(0);
});

it("stops automatic startup recovery after four retries", async () => {
  const state = unavailable("CREATOR_START_FAILED");
  vi.mocked(getWorkspaceState).mockResolvedValue(state);
  vi.mocked(selectWorkspaceProject).mockResolvedValue(state);
  const pending = recover();
  await vi.advanceTimersByTimeAsync(7_500);
  expect(await pending).toEqual(state);
  expect(selectWorkspaceProject).toHaveBeenCalledTimes(4);
  expect(vi.getTimerCount()).toBe(0);
});

it("reports permanent startup errors without retrying", async () => {
  const state = unavailable("CREATOR_OPERATOR_RESTART_REQUIRED");
  vi.mocked(getWorkspaceState).mockResolvedValue(state);
  expect(await recover()).toEqual(state);
  expect(selectWorkspaceProject).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels backoff on unmount without more requests", async () => {
  vi.mocked(getWorkspaceState).mockRejectedValue(new TypeError("offline"));
  const controller = new AbortController();
  const pending = expect(recover(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await pending;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(getWorkspaceState).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts a stalled recovery request at the recovery deadline", async () => {
  vi.mocked(getWorkspaceState).mockImplementation((_messages, signal) => new Promise((_resolve, reject) => {
    signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
  }));
  const pending = expect(recover()).rejects.toThrow(DEFAULT_CREATOR_MESSAGES.creatorWorkbench.workspaceRecoveryFailed);
  await vi.advanceTimersByTimeAsync(45_000);
  await pending;
  expect(getWorkspaceState).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
