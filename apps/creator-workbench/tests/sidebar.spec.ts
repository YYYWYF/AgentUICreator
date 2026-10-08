import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let fixture: string;
let url: string;
test.beforeAll(async () => {
  fixture = await mkdtemp(path.resolve(".sidebar-e2e-"));
  await writeFile(path.join(fixture, "index.html"), '<div id="root"></div><script type="module" src="/fixture.tsx"></script>');
  await writeFile(path.join(fixture, "style.css"), '@import "tailwindcss"; @import "@agent-ui/react/styles.css"; html,body,#root { height:100%; margin:0; } .shell { height:500px; width:900px; }');
  await writeFile(path.join(fixture, "fixture.tsx"), `
    import { createRoot } from "react-dom/client";
    import { AgentUIRoot, AgentUISidebarFrame, AgentUILocaleProvider, useAgentUISidebarNavigation } from "@agent-ui/react";
    import "./style.css";
    function Navigate() { const navigate = useAgentUISidebarNavigation(); return <button onClick={navigate}>Navigate files</button>; }
    const params = new URLSearchParams(location.search);
    createRoot(document.getElementById("root")).render(<AgentUILocaleProvider locale="en-US"><div className="shell" style={{width: Number(params.get("width") || 900)}}><AgentUIRoot theme={params.get("theme") || "light"}>
      <AgentUISidebarFrame defaultActive={params.get("active")} items={[
        {id:"history",icon:"messages-square",label:"History",content:<button>History content</button>},
        {id:"files",icon:"folder",label:"Files",content:<Navigate/>}
      ]}><button>Main content</button></AgentUISidebarFrame>
    </AgentUIRoot></div></AgentUILocaleProvider>);
  `);
  server = await createServer({ configFile: false, root: fixture, plugins: [react(), tailwindcss()], server: { host: "127.0.0.1", port: 0 } });
  await server.listen(); url = server.resolvedUrls!.local[0]!;
});
test.afterAll(async () => { await server?.close(); if (fixture) await rm(fixture, { recursive: true, force: true }); });

test("desktop rail, expansion, switch and collapse", async ({ page }) => {
  await page.goto(url);
  const frame = page.locator("[data-sidebar-active]");
  await expect(frame).toHaveAttribute("data-sidebar-active", "");
  await expect(page.locator(".agent-ui-sidebar-container")).toHaveCSS("width", "48px");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(frame).toHaveAttribute("data-sidebar-active", "history");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(frame).toHaveAttribute("data-sidebar-active", "");
  await expect(page.getByRole("button", { name: "History content", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(frame).toHaveAttribute("data-sidebar-active", "history");
  await expect(page.locator(".agent-ui-sidebar-container")).toHaveCSS("width", "280px");
  await expect(page.locator(".agent-ui-sidebar-panel")).toHaveCSS("width", "232px");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await expect(page.getByRole("button", { name: "History content", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Navigate files", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await expect(frame).toHaveAttribute("data-sidebar-active", "");
});

test("narrow container traps focus, restores it after Escape and closes on navigation", async ({ page }) => {
  await page.goto(url + "?width=416");
  const trigger = page.getByRole("button", { name: "Files", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("position", "absolute");
  await expect(page.locator(".agent-ui-sidebar-portal").getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate(element => element.contains(element.ownerDocument.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("button", { name: "Navigate files" }).click();
  await expect(dialog).toHaveCount(0);
});
