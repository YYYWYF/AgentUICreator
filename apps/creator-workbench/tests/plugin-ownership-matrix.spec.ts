import { expect, test } from "@playwright/test";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePluginApplication, synchronizeAgentUIPluginRegistry, handleUIOperatorRequest } from "@za38.03/agent-ui-creator/project/dev";
import deliveries from "../../../packages/plugins/src/catalog/plugin-delivery.json" with { type: "json" };
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
import { captureWindowErrors } from "./support/window-errors.js";

const evidence = fileURLToPath(new URL("../../../artifacts/remaining-acceptance-20261031/ownership-matrix.json", import.meta.url));
const failureLog = fileURLToPath(new URL("../../../artifacts/remaining-acceptance-20261031/ownership-validation-failure.log", import.meta.url));
async function applicationFiles(directory: string) {
  const files: Record<string, string> = {};
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (file.isFile()) files[file.name] = await readFile(path.join(directory, file.name), "utf8");
  }
  return files;
}

test("all official applications preserve composition through exact-installed-source extraction and real project checks", async ({ page }) => {
  const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message));
  const rows: { pluginId: string; status: string; checks?: string[]; error?: string }[] = [];
  const fixture = await createConnectionHostFixture({ projectChecks: true, prepareHost: async root => {
    for (const delivery of deliveries) await ensurePluginApplication(root, delivery.id);
    await synchronizeAgentUIPluginRegistry(root);
    await writeFile(path.join(root, "capture-validation.mjs"), `import {spawnSync} from "node:child_process";import {appendFileSync} from "node:fs";
      const args=process.argv[2]==="typecheck"?["node_modules/typescript/bin/tsc","--noEmit"]:["validate-build.mjs"];
      const result=spawnSync(process.execPath,args,{cwd:process.cwd(),encoding:"utf8",maxBuffer:20*1024*1024});
      process.stdout.write(result.stdout??"");process.stderr.write(result.stderr??"");
      if(result.status!==0)appendFileSync(${JSON.stringify(failureLog)},JSON.stringify({check:process.argv[2],cwd:process.cwd(),status:result.status,output:(result.stdout??"")+(result.stderr??""),error:result.error?.message})+"\\n");
      process.exitCode=result.status??1;`);
    const pkgFile = path.join(root, "package.json");
    const pkg = JSON.parse(await readFile(pkgFile, "utf8"));
    pkg.scripts.typecheck = "node capture-validation.mjs typecheck"; pkg.scripts.build = "node capture-validation.mjs build";
    await writeFile(pkgFile, JSON.stringify(pkg));
  } });
  const modelPath = path.join(fixture.hostRoot, "src/agent-ui/app-ui.json");
  const model = await readFile(modelPath, "utf8");
  try {
    fixture.enableCors();
    await writeFile(path.join(fixture.hostRoot, "src/main.tsx"), `import {createRoot} from "react-dom/client";import {Agent} from "./agent-ui";import "./host.css";createRoot(document.getElementById("root")!).render(<Agent endpoint=${JSON.stringify(fixture.agentEndpoint)}/>);`);
    await page.goto(fixture.hostOrigin);
    await expect(page.locator(".aui-composer-root").getByRole("textbox")).toBeEditable({ timeout: 20_000 });
    // This is a disposable test project: the trusted test harness applies each
    // concrete plan. It never authorizes takeover in a user's existing project.
    for (const [index, delivery] of deliveries.entries()) {
      const directory = path.join(fixture.hostRoot, "src/agent-ui/plugins", delivery.id);
      const before = await applicationFiles(directory);
      try {
        const planned = await handleUIOperatorRequest({ operation: "plan_plugin_source_takeover", input: { pluginId: delivery.id } }, fixture.hostRoot);
        expect(planned, JSON.stringify(planned)).toMatchObject({ ok: true });
        const plan = (planned as { result: { planHash: string; package: { name: string }; files: string[] } }).result;
        expect(plan.package.name).toBe("@za38.03/agent-ui-plugins");
        expect(plan.files.length).toBeGreaterThan(0);
        expect(plan.files.every(file => file.startsWith(`plugins/${delivery.id}/source/`))).toBe(true);
        const applied = await handleUIOperatorRequest({ operation: "takeover_plugin_source", input: { pluginId: delivery.id, planHash: plan.planHash } }, fixture.hostRoot);
        expect(applied, JSON.stringify(applied)).toMatchObject({ ok: true, result: { ownership: "project_source", checks: ["typecheck", "build"] } });
        expect(await readFile(modelPath, "utf8")).toBe(model);
        const after = await applicationFiles(directory);
        expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
        const imported = `@za38.03/agent-ui-plugins/${delivery.id}`;
        for (const [file, value] of Object.entries(before)) {
          const expected = file === "index.tsx" ? value.replaceAll(imported, "./source/index")
            : file === "definition.ts" ? value.replaceAll(`@za38.03/agent-ui-plugins/${delivery.id}`, "./source/definition") : value;
          expect(after[file], `${delivery.id}/${file}`).toBe(expected);
        }
        const owned = JSON.parse(await readFile(path.join(fixture.hostRoot, ".agent-ui/plugin-ownership.json"), "utf8"));
        expect(owned.plugins[delivery.id].implementationRoot).toBe("source");
        expect(Object.keys(owned.plugins[delivery.id].base).every(file => file.startsWith("source/"))).toBe(true);
        rows.push({ pluginId: delivery.id, status: "passed", checks: ["typecheck", "build", "application-preserved", "model-preserved", "implementation-only-base"] });
      } catch (error) {
        rows.push({ pluginId: delivery.id, status: "failed", error: String(error) });
        await writeFile(evidence, JSON.stringify(rows, null, 2)); throw error;
      }
      await writeFile(evidence, JSON.stringify(rows, null, 2));
      console.log(`[ownership matrix] ${index + 1}/${deliveries.length}: ${delivery.id} passed`);
    }
    await page.reload();
    const composer = page.locator(".aui-composer-root").getByRole("textbox");
    await expect(composer).toBeEditable(); await composer.fill("Smoke after all source extractions");
    await page.locator(".aui-composer-send").click();
    await expect(page.locator(".aui-md")).toContainText("wire:first"); fixture.finishRun();
    await expect(page.locator(".aui-md")).toContainText("wire:finished");
    expect(rows).toHaveLength(deliveries.length); expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});
