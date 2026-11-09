import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { appUIModelJsonHash } from "../src/project/app-ui-serialization";
import { generatePluginRegistry } from "../src/project/registry-generator";
import { parseAppUIModelJson } from "../src/framework/contracts/app-ui-model";
import { operatorConfigForPaths, resolveAgentUIProjectPaths } from "../src/project/agent-ui-project-paths";
import { verifyRuntimeComposition } from "../src/project/runtime-composition-verifier";

it("verifies portable JSON evidence against current bytes and transaction identity", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "runtime-json 中文 "));
  const config = { mode: "platform" as const, sourceRoot: "src/agent-ui" };
  const paths = resolveAgentUIProjectPaths(root, config);
  const source = '{\r\n  "root": { "type": "stack", "children": [] }\r\n}\r\n';
  const hash = createHash("sha256").update(source).digest("hex");
  try {
    await mkdir(paths.pluginsRoot, { recursive: true });
    await mkdir(path.join(root, ".agent-ui"));
    await writeFile(path.join(root, "package.json"), '{"private":true}');
    await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify(config));
    await writeFile(paths.appUIModelPath, source);
    const generation = await generatePluginRegistry(root, parseAppUIModelJson(source), {
      config: operatorConfigForPaths(paths), paths,
    });
    expect(generation.errors).toEqual([]);
    const revisionFile = path.join(path.dirname(paths.appUIModelPath), "composition-revision.generated.json");
    await writeFile(revisionFile, "null\n");
    const composition = { appUIModelHash: appUIModelJsonHash(source), capabilityCatalogRevision: generation.capabilityCatalog.revision,
      compositionRevision: "manual", publishedAt: new Date().toISOString(), observedAt: new Date().toISOString(), instances: [], slots: [] };
    expect(await verifyRuntimeComposition(root, { appUIModelHash: hash, composition })).toMatchObject({ verified: true });
    await writeFile(revisionFile, JSON.stringify({ transactionId: "current-transaction", appUIModelHash: hash,
      appUIModelJsonHash: appUIModelJsonHash(source), capabilityCatalogRevision: generation.capabilityCatalog.revision }));
    await expect(verifyRuntimeComposition(root, { appUIModelHash: hash, composition })).rejects.toMatchObject({ code: "RUNTIME_COMPOSITION_REVISION_CONFLICT" });
    expect(await verifyRuntimeComposition(root, { appUIModelHash: hash, composition: { ...composition, compositionRevision: "current-transaction" } })).toMatchObject({ verified: true });
    await expect(verifyRuntimeComposition(root, { appUIModelHash: hash, composition: { ...composition, appUIModelHash: "f".repeat(64) } })).rejects.toMatchObject({ code: "RUNTIME_COMPOSITION_HASH_CONFLICT" });
    await writeFile(paths.appUIModelPath, (await readFile(paths.appUIModelPath, "utf8")) + "\n");
    await expect(verifyRuntimeComposition(root, { appUIModelHash: hash, composition })).rejects.toMatchObject({ code: "APP_UI_MODEL_HASH_CONFLICT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
