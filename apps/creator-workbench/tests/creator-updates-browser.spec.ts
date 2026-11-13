import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer, type ViteDevServer } from "vite";
import { expect, test, type Page } from "@playwright/test";

// Real browser and Creator presentation, controlled HTTP responses. Filesystem
// install/recovery and BASE protection are covered by Operator integration tests.
let server: ViteDevServer;
let fixture: string;
let origin: string;
test.beforeAll(async () => {
  fixture = await mkdtemp(path.resolve(".updates-e2e-"));
  await writeFile(path.join(fixture, "index.html"), '<style>html,body,#root{height:100%;margin:0}</style><div id="root"></div><script type="module" src="/fixture.tsx"></script>');
  await writeFile(path.join(fixture, "fixture.tsx"), `
    import {useState} from "react";
    import {createRoot} from "react-dom/client";
    import {CreatorPluginUpdates} from "creator-updates-under-test";
    import "@za38.03/agent-ui-creator/ui.css";
    const noop = () => {};
    function Fixture() {
      const [checkRequest, refresh] = useState(0);
      return <div className="creator-workbench" data-creator-layout="dock"><section className="creator-panel">
        <header><button onClick={() => refresh(value => value + 1)}>Host refresh</button></header>
        <div className="creator-panel-body"><CreatorPluginUpdates workspaceId="extended-project" pageOpen busy={false}
          modelReady checkRequest={checkRequest} onPageChange={noop} onModelMerge={noop}/></div>
      </section></div>;
    }
    createRoot(document.getElementById("root")).render(<Fixture/>);
  `);
  server = await createServer({
    configFile: false, root: fixture, plugins: [react()],
    resolve: { dedupe: ["react", "react-dom"], alias: {
      "creator-updates-under-test": fileURLToPath(new URL("../../../packages/creator/src/ui/CreatorPluginUpdates.tsx", import.meta.url)),
    } },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen(); origin = server.resolvedUrls!.local[0]!;
});
test.afterAll(async () => { await server?.close(); if (fixture) await rm(fixture, { recursive: true, force: true }); });

const packageName = "@za38.03/agent-ui-plugins";
const overview = {
  status: "online", checkedAt: "2026-10-31T00:00:00Z", recommendedReleaseId: "next",
  installationSupported: true, fingerprint: "npm-next", blockedReleases: [],
  packages: [{ name: packageName, scope: "project", currentVersion: "0.0.1", targetVersion: "0.0.2",
    updateAvailable: true, summary: [{ id: "feature", summary: "Composer fixture update", kind: "feature", versions: ["0.0.2"] }], history: [] }],
};
const inspection = { releaseVersion: "0.0.2", compatibility: "compatible", fingerprint: "source-next", plugins: [], packageUpdates: overview };
function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}

for (const width of [420, 1000]) test(`package plan at ${width}px can be cancelled; stale confirmation requires a fresh reviewed plan`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const errors = captureErrors(page);
  const requests: { route: string; body: Record<string, unknown> }[] = [];
  let sequence = 0, installed = false;
  await page.route("**/__creator/updates/**", async route => {
    const action = new URL(route.request().url()).pathname.split("/updates/")[1]!;
    const body = route.request().postDataJSON(); requests.push({ route: action, body });
    if (action === "check") return route.fulfill({ json: installed ? { ...inspection, packageUpdates: { ...overview, packages: overview.packages.map(pkg => ({ ...pkg, currentVersion: pkg.targetVersion, updateAvailable: false })) } } : inspection });
    if (action === "packages/plan") return route.fulfill({ json: { id: `review-${++sequence}`, manager: "npm", lockfile: "package-lock.json", packages: [{ name: packageName, current: "0.0.1", target: "0.0.2" }], checks: ["typecheck", "build"] } });
    if (action === "packages/execute") {
      if (body.planId === "review-2") return route.fulfill({ status: 409, json: { error: "PACKAGE_PLAN_STALE" } });
      installed = true; return route.fulfill({ json: { status: "installed", checks: ["typecheck", "build"] } });
    }
    return route.fulfill({ status: 500, json: { error: "Unexpected update route" } });
  });
  await page.goto(origin);
  await page.getByRole("button", { name: "更新官方插件", exact: true }).click();
  const plan = page.locator(".creator-package-plan");
  await expect(plan).toBeFocused();
  await expect(plan).toContainText("你接管的插件和项目修改会保留");
  expect(requests.filter(request => request.route === "packages/execute")).toEqual([]);
  await plan.getByRole("button", { name: "稍后", exact: true }).click();
  await expect(plan).toHaveCount(0);
  expect(requests.filter(request => request.route === "packages/execute")).toEqual([]);
  await page.getByRole("button", { name: "更新官方插件", exact: true }).click();
  await plan.getByRole("button", { name: "确认更新", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "更新计划已过期" })).toBeVisible();
  await expect(page.getByText("更新已完成。请重新打开工程预览", { exact: false })).toHaveCount(0);
  await expect(plan.getByRole("button", { name: "稍后", exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath(`stale-plan-${width}.png`) });
  await plan.getByRole("button", { name: "稍后", exact: true }).click();
  await page.getByRole("button", { name: "更新官方插件", exact: true }).click();
  await plan.getByRole("button", { name: "确认更新", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "更新已完成。请重新打开工程预览" })).toBeVisible();
  expect(requests.filter(request => request.route === "packages/execute").map(request => request.body)).toEqual([
    { workspaceId: "extended-project", planId: "review-2", confirmed: true },
    { workspaceId: "extended-project", planId: "review-3", confirmed: true },
  ]);
  expect(requests.every(request => ["check", "packages/plan", "packages/execute"].includes(request.route))).toBe(true);
  expect(errors).toEqual([]);
});

test("failed discovery and cached metadata stay unknown; recovery requires its own explicit action", async ({ page }) => {
  const errors = captureErrors(page);
  let state: "failed" | "cached" | "recovery" | "restored" = "failed";
  const mutations: unknown[] = [];
  await page.route("**/__creator/updates/**", async route => {
    const action = new URL(route.request().url()).pathname.split("/updates/")[1]!;
    if (action === "packages/recover") {
      mutations.push(route.request().postDataJSON()); state = "restored";
      return route.fulfill({ json: { status: "restored", checks: [] } });
    }
    if (action !== "check") throw new Error(`Unexpected mutation: ${action}`);
    if (state === "failed") return route.fulfill({ status: 503, json: { error: "Controlled offline publisher" } });
    return route.fulfill({ json: { ...inspection, packageUpdates: { ...overview, status: state === "cached" ? "cached" : "unavailable", packages: [],
      ...(state === "recovery" ? { recovery: { id: "recover-reviewed", state: "recovery-required" } } : {}) } } });
  });
  await page.goto(origin);
  await expect(page.getByRole("alert")).toContainText("Controlled offline publisher");
  await expect(page.getByText("当前已是最新版本", { exact: true })).toHaveCount(0);
  state = "cached"; await page.getByRole("button", { name: "Host refresh", exact: true }).click();
  await expect(page.getByText("正在显示缓存版本，未能确认最新版本。", { exact: true })).toBeVisible();
  await expect(page.getByText("当前已是最新版本", { exact: true })).toHaveCount(0);
  state = "recovery"; await page.getByRole("button", { name: "Host refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试恢复原依赖", exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
  await page.getByRole("button", { name: "重试恢复原依赖", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "原依赖文件和实际安装版本已恢复" })).toBeVisible();
  expect(mutations).toEqual([{ workspaceId: "extended-project", planId: "recover-reviewed", confirmed: true }]);
  expect(errors).toEqual([]);
});

test("source conflicts keep the comparison until validation succeeds and never execute an npm upgrade", async ({ page }) => {
  const errors = captureErrors(page);
  const requests: { route: string; body: unknown }[] = [];
  let valid = false, complete = false;
  await page.route("**/__creator/updates/**", async route => {
    const action = new URL(route.request().url()).pathname.split("/updates/")[1]!;
    requests.push({ route: action, body: route.request().postDataJSON() });
    if (action === "check") return route.fulfill({ json: { ...inspection, packageUpdates: { ...overview, packages: [] }, plugins: [{ pluginId: "composer", name: "Composer", delivery: "source-owned", currentVersion: "0.0.1", targetVersion: "0.0.2", status: "customized", updateAvailable: !complete, changelog: [] }] } });
    if (action === "plan") return route.fulfill({ json: { id: "source-reviewed", kind: "owned-source", compatibility: "compatible", requiresMerge: true, blocked: false, fileCount: 1, issues: [], items: [], requestedPlugins: ["composer"] } });
    if (action === "merge") return route.fulfill({ json: { files: [{ path: "plugins/composer/source/adapters/composer.tsx", base: "baseCode", local: "customCode", target: "targetCode" }] } });
    if (action === "adopt") {
      if (!valid) { valid = true; return route.fulfill({ status: 409, json: { error: "PLUGIN_SOURCE_MERGE_UNRESOLVED" } }); }
      complete = true; return route.fulfill({ json: {} });
    }
    throw new Error(`Unexpected update route: ${action}`);
  });
  await page.goto(origin);
  await page.getByRole("button", { name: "更新此插件", exact: true }).click();
  const plan = page.getByRole("region", { name: "更新方案", exact: true });
  await expect(plan).toBeFocused();
  await expect(plan).toContainText("不会直接覆盖");
  await plan.getByRole("button", { name: "自行合并", exact: true }).click();
  const comparison = page.locator(".creator-source-diff");
  await expect(comparison).not.toHaveAttribute("open", "");
  expect(requests.filter(request => request.route === "adopt")).toEqual([]);
  await plan.getByRole("button", { name: "验证并完成同步", exact: true }).click();
  await expect(page.getByText("尚有源码冲突未合并", { exact: false })).toBeVisible();
  await expect(comparison).toHaveCount(1);
  await plan.getByRole("button", { name: "验证并完成同步", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "工程检查通过" })).toBeVisible();
  await expect(comparison).toHaveCount(0);
  expect(requests.filter(request => request.route === "adopt").map(request => request.body)).toEqual([
    { workspaceId: "extended-project", planId: "source-reviewed", confirmed: true },
    { workspaceId: "extended-project", planId: "source-reviewed", confirmed: true },
  ]);
  expect(requests.every(request => ["check", "plan", "merge", "adopt"].includes(request.route))).toBe(true);
  expect(errors).toEqual([]);
});
