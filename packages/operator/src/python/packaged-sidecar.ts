import { createRequire } from "node:module";
import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { PythonCreatorRuntimeError } from "./runtime-error.js";
import { creatorDistributionRoot } from "../creatorRuntimeDistribution.js";

export interface PackagedSidecar {
  executable: string;
  pythonPackageRoot: string;
}

export async function resolvePackagedSidecar({
  platform = process.platform,
  architecture = process.arch,
  creatorRoot = creatorDistributionRoot(),
  resolvePackage = (name: string) => createRequire(path.join(creatorRoot, "package.json")).resolve(`${name}/package.json`),
}: {
  platform?: NodeJS.Platform | undefined;
  architecture?: string | undefined;
  creatorRoot?: string | undefined;
  resolvePackage?: ((name: string) => string) | undefined;
} = {}): Promise<PackagedSidecar> {
  const name = `@za38.03/agent-ui-creator-${platform}-${architecture}`;
  const creator = JSON.parse(await readFile(path.join(creatorRoot, "package.json"), "utf8"));
  const expectedVersion: unknown = creator.optionalDependencies?.[name];
  if (typeof expectedVersion !== "string") throw new PythonCreatorRuntimeError(
    "CREATOR_SIDECAR_PLATFORM_UNSUPPORTED", "Creator has no bundled Python runtime for this OS and CPU architecture.", { platform, architecture },
  );
  if (platform === "linux" && platform === process.platform && !(process.report?.getReport() as { header?: { glibcVersionRuntime?: string } }).header?.glibcVersionRuntime) {
    throw new PythonCreatorRuntimeError("CREATOR_SIDECAR_PLATFORM_UNSUPPORTED", "Creator's Linux Python runtime requires glibc.", { platform, architecture });
  }
  let root: string;
  try { root = path.dirname(resolvePackage(name)); }
  catch { throw new PythonCreatorRuntimeError(
    "CREATOR_SIDECAR_PACKAGE_MISSING", "Creator's platform runtime was not installed. Reinstall Creator with optional dependencies enabled and the platform package available in your npm registry.", { package: name },
  ); }
  try {
    const [manifest, sidecar, expected] = await Promise.all([
      readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
      readFile(path.join(root, "sidecar.json"), "utf8").then(JSON.parse),
      readFile(path.join(creatorRoot, "dist/python-sidecar.json"), "utf8").then(JSON.parse),
    ]);
    if (manifest.name !== name || !manifest.os?.includes(platform) || !manifest.cpu?.includes(architecture) ||
        (!expectedVersion.startsWith("workspace:") && manifest.version !== expectedVersion) || expected.schemaVersion !== 1 ||
        sidecar.schemaVersion !== 1 || sidecar.name !== name || sidecar.version !== manifest.version ||
        sidecar.platform !== platform || sidecar.arch !== architecture || sidecar.sourceHash !== expected.sourceHash) {
      throw new Error("Sidecar identity, version, or Creator source does not match");
    }
    const canonicalRoot = await realpath(root);
    async function contained(logical: unknown): Promise<string> {
      if (typeof logical !== "string" || logical.includes("\\") || logical.includes(":") ||
          logical.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid sidecar path");
      const resolved = await realpath(path.join(root, ...logical.split("/")));
      const relative = path.relative(canonicalRoot, resolved);
      if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("Sidecar path escapes package");
      return resolved;
    }
    const executable = await contained(sidecar.executable);
    const pythonPackageRoot = await contained(sidecar.pythonPackageRoot);
    await access(path.join(pythonPackageRoot, "agent_ui_creator/server.py"));
    // pnpm repeats the scoped package name in its virtual store. Windows Python
    // imports can otherwise silently treat >260-character modules as namespaces.
    // Use extended-length native paths without requiring a machine registry change.
    return platform === "win32"
      ? { executable: path.toNamespacedPath(executable), pythonPackageRoot: path.toNamespacedPath(pythonPackageRoot) }
      : { executable, pythonPackageRoot };
  } catch (error) {
    throw new PythonCreatorRuntimeError("CREATOR_SIDECAR_PACKAGE_INVALID", "Creator's platform runtime is incomplete or incompatible. Reinstall the matching Creator and platform package.", {
      package: name, cause: error instanceof Error ? error.message : String(error),
    });
  }
}
