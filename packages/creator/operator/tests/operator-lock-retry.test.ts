// @vitest-environment node
import * as fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { acquireOperatorLock } from "../src/project/operator-lock";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, unlink: vi.fn(actual.unlink), readFile: vi.fn(actual.readFile) };
});
const nativeUnlink = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).unlink;
const nativeReadFile = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).readFile;
const roots: string[] = [];
afterEach(async () => {
  vi.mocked(fs.unlink).mockReset().mockImplementation(nativeUnlink);
  vi.mocked(fs.readFile).mockReset().mockImplementation(nativeReadFile);
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function lock() {
  const root = await fs.mkdtemp(path.join(tmpdir(), "operator retry 工程 "));
  roots.push(root);
  return { root, release: await acquireOperatorLock(root) };
}

it.skipIf(process.platform !== "win32")("retries Windows sharing failures, then removes the ticket", async () => {
  const { root, release } = await lock();
  const unlink = vi.mocked(fs.unlink).mockClear();
  for (const code of ["EPERM", "EBUSY", "EACCES"]) unlink.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
  await release();
  expect(unlink).toHaveBeenCalledTimes(4);
  expect(await fs.readdir(path.join(root, ".agent-ui/creator/control/operator-locks"))).toEqual([]);
});

it.skipIf(process.platform !== "win32")("bounds retries and preserves a ticket when permission remains denied", async () => {
  const { root, release } = await lock();
  const denied = Object.assign(new Error("denied"), { code: "EPERM" });
  const unlink = vi.mocked(fs.unlink).mockClear().mockRejectedValue(denied);
  try {
    await expect(release()).rejects.toBe(denied);
    expect(unlink).toHaveBeenCalledTimes(6);
    expect(await fs.readdir(path.join(root, ".agent-ui/creator/control/operator-locks"))).toHaveLength(1);
  } finally { unlink.mockImplementation(nativeUnlink); await release(); }
});

it("surfaces non-sharing errors without retrying or removing the ticket", async () => {
  const { release } = await lock();
  const failure = Object.assign(new Error("I/O failure"), { code: "EIO" });
  const unlink = vi.mocked(fs.unlink).mockClear().mockRejectedValue(failure);
  try {
    await expect(release()).rejects.toBe(failure);
    expect(unlink).toHaveBeenCalledTimes(1);
  } finally { unlink.mockImplementation(nativeUnlink); await release(); }
});

it.skipIf(process.platform !== "win32")("retries ticket reads while another request is deleting a stale lock", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "operator read retry 工程 "));
  roots.push(root);
  const read = vi.mocked(fs.readFile).mockClear();
  for (const code of ["EPERM", "EBUSY", "EACCES"]) read.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
  const release = await acquireOperatorLock(root);
  try {
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(4);
    await expect(acquireOperatorLock(root)).rejects.toMatchObject({ code: "OPERATOR_BUSY" });
  } finally { await release(); }
});

it.skipIf(process.platform !== "win32")("does not admit a request when ticket reads remain denied", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "operator denied 工程 "));
  roots.push(root);
  const denied = Object.assign(new Error("denied"), { code: "EPERM" });
  const read = vi.mocked(fs.readFile).mockClear().mockRejectedValue(denied);
  await expect(acquireOperatorLock(root)).rejects.toBe(denied);
  expect(read).toHaveBeenCalledTimes(6);
  expect(await fs.readdir(path.join(root, ".agent-ui/creator/control/operator-locks"))).toEqual([]);
});

it("surfaces non-sharing read failures and releases its own ticket", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "operator read failure "));
  roots.push(root);
  const failure = Object.assign(new Error("I/O failure"), { code: "EIO" });
  const read = vi.mocked(fs.readFile).mockClear().mockRejectedValue(failure);
  await expect(acquireOperatorLock(root)).rejects.toBe(failure);
  expect(read).toHaveBeenCalledTimes(1);
  expect(await fs.readdir(path.join(root, ".agent-ui/creator/control/operator-locks"))).toEqual([]);
});
