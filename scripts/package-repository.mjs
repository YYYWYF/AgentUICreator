import { createWriteStream } from "node:fs";
import { lstat, readdir, readFile, mkdir, stat } from "node:fs/promises";
import { once } from "node:events";
import { deflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function packageRepository(root, output, { websiteOnly = false } = {}) {
  root = path.resolve(root);
  output = path.resolve(output);
  // Build on the external machine; an extracted static handoff needs no compiler.
  let sourceWebsite = false;
  try { sourceWebsite = (await stat(path.join(root, "website/package.json"))).isFile(); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (sourceWebsite) {
    const { buildStaticWebsite, generateDocumentation } = await import("./creator-documentation.mjs");
    await (websiteOnly ? buildStaticWebsite(root) : generateDocumentation(root));
  }
  const website = path.join(root, sourceWebsite ? "website/doc_build" : "website");
  const excluded = new Set([".git", ".github", ".venv", ".vscode", ".pnpm-store", ".pytest_cache", "node_modules", "tests", "doc_build", ".rspress", ".vite"]);
  const files = [];
  async function visit(relative = "") {
    for (const entry of (await readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const logical = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink() || logical === "website") continue;
      if (entry.isDirectory()) { if (!excluded.has(entry.name)) await visit(logical); }
      else if (entry.isFile() && entry.name !== "pnpm-lock.yaml" && !(entry.name.startsWith(".env") && entry.name.endsWith(".local")) && path.resolve(root, logical) !== output) files.push({ logical, absolute: path.join(root, logical) });
    }
  }
  if (!websiteOnly) await visit();
  async function visitWebsite(relative = "") {
    for (const entry of await readdir(path.join(website, relative), { withFileTypes: true })) {
      const logical = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await visitWebsite(logical);
      else if (entry.isFile() && path.resolve(website, logical) !== output) files.push({ logical: path.posix.join("website", logical), absolute: path.join(website, logical) });
    }
  }
  await visitWebsite();
  if (files.length > 65535) throw new Error("Archive exceeds the supported ZIP entry count.");
  const crcTable = Array.from({ length: 256 }, (_, value) => { for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
  function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  await mkdir(path.dirname(output), { recursive: true });
  const stream = createWriteStream(output, { flags: "w" });
  let offset = 0;
  async function write(bytes) { if (offset + bytes.length > 0xffffffff) throw new Error("Archive exceeds the supported ZIP size."); offset += bytes.length; if (!stream.write(bytes)) await once(stream, "drain"); }
  const central = [];
  try {
    for (const { logical: file, absolute } of files) {
      const info = await lstat(absolute);
      if (!info.isFile()) throw new Error(`Archive input changed: ${file}`);
      const data = await readFile(absolute), compressed = deflateRawSync(data, { level: 6 });
      const name = Buffer.from(websiteOnly ? file : path.posix.join(path.basename(root), file), "utf8");
      if (name.length > 65535) throw new Error("Archive path is too long.");
      const year = Math.min(2107, Math.max(1980, info.mtime.getFullYear()));
      const date = ((year - 1980) << 9) | ((info.mtime.getMonth() + 1) << 5) | info.mtime.getDate();
      const time = (info.mtime.getHours() << 11) | (info.mtime.getMinutes() << 5) | (info.mtime.getSeconds() >>> 1);
      const crc = crc32(data), localOffset = offset;
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
      await write(local); await write(name); await write(compressed);
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8); record.writeUInt16LE(8, 10); record.writeUInt16LE(time, 12); record.writeUInt16LE(date, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(compressed.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(localOffset, 42);
      central.push(Buffer.concat([record, name]));
    }
    const centralOffset = offset;
    for (const record of central) await write(record);
    const ending = Buffer.alloc(22);
    ending.writeUInt32LE(0x06054b50); ending.writeUInt16LE(files.length, 8); ending.writeUInt16LE(files.length, 10); ending.writeUInt32LE(offset - centralOffset, 12); ending.writeUInt32LE(centralOffset, 16);
    await write(ending); stream.end(); await once(stream, "close");
    return { output, files: files.length };
  } catch (error) { stream.destroy(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: node scripts/package-repository.mjs [--website-only] [output.zip]\nBuilds documentation on the external source checkout; intranet copies package website/ as static files without website tooling.\n--website-only creates a standalone website ZIP without repository files.");
  } else {
    const websiteOnly = process.argv.includes("--website-only");
    const args = process.argv.slice(2).filter(arg => arg !== "--website-only");
    if (args.length > 1 || args.some(arg => arg.startsWith("--"))) throw new Error("Expected one optional ZIP output path; use --help for usage.");
    const root = fileURLToPath(new URL("..", import.meta.url));
    const output = path.resolve(args[0] ?? path.join(path.dirname(root), websiteOnly ? "AgentUIWebsite.zip" : path.basename(root) + ".zip"));
    const result = await packageRepository(root, output, { websiteOnly });
    console.log(`Created ${result.output} (${result.files} files; website/ is static and ready to deploy)`);
  }
}
