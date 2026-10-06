import { constants } from "node:fs";
import { open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { MAX_MOCK_RECORDING_BYTES, parseMockRecording, type MockRecording } from "@agent-ui/mock-agent";

export interface LocalMockRecordingSummary {
  id: string; title: string; fileName: string;
  eventCount: number; durationMs: number;
  status: "ready" | "invalid";
  error?: string;
}
interface Entry { summary: LocalMockRecordingSummary; recording?: MockRecording }
const inside = (root: string, file: string) => file.startsWith(`${root}${path.sep}`);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** Current-project user data. No watcher, registry mutation or runtime dependency. */
export class LocalMockRecordingStore {
  private readonly cache = new Map<string, { key: string; bytes: number; entry: Entry }>();
  private async directory(projectRoot: string): Promise<string | undefined> {
    try {
      const root = await realpath(projectRoot);
      const directory = await realpath(path.join(root, ".agentui/mocks"));
      if (!inside(root, directory)) throw new Error("Local Mock directory must stay within the current project.");
      return directory;
    } catch (error) { if (missing(error)) return undefined; throw error; }
  }
  private async load(directory: string, fileName: string): Promise<Entry> {
    const id = `local:${fileName}`;
    const title = fileName.slice(0, -6);
    const base = { id, title, fileName, eventCount: 0, durationMs: 0 };
    const file = path.join(directory, fileName);
    try {
      if (await realpath(file) !== file) throw new Error("Recording path must not traverse symlinks.");
      // Reject symlink files, including aliases into another project.
      const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const info = await handle.stat();
        if (!info.isFile()) throw new Error("Recording must be a regular file.");
        const key = `${info.mtimeMs}:${info.ctimeMs}:${info.size}:${info.ino}`;
        const cached = this.cache.get(file);
        if (cached?.key === key) return cached.entry;
        if (info.size > MAX_MOCK_RECORDING_BYTES) throw new Error("Recording exceeds the 8 MiB limit.");
        const buffer = Buffer.alloc(info.size + 1);
        let length = 0;
        while (length < buffer.length) {
          const read = await handle.read(buffer, length, buffer.length - length, null);
          if (!read.bytesRead) break;
          length += read.bytesRead;
        }
        const after = await handle.stat();
        if (length !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || after.size !== info.size) throw new Error("Recording changed while reading; refresh to retry.");
        let entry: Entry;
        try {
          const recording = parseMockRecording(buffer.subarray(0, length).toString("utf8"), { id, title });
          entry = { recording, summary: { ...base, status: "ready", eventCount: recording.events.length, durationMs: recording.events.at(-1)!.atMs } };
        } catch (error) { entry = { summary: { ...base, status: "invalid", error: error instanceof Error ? error.message : "Invalid recording." } }; }
        this.cache.delete(file);
        // Bound retained recordings, not just the size of each individual file.
        while (this.cache.size >= 128 || [...this.cache.values()].reduce((sum, item) => sum + item.bytes, 0) + info.size > 32 * 1024 * 1024) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(file, { key, bytes: info.size, entry });
        return entry;
      } finally { await handle.close(); }
    } catch (error) { return { summary: { ...base, status: "invalid", error: error instanceof Error ? error.message : "Unable to read recording." } }; }
  }
  async list(projectRoot: string): Promise<LocalMockRecordingSummary[]> {
    const directory = await this.directory(projectRoot);
    if (!directory) return [];
    const files = (await readdir(directory)).filter(name => name.endsWith(".jsonl")).sort();
    const summaries: LocalMockRecordingSummary[] = [];
    for (const file of files) summaries.push((await this.load(directory, file)).summary);
    const existing = new Set(files.map(file => path.join(directory, file)));
    for (const file of this.cache.keys()) if (path.dirname(file) === directory && !existing.has(file)) this.cache.delete(file);
    return summaries;
  }
  async get(projectRoot: string, recordingId: string): Promise<MockRecording | undefined> {
    if (!recordingId.startsWith("local:")) return undefined;
    const fileName = recordingId.slice(6);
    if (!fileName.endsWith(".jsonl") || path.basename(fileName) !== fileName || fileName.includes("\\") || fileName.includes("\0")) return undefined;
    const directory = await this.directory(projectRoot);
    if (!directory) return undefined;
    return (await this.load(directory, fileName)).recording;
  }
}
