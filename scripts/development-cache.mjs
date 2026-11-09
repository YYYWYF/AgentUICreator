import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const transient = new Set(["EACCES", "EPERM", "EBUSY"]);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;

// Native paths stay native. Only the workspace identity is case-folded on Windows.
export function workspaceDevelopmentId(root, platform = process.platform) {
  const paths = platform === "win32" ? path.win32 : path;
  const normalized = paths.resolve(root);
  return createHash("sha256")
    .update(platform === "win32" ? normalized.toLowerCase() : normalized)
    .digest("hex")
    .slice(0, 24);
}

function retry(operation) {
  for (let attempt = 0; ; attempt++) {
    try {
      return operation();
    } catch (error) {
      if (!transient.has(error.code) || attempt >= 5) throw error;
      // These preflight/control operations are short, synchronous and usable
      // before workspace dependencies have been installed, including on Windows.
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        20 * (attempt + 1),
      );
    }
  }
}

function remove(file) {
  retry(() => fs.rmSync(file, { force: true }));
}

function writeJSON(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    retry(() =>
      fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 }),
    );
    retry(() => fs.renameSync(temporary, file));
  } finally {
    remove(temporary);
  }
}

function readJSON(file) {
  try {
    return JSON.parse(retry(() => fs.readFileSync(file, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError)
      return undefined;
    throw error;
  }
}

function directory(root, base) {
  return path.join(
    base,
    "agent-ui-development",
    workspaceDevelopmentId(fs.realpathSync(root)),
  );
}

/** Unique bakery tickets avoid deleting a successor's lock during stale recovery. */
export function acquireDevelopmentSession(
  root,
  { scope = "workspace", base = tmpdir() } = {},
) {
  if (!/^[a-z-]+$/u.test(scope))
    throw new Error("Invalid development session scope");
  const tickets = path.join(directory(root, base), "locks", scope);
  fs.mkdirSync(tickets, { recursive: true, mode: 0o700 });
  const own = { pid: process.pid, token: randomUUID(), number: null };
  const file = path.join(tickets, `${own.pid}.${own.token}.json`);
  const release = () => remove(file);
  const scan = () =>
    fs.readdirSync(tickets).flatMap((name) => {
      const match = /^(\d+)\.([0-9a-f-]{36})\.json$/u.exec(name);
      if (!match) return [];
      const target = path.join(tickets, name);
      const ticket = readJSON(target);
      if (!ticket) {
        // A concurrent owner may have released its ticket between list and read.
        if (!fs.existsSync(target)) return [];
        throw new Error(`Invalid development session ticket: ${target}`);
      }
      if (
        !Number.isSafeInteger(ticket.pid) ||
        ticket.pid <= 0 ||
        ticket.pid !== Number(match[1]) ||
        ticket.token !== match[2] ||
        !uuid.test(ticket.token) ||
        (ticket.number !== null &&
          (!Number.isSafeInteger(ticket.number) || ticket.number < 1))
      ) {
        throw new Error(`Invalid development session ticket: ${target}`);
      }
      try {
        process.kill(ticket.pid, 0);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
        remove(target);
        return [];
      }
      return [ticket];
    });
  writeJSON(file, own);
  try {
    own.number = 1 + Math.max(0, ...scan().map((ticket) => ticket.number ?? 0));
    writeJSON(file, own);
    const blocker = scan().find(
      (ticket) =>
        ticket.token !== own.token &&
        (ticket.number === null ||
          ticket.number < own.number ||
          (ticket.number === own.number && ticket.token < own.token)),
    );
    if (blocker)
      throw Object.assign(
        new Error(
          `Development session already running for this workspace (PID ${blocker.pid}, ${scope}). Stop that session before starting another.`,
        ),
        { code: "AGENT_UI_DEV_BUSY" },
      );
    return release;
  } catch (error) {
    release();
    throw error;
  }
}

/** Probe the same operations used by prebundling, before launching esbuild. */
export function probeDevelopmentCache(cacheDir, operations = fs) {
  const file = path.join(cacheDir, `${randomUUID()}.js.map`);
  const renamed = `${file}.ready`;
  try {
    retry(() => operations.writeFileSync(file, "{}", { flag: "wx" }));
    retry(() => operations.renameSync(file, renamed));
    retry(() => operations.unlinkSync(renamed));
  } catch (cause) {
    throw Object.assign(
      new Error(
        `Development cache is not writable (${cause.code}): ${cacheDir}. Check directory permissions or endpoint security restrictions for this path.`,
        { cause },
      ),
      { code: "AGENT_UI_DEV_CACHE_ACCESS" },
    );
  } finally {
    for (const target of [file, renamed]) {
      try {
        retry(() => operations.rmSync(target, { force: true }));
      } catch {
        /* Keep the original write failure. */
      }
    }
  }
}

/** Reuse only a matching generation whose previous optimizer fully stopped. */
export function openDevelopmentCache(
  root,
  role,
  inputs,
  { base = tmpdir(), warn = console.warn } = {},
) {
  const release = acquireDevelopmentSession(root, { scope: role, base });
  const parent = path.join(directory(root, base), role);
  const stateFile = path.join(parent, "state.json");
  let finished = false;
  try {
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          1,
          process.platform,
          process.arch,
          process.versions.node,
          ...inputs,
        ]),
      )
      .digest("hex");
    const previous = readJSON(stateFile);
    let generation =
      previous?.key === key &&
      previous.clean === true &&
      uuid.test(previous.generation ?? "")
        ? previous.generation
        : randomUUID();
    let reused = generation === previous?.generation;
    // React/Babel and other source transforms exclude node_modules by path.
    // Retain that boundary inside our OS cache, outside the project's modules.
    let cacheDir = path.join(parent, generation, "node_modules", ".vite");
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      probeDevelopmentCache(cacheDir);
    } catch (error) {
      if (!reused) throw error;
      // Never remove or rename a potentially locked old cache. Try a fresh one.
      warn(
        `[Creator] Cache generation unavailable; using a new directory: ${cacheDir}`,
      );
      generation = randomUUID();
      reused = false;
      cacheDir = path.join(parent, generation, "node_modules", ".vite");
      fs.mkdirSync(cacheDir, { recursive: true });
      probeDevelopmentCache(cacheDir);
    }
    const state = { key, generation, clean: false };
    writeJSON(stateFile, state);
    // Keep recent generations for in-flight readers. Locked old Windows files
    // are left alone; cleanup is never a prerequisite for starting the server.
    try {
      const older = fs
        .readdirSync(parent, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            uuid.test(entry.name) &&
            entry.name !== generation,
        )
        .map((entry) => ({
          file: path.join(parent, entry.name),
          time: fs.statSync(path.join(parent, entry.name)).mtimeMs,
        }))
        .sort((a, b) => b.time - a.time);
      for (const entry of older.slice(2))
        if (Date.now() - entry.time > 86_400_000) {
          try {
            fs.rmSync(entry.file, { recursive: true, force: true });
          } catch (error) {
            warn(`[Creator] Old cache retained (${error.code}): ${entry.file}`);
          }
        }
    } catch (error) {
      warn(`[Creator] Old cache cleanup skipped (${error.code}): ${parent}`);
    }
    return {
      cacheDir,
      reused,
      finish(clean = false) {
        if (finished) return;
        finished = true;
        try {
          if (clean) writeJSON(stateFile, { ...state, clean: true });
        } finally {
          release();
        }
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}
