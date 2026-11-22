import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, it } from "vitest";
import { deliveries } from "../scripts/plugin-source-recipes.mjs";
import { isPublicPluginDeclaration, publicPresentationFiles, sourceRuntimeDeclarations } from "../scripts/public-declarations.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const declarations = new Set(deliveries
  .flatMap(entry => publicPresentationFiles(entry).map(file => `plugins/${entry.presentationOwner}/adapters/presentation/${file.replace(/\.tsx?$/u, ".d.ts")}`)));

it("retains public conversation props while keeping split presentation implementation declarations private on Windows and POSIX", async () => {
  for (const [plugin, files] of [
    ["conversation-surface", ["conversation-surface", "message-identity", "message-speaker", "surface", "welcome"]],
    ["conversation-thread-list", ["conversation-thread-list", "PolicyThreadList", "list/policy-thread-list"]],
  ]) {
    for (const file of files) {
      const logical = `plugins/${plugin}/adapters/presentation/${file}.d.ts`;
      expect(isPublicPluginDeclaration(logical, declarations)).toBe(true);
      expect(isPublicPluginDeclaration(path.win32.join(...logical.split('/')), declarations)).toBe(true);
      await access(path.join(packageRoot, "dist", ...logical.split('/')));
    }
  }
  for (const logical of [
    "plugins/conversation-surface/adapters/presentation/thread/thread-context.d.ts",
    "plugins/conversation-thread-list/adapters/presentation/list/thread-item-menu.d.ts",
  ]) {
    expect(isPublicPluginDeclaration(logical, declarations)).toBe(false);
    expect(isPublicPluginDeclaration(path.win32.join(...logical.split('/')), declarations)).toBe(false);
    await expect(access(path.join(packageRoot, "dist", ...logical.split('/')))).rejects.toMatchObject({code: "ENOENT"});
  }
});

it("ships the Composer declarations referenced by the public props on POSIX and Windows", async () => {
  for (const file of ["composer", "textarea"]) {
    const logical = `plugins/composer/adapters/presentation/${file}.d.ts`;
    expect(isPublicPluginDeclaration(logical, declarations)).toBe(true);
    expect(isPublicPluginDeclaration(path.win32.join(...logical.split("/")), declarations)).toBe(true);
    await access(path.join(packageRoot, "dist", ...logical.split("/")));
  }
  for (const file of ["selection", "binding"]) {
    const logical = `plugins/skills-selection/adapters/presentation/${file}.d.ts`;
    expect(isPublicPluginDeclaration(logical, declarations)).toBe(true);
    expect(isPublicPluginDeclaration(path.win32.join(...logical.split("/")), declarations)).toBe(true);
    await access(path.join(packageRoot, "dist", ...logical.split("/")));
  }
  expect(isPublicPluginDeclaration("theme\\theme-contract.d.ts", declarations)).toBe(true);
  const inputController = 'composer-data/input-controller.d.ts';
  expect(isPublicPluginDeclaration(inputController, declarations)).toBe(true);
  expect(isPublicPluginDeclaration(path.win32.join(...inputController.split('/')), declarations)).toBe(true);
  await access(path.join(packageRoot, 'dist', ...inputController.split('/')));
  for (const file of ['request', 'request-parts', 'native-session', 'quote-context']) {
    const logical = `composer-data/${file}.d.ts`;
    expect(isPublicPluginDeclaration(logical, declarations)).toBe(false);
    expect(isPublicPluginDeclaration(path.win32.join(...logical.split('/')), declarations)).toBe(false);
    await expect(access(path.join(packageRoot, 'dist', ...logical.split('/')))).rejects.toMatchObject({ code: 'ENOENT' });
  }
  for (const logical of sourceRuntimeDeclarations) {
    expect(isPublicPluginDeclaration(logical, declarations)).toBe(true);
    expect(isPublicPluginDeclaration(path.win32.join(...logical.split("/")), declarations)).toBe(true);
    await access(path.join(packageRoot, "dist", ...logical.split("/")));
  }
  for (const name of ["usePluginService", "useLocaleSnapshot", "useThemeSnapshot"]) {
    const hook = `plugin-api/${name}.d.ts`;
    expect(isPublicPluginDeclaration(hook, declarations)).toBe(true);
    expect(isPublicPluginDeclaration(path.win32.join(...hook.split("/")), declarations)).toBe(true);
    await access(path.join(packageRoot, "dist", ...hook.split("/")));
  }
  await expect(access(path.join(packageRoot, "dist/plugin-api/usePluginServiceSnapshot.d.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("keeps public action prop declarations independent of private tooltip implementations", async () => {
  const declaration = await readFile(path.join(packageRoot, "dist/public.d.ts"), "utf8");
  expect(declaration).not.toContain("internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tooltip-icon-button");
  expect(declaration).toContain("likeButtonProps");
  expect(declaration).not.toContain("positiveProps");
});


it("keeps suggestion data types public and request assembly on Composer", async () => {
  const declaration = await readFile(path.join(packageRoot, "dist/public.d.ts"), "utf8");
  expect(declaration).toContain("export interface ConversationSuggestionRequestItem");
  expect(declaration).not.toContain("ConversationSuggestionRequestAdapter");
  expect(declaration).not.toContain("ConversationQuoteRequestAdapter");
  expect(declaration).toContain("export declare function ConversationFollowupSuggestions");
  expect(declaration).not.toContain("internal/adapters-generated/assistant-ui/suggestion-request");
  expect(declaration).not.toContain("internal/adapters-generated/assistant-ui/components/assistant-ui/elements/follow-up-suggestions");
});
