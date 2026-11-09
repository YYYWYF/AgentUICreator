import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Hash only the workspace path to keep unrelated checkouts' caches separate.
export function workspaceDevelopmentId(root, platform = process.platform) {
  const paths = platform === "win32" ? path.win32 : path;
  const normalized = paths.resolve(root);
  return createHash("sha256")
    .update(platform === "win32" ? normalized.toLowerCase() : normalized)
    .digest("hex")
    .slice(0, 24);
}

/** A single dev session starts fresh; old cache cleanup is best-effort. */
export function prepareDevelopmentCache(
  root,
  role,
  { base = tmpdir(), warn = console.warn, remove = fs.rmSync } = {},
) {
  const parent = path.join(
    base,
    "agent-ui-development",
    workspaceDevelopmentId(fs.realpathSync(root)),
    role,
  );
  fs.mkdirSync(parent, { recursive: true });
  const current = fs.mkdtempSync(path.join(parent, "run-"));
  // Preserve the node_modules boundary used by React/Babel source transforms,
  // while keeping these disposable files outside the project's dependencies.
  const cacheDir = path.join(current, "node_modules", ".vite");
  fs.mkdirSync(cacheDir, { recursive: true });
  const clear = (target) => {
    try {
      remove(target, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 50,
      });
    } catch (error) {
      // A locked Windows file must not prevent startup or be reused.
      warn(
        `[Creator] Previous Vite cache retained (${error.code}); using a fresh directory: ${target}`,
      );
    }
  };
  const legacyProject =
    role === "workbench"
      ? "apps/creator-workbench"
      : "examples/creator-host-sandbox";
  clear(path.join(root, ...legacyProject.split("/"), "node_modules", ".vite"));
  try {
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      const target = path.join(parent, entry.name);
      if (target === current) continue;
      // Include cache generations and metadata left by the previous implementation.
      const owned =
        (entry.isDirectory() &&
          (/^run-[a-zA-Z0-9]{6}$/u.test(entry.name) ||
            /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(
              entry.name,
            ))) ||
        (entry.isFile() && entry.name === "state.json");
      if (!owned) continue;
      clear(target);
    }
  } catch (error) {
    warn(
      `[Creator] Previous Vite cache cleanup skipped (${error.code}); using a fresh directory: ${parent}`,
    );
  }
  return cacheDir;
}
