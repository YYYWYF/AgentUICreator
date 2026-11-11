import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

// A local registry for unpublished first-party artifacts, including auto-installed peers.
// Third-party packages continue to use the caller's ordinary registry configuration.
export async function startCreatorArtifactRegistry(directory, { port = 0 } = {}) {
  let packages = new Map(), archives = new Map();
  async function refresh() {
    const nextPackages = new Map(), nextArchives = new Map();
    for (const filename of (await readdir(directory)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))) {
      if (!filename.endsWith(".tgz")) continue;
      const archive = path.join(directory, filename);
      const manifest = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
      const integrity = "sha512-" + createHash("sha512").update(await readFile(archive)).digest("base64");
      nextArchives.set(`/tarballs/${filename}`, archive);
      const versions = nextPackages.get(manifest.name) ?? new Map();
      versions.set(manifest.version, { manifest, filename, integrity });
      nextPackages.set(manifest.name, versions);
    }
    packages = nextPackages;
    archives = nextArchives;
  }
  await refresh();
  let origin;
  const server = createServer((request, response) => {
    const url = new URL(request.url, origin);
    const archive = archives.get(url.pathname);
    if (archive) {
      response.setHeader("Content-Type", "application/octet-stream");
      createReadStream(archive).on("error", () => response.destroy()).pipe(response);
      return;
    }
    const entry = packages.get(decodeURIComponent(url.pathname.slice(1)));
    if (!entry) { response.statusCode = 404; response.end('{"error":"not_found"}'); return; }
    const latest = [...entry.keys()].at(-1);
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ name: [...entry.values()][0].manifest.name, "dist-tags": { latest },
      versions: Object.fromEntries([...entry].map(([version, { manifest, filename, integrity }]) => [version,
        { ...manifest, dist: { tarball: `${origin}/tarballs/${filename}`, integrity } }])) }));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, refresh, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
