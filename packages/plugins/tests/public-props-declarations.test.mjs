import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, it } from "vitest";
import { deliveries } from "../scripts/plugin-source-recipes.mjs";
import { isPublicPluginDeclaration } from "../scripts/public-declarations.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const declarations = new Set(deliveries.filter(entry => entry.publicPresentationTypes)
  .flatMap(entry => entry.presentation.map(file => `plugins/${entry.presentationOwner}/adapters/presentation/${file.replace(/\.tsx?$/u, ".d.ts")}`)));

it("ships the Composer declarations referenced by the public props on POSIX and Windows", async () => {
  for (const file of ["composer", "textarea"]) {
    const logical = `plugins/composer/adapters/presentation/${file}.d.ts`;
    expect(isPublicPluginDeclaration(logical, declarations)).toBe(true);
    expect(isPublicPluginDeclaration(path.win32.join(...logical.split("/")), declarations)).toBe(true);
    await access(path.join(packageRoot, "dist", ...logical.split("/")));
  }
  expect(isPublicPluginDeclaration("theme\\theme-contract.d.ts", declarations)).toBe(true);
});

it("keeps public action prop declarations independent of private tooltip implementations", async () => {
  const declaration = await readFile(path.join(packageRoot, "dist/public.d.ts"), "utf8");
  expect(declaration).not.toContain("internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tooltip-icon-button");
  expect(declaration).toContain("likeButtonProps");
  expect(declaration).not.toContain("positiveProps");
});
