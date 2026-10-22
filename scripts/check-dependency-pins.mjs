import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const exact = /^(?:npm:(?:@[^/\s]+\/)?[^@\s]+@)?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u;
const exactPython = /^[\w.-]+==(?:\d+!)?\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?(?:\+[a-z\d]+(?:[._-][a-z\d]+)*)?$/iu;
const skipped = new Set(["node_modules", "dist", ".git", ".generated", "vendor", "upstream"]);

export async function checkDependencyPins(root = workspaceRoot) {
  const failures = [];
  const plugins = JSON.parse(await readFile(path.join(root, "packages/plugins/package.json"), "utf8"));
  const reactPeers = plugins.peerDependencies ?? {};
  const historicalRoot = path.join(root, "packages", "plugins", "resources", "history");
  async function check(file) {
    const manifest = JSON.parse(await readFile(file, "utf8"));
    const fields = Object.fromEntries(
      ["dependencies", "devDependencies", "optionalDependencies", "packages"].map(field => [field, manifest[field]]),
    );
    // Overrides select actual installed versions, unlike peer compatibility ranges.
    fields["pnpm.overrides"] = manifest.pnpm?.overrides;
    for (const [field, dependencies] of Object.entries(fields)) {
      for (const [name, version] of Object.entries(dependencies ?? {})) {
        const workspace = field !== "pnpm.overrides" && version === "workspace:*";
        // A resource's React requirement describes host compatibility, not a
        // request to replace the host's installed React with our dev baseline.
        const hostReact = field === "packages" && path.basename(file) === "item.json" &&
          ["react", "react-dom"].includes(name) && typeof version === "string" &&
          version === reactPeers[name];
        if (!workspace && !hostReact && (typeof version !== "string" || !exact.test(version))) {
          failures.push(`${path.relative(root, file)} ${field}: ${name}=${version}`);
        }
      }
    }
  }
  async function visit(directory) {
    // Historical releases are immutable evidence, not current install requirements.
    if (directory === historicalRoot) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && !skipped.has(entry.name)) await visit(file);
      if (entry.isFile() && ["package.json", "item.json"].includes(entry.name)) await check(file);
    }
  }
  const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (!/^pnpm@\d+\.\d+\.\d+(?:\+sha\d+\.[a-f\d]+)?$/u.test(rootManifest.packageManager ?? "")) {
    failures.push("package.json: packageManager must pin an exact pnpm version");
  }
  await check(path.join(root, "package.json"));
  for (const directory of ["packages", "apps", "examples", "scripts", "website"]) await visit(path.join(root, directory));
  const pythonManifest = await readFile(path.join(root, "packages/creator/python/pyproject.toml"), "utf8");
  for (const block of pythonManifest.matchAll(/(?:dependencies|requires|test)\s*=\s*\[([\s\S]*?)\]/gu)) {
    for (const quoted of block[1].matchAll(/"([^"]+)"/gu)) {
      if (!exactPython.test(quoted[1])) failures.push(`pyproject.toml: ${quoted[1]}`);
    }
  }
  const pythonLock = await readFile(path.join(root, "packages/creator/python/requirements.lock"), "utf8");
  for (const line of pythonLock.split(/\r?\n/u)) {
    if (line.trim() && !line.startsWith("#") && !exactPython.test(line)) failures.push(`requirements.lock: ${line}`);
  }
  if (failures.length) throw new Error(`Dependencies must use exact versions:\n${failures.join("\n")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await checkDependencyPins();
  console.log("All active JS/Python install requirements, overrides and pnpm use exact versions. Peer compatibility ranges and historical snapshots are preserved.");
}
