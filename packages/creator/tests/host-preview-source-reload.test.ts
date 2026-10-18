import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createCreatorHostPreviewPlugin, requiresCreatorHostReload } from "../src/host-preview/vite.js";

afterEach(() => vi.useRealTimers());

it("accepts Windows logical paths and excludes unrelated files", () => {
  expect(requiresCreatorHostReload("plugins\\composer\\adapters\\composer.tsx")).toBe(true);
  expect(requiresCreatorHostReload("plugins\\registry.generated.ts")).toBe(true);
  expect(requiresCreatorHostReload("agent-ui\\theme\\theme-config.ts")).toBe(true);
  for (const file of ["../plugins/composer.tsx", "application/Agent.tsx", "plugins/composer/styles.css"]) {
    expect(requiresCreatorHostReload(file)).toBe(false);
  }
});

it("invalidates local implementations and reloads once after a takeover batch", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "creator preview "));
  const plugin = createCreatorHostPreviewPlugin();
  const hooks = plugin as unknown as {
    configResolved(config: { root: string }): void;
    handleHotUpdate(context: unknown): unknown;
    closeBundle(): void;
  };
  const module = {};
  const invalidateModule = vi.fn(), send = vi.fn();
  const context = (file: string) => ({file:path.join(root,"custom UI",file),modules:[module],server:{moduleGraph:{invalidateModule},ws:{send}}});
  try {
    hooks.configResolved({root});
    expect(hooks.handleHotUpdate(context("plugins/composer/definition.ts"))).toBeUndefined();
    await mkdir(path.join(root,".agent-ui"));
    await writeFile(path.join(root,".agent-ui/project.json"),JSON.stringify({sourceRoot:"custom UI"}));
    vi.useFakeTimers();
    for(const file of ["plugins/composer/definition.ts","plugins/registry.generated.ts","plugins/composer/adapters/composer.tsx"]){
      expect(hooks.handleHotUpdate(context(file))).toEqual([]);
    }
    expect(invalidateModule).toHaveBeenCalledTimes(3);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledExactlyOnceWith({type:"full-reload"});
    expect(hooks.handleHotUpdate(context("../other/plugins/definition.ts"))).toBeUndefined();
    expect(hooks.handleHotUpdate(context("plugins/composer/styles.css"))).toBeUndefined();
    hooks.handleHotUpdate(context("plugins/composer/adapters/composer.tsx"));
    hooks.closeBundle();
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledTimes(1);
  } finally { hooks.closeBundle();await rm(root,{recursive:true,force:true}); }
});
