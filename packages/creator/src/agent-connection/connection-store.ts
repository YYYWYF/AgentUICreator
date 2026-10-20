import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentConnectionState } from "./types.js";
import { migrateLegacyAgentUIMetadata } from "../project/legacy-agent-ui-metadata.js";
export function validateConnection(value: unknown): Pick<AgentConnectionState, "activeSource" | "endpoint" | "connectionMode"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Agent connection.");
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some(key => key !== "activeSource" && key !== "endpoint" && key !== "connectionMode") ||
    (fields.activeSource !== "mock" && fields.activeSource !== "connected")) throw new Error("Select Mock or Connected Agent.");
  let endpoint: string | undefined;
  if (fields.connectionMode !== undefined && fields.connectionMode !== "direct" && fields.connectionMode !== "proxy") throw new Error("Invalid Agent connection mode.");
  const connectionMode = fields.connectionMode === "direct" ? "direct" : "proxy";
  if (fields.endpoint !== undefined) {
    if (typeof fields.endpoint !== "string" || fields.endpoint.length > 4096) throw new Error("Invalid Agent endpoint.");
    const url = new URL(fields.endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("Use an HTTP(S) Agent endpoint without credentials or fragments.");
    endpoint = url.href;
  }
  if (fields.activeSource === "connected" && !endpoint) throw new Error("Agent endpoint is required.");
  return { activeSource: fields.activeSource, connectionMode, ...(endpoint ? { endpoint } : {}) };
}
export class ConnectionStore {
  readonly file: string;
  constructor(readonly projectRoot: string) { this.file = path.join(projectRoot, ".agent-ui/connection.local.json"); }
  async read(): Promise<AgentConnectionState> {
    await migrateLegacyAgentUIMetadata(this.projectRoot);
    try {
      const saved = validateConnection(JSON.parse(await readFile(this.file, "utf8")));
      return { ...saved, configured: true, running: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return { activeSource: "mock", configured: false, running: false };
    }
  }
  async save(value: unknown): Promise<AgentConnectionState> {
    const saved = validateConnection(value);
    await migrateLegacyAgentUIMetadata(this.projectRoot);
    await mkdir(path.dirname(this.file), { recursive: true });
    // Ignore only the local connection, retaining shareable mock recordings.
    const ignoreFile = path.join(path.dirname(this.file), ".gitignore");
    let ignore = "";
    try { ignore = await readFile(ignoreFile, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (!ignore.split(/\r?\n/).includes("/connection.local.json")) await writeFile(ignoreFile, `${ignore}${ignore && !ignore.endsWith("\n") ? "\n" : ""}/connection.local.json\n`);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(saved, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, this.file);
    return { ...saved, configured: true, running: false };
  }
}
