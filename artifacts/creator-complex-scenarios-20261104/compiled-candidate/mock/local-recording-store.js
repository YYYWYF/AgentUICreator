import { constants } from "node:fs";
import { open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { MAX_MOCK_RECORDING_BYTES, parseMockRecording } from "../mock-agent/internal.js";
import { migrateLegacyAgentUIMetadata } from "../project/legacy-agent-ui-metadata.js";
const inside = (root, file) => file.startsWith(`${root}${path.sep}`);
const missing = (error) => error.code === "ENOENT";
const recordingExtension = (name) => /\.(?:jsonl|json|txt|sse)$/iu.test(name);
/** Current-project user data. No watcher, registry mutation or runtime dependency. */
export class LocalMockRecordingStore {
    cache = new Map();
    async directory(projectRoot) {
        try {
            await migrateLegacyAgentUIMetadata(projectRoot);
            const root = await realpath(projectRoot);
            const directory = await realpath(path.join(root, ".agent-ui/mocks"));
            if (!inside(root, directory))
                throw new Error("Local Mock directory must stay within the current project.");
            return directory;
        }
        catch (error) {
            if (missing(error))
                return undefined;
            throw error;
        }
    }
    async load(directory, fileName) {
        const id = `local:${fileName}`;
        const title = fileName.slice(0, -path.extname(fileName).length);
        const base = { id, title, fileName, eventCount: 0, durationMs: 0 };
        const file = path.join(directory, fileName);
        try {
            if (await realpath(file) !== file)
                throw new Error("Recording path must not traverse symlinks.");
            // Reject symlink files, including aliases into another project.
            const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
            try {
                const info = await handle.stat();
                if (!info.isFile())
                    throw new Error("Recording must be a regular file.");
                const key = `${info.mtimeMs}:${info.ctimeMs}:${info.size}:${info.ino}`;
                const cached = this.cache.get(file);
                if (cached?.key === key)
                    return cached.entry;
                if (info.size > MAX_MOCK_RECORDING_BYTES)
                    throw new Error("Recording exceeds the 8 MiB limit.");
                const buffer = Buffer.alloc(info.size + 1);
                let length = 0;
                while (length < buffer.length) {
                    const read = await handle.read(buffer, length, buffer.length - length, null);
                    if (!read.bytesRead)
                        break;
                    length += read.bytesRead;
                }
                const after = await handle.stat();
                if (length !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || after.size !== info.size)
                    throw new Error("Recording changed while reading; refresh to retry.");
                let entry;
                try {
                    const recording = parseMockRecording(buffer.subarray(0, length).toString("utf8"), { id, title });
                    entry = { recording, summary: { ...base, status: "ready", eventCount: recording.events.length, durationMs: recording.events.at(-1).atMs } };
                }
                catch (error) {
                    entry = { summary: { ...base, status: "invalid", error: error instanceof Error ? error.message : "Invalid recording." } };
                }
                this.cache.delete(file);
                // Bound retained recordings, not just the size of each individual file.
                while (this.cache.size >= 128 || [...this.cache.values()].reduce((sum, item) => sum + item.bytes, 0) + info.size > 32 * 1024 * 1024)
                    this.cache.delete(this.cache.keys().next().value);
                this.cache.set(file, { key, bytes: info.size, entry });
                return entry;
            }
            finally {
                await handle.close();
            }
        }
        catch (error) {
            return { summary: { ...base, status: "invalid", error: error instanceof Error ? error.message : "Unable to read recording." } };
        }
    }
    async list(projectRoot) {
        const directory = await this.directory(projectRoot);
        if (!directory)
            return [];
        const files = (await readdir(directory)).filter(recordingExtension).sort();
        const summaries = [];
        for (const file of files)
            summaries.push((await this.load(directory, file)).summary);
        const existing = new Set(files.map(file => path.join(directory, file)));
        for (const file of this.cache.keys())
            if (path.dirname(file) === directory && !existing.has(file))
                this.cache.delete(file);
        return summaries;
    }
    async get(projectRoot, recordingId) {
        if (!recordingId.startsWith("local:"))
            return undefined;
        const fileName = recordingId.slice(6);
        if (!recordingExtension(fileName) || path.basename(fileName) !== fileName || fileName.includes("\\") || fileName.includes("\0"))
            return undefined;
        const directory = await this.directory(projectRoot);
        if (!directory)
            return undefined;
        return (await this.load(directory, fileName)).recording;
    }
}
//# sourceMappingURL=local-recording-store.js.map