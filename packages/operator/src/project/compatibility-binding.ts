import { createHash } from "node:crypto";
import { readFile, realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { validateAgentUISourceRoot } from "../bootstrap/source-root.js";

export const compatibilityBindingSchema = z.strictObject({
  schemaVersion: z.literal(1), producerRoot: z.string(),
  publishedHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export async function optionalText(file: string): Promise<string | undefined> {
  try { return await readFile(file, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export function compatibilityError(code: string): never { throw Object.assign(new Error(code), { code }); }
export async function safeCompatibilityPath(root: string, relative: string) {
  const target = validateAgentUISourceRoot(root, relative);
  for (let current = target; current !== root; current = path.dirname(current)) {
    try { if ((await lstat(current)).isSymbolicLink()) compatibilityError("AGENT_UI_COMPATIBILITY_PATH_INVALID"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return target;
}
export async function readCompatibilityBinding(hostRoot: string) {
  const root = await realpath(hostRoot);
  await safeCompatibilityPath(root, ".agent-ui/producer.json");
  const text = await optionalText(path.join(root, ".agent-ui/producer.json"));
  if (text === undefined) return undefined;
  const binding = compatibilityBindingSchema.parse(JSON.parse(text));
  return { ...binding, hostRoot: root, projectRoot: await safeCompatibilityPath(root, binding.producerRoot) };
}
/** A producer may only address its enclosing, reciprocally bound consumer. */
export async function resolveCompatibilityConsumer(projectRoot: string) {
  const root = await realpath(projectRoot);
  const source = await optionalText(await safeCompatibilityPath(root, ".agent-ui/consumer.json"));
  if (source === undefined) return undefined;
  const link = z.strictObject({ schemaVersion: z.literal(1), hostRelativePath: z.string() }).parse(JSON.parse(source));
  const host = await realpath(path.resolve(root, link.hostRelativePath));
  const binding = await readCompatibilityBinding(host);
  if (!binding || await realpath(binding.projectRoot) !== root) compatibilityError("AGENT_UI_COMPATIBILITY_BINDING_INVALID");
  return binding;
}
