import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

// A local registry for unpublished first-party artifacts, including auto-installed peers.
// Third-party packages continue to use the caller's ordinary registry configuration.
export async function startCreatorArtifactRegistry(directory) {
  const packages = new Map(), archives = new Map();
  for (const filename of await readdir(directory)) {
    if (!filename.endsWith(".tgz")) continue;
    const archive = path.join(directory, filename);
    const manifest = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
    const integrity = "sha512-" + createHash("sha512").update(await readFile(archive)).digest("base64");
    archives.set(`/tarballs/${filename}`, archive);
    packages.set(manifest.name, { manifest, filename, integrity });
  }
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
    const { manifest, filename, integrity } = entry;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ name: manifest.name, "dist-tags": { latest: manifest.version },
      versions: { [manifest.version]: { ...manifest, dist: { tarball: `${origin}/tarballs/${filename}`, integrity } } } }));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
