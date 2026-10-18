import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assertSafeProjectRelativePath, assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";

export const PLUGIN_OWNERSHIP_FILE = "plugin-ownership.json";
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const entry = z.strictObject({
  pluginId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/u),
  directory: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/u),
  package: z.strictObject({ name: z.literal("@za38.03/agent-ui-plugins"), version: z.string().min(1) }),
  implementationRoot: z.literal("source").optional(),
  /** Pins the application-facing routing/scope contract independently of implementation BASE. */
  applicationContractHash: hash.optional(),
  pluginVersion: z.string().min(1), catalogHash: hash,
  approvedPlanHash: hash, lastSyncPlanHash: hash.optional(), origins: z.record(z.string(), z.string()), sharedDependencies: z.array(z.string()),
  compatibility: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/u), z.number().int().positive()).refine(value => Object.keys(value).length > 0),
  // BASE lives with the project, independent of replaceable node_modules.
  base: z.record(z.string(), z.strictObject({ sha256: hash, contentBase64: z.string() })),
});
const schema = z.strictObject({ schemaVersion: z.literal(1), plugins: z.record(z.string(), entry) });
export type PluginSourceOwnership = z.infer<typeof schema>;
export async function readPluginSourceOwnership(metadataRoot: string): Promise<PluginSourceOwnership> {
  await assertNoSymbolicLinkTraversal(metadataRoot, PLUGIN_OWNERSHIP_FILE);
  const bytes = await readFile(path.join(metadataRoot, PLUGIN_OWNERSHIP_FILE)).catch(error => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  const ownership = bytes ? schema.parse(JSON.parse(bytes.toString("utf8"))) : { schemaVersion: 1 as const, plugins: {} };
  for (const [id, record] of Object.entries(ownership.plugins)) {
    for (const [file, base] of Object.entries(record.base)) {
      assertSafeProjectRelativePath(file, "Plugin BASE path");
      if (record.implementationRoot === "source" && !file.startsWith("source/")) throw new Error("PLUGIN_BASE_SCOPE_INVALID");
      if (createHash("sha256").update(Buffer.from(base.contentBase64, "base64")).digest("hex") !== base.sha256) throw new Error("PLUGIN_BASE_INTEGRITY");
    }
    if (record.pluginId !== id || record.directory !== id) throw new Error("PLUGIN_OWNERSHIP_INVALID");
  }
  return ownership;
}
