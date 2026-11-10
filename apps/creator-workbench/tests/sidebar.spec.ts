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
  await writeFile(path.join(fixture, "style.css"), '@import "tailwindcss"; @import "@za38.03/agent-ui-plugins/styles.css"; html,body,#root { height:100%; margin:0; } .shell { height:500px; width:900px; }');
  await writeFile(path.join(fixture, "fixture.tsx"), `
    import { createRoot } from "react-dom/client";
    import { AgentUIRoot, AgentUISidebarFrame, AgentUILocaleProvider, useAgentUISidebarNavigation } from "@za38.03/agent-ui-plugins";
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
  await writeFile(path.join(fixture, "identity.html"), '<div id="root"></div><script type="module" src="/identity.tsx"></script>');
  // Match template consumers: scoped base CSS, without a global Tailwind reset.
  await writeFile(path.join(fixture, "identity.css"), '@import "@za38.03/agent-ui-plugins/styles-base.css"; html,body,#root { height:100%; margin:0; } .identity-shell { height:500px; width:900px; }');
  await writeFile(path.join(fixture, "identity.tsx"), `
    import { createRoot } from "react-dom/client";
    import { AgentUIRoot, AgentUILocaleProvider } from "@za38.03/agent-ui-plugins";
    import { AgentIdentityPlugin } from "@za38.03/agent-ui-plugins/agent-identity";
    import { LayoutRenderer } from "@za38.03/agent-ui-renderer";
    import "./identity.css";
    const params = new URLSearchParams(location.search);
    const root = { id:"root", type:"row", gap:0, sizes:["280px", "minmax(0, 1fr)"],
      responsive:{type:"drawer",primaryIndex:1,drawerIndex:0,minPrimaryWidth:320}, children:[
        {id:"side",type:"panel",child:{id:"column",type:"column",gap:0,sizes:["52px","minmax(0, 1fr)"],children:[
          {id:"title",type:"slot",slotId:"title"},{id:"list",type:"slot",slotId:"list"}]}},
        {id:"main",type:"slot",slotId:"main"}
      ]};
    createRoot(document.getElementById("root")).render(<AgentUILocaleProvider locale="en-US"><div className="identity-shell"><AgentUIRoot theme={params.get("theme") || "violet"}><main className="agent-ui-platform-shell">
      <LayoutRenderer root={root} drawerLabels={{open:"Open",close:"Close",collapse:"Collapse",restore:"Restore"}}
        renderSlot={slot => slot.slotId === "title" ? <AgentIdentityPlugin name={params.get("name") || undefined} /> : <div>{slot.slotId}</div>} />
    </main></AgentUIRoot></div></AgentUILocaleProvider>);
  `);
  server = await createServer({ configFile: false, root: fixture, plugins: [react(), tailwindcss()], resolve: { dedupe: ["react", "react-dom"], alias: {
    "@za38.03/agent-ui-plugins/styles-base.css": path.resolve("../../packages/plugins/dist/styles-base.css"),
    "@za38.03/agent-ui-plugins/styles.css": path.resolve("../../packages/plugins/dist/styles.css"),
    "@za38.03/agent-ui-plugins/agent-identity": path.resolve("../../packages/plugins/dist/agent-identity/index.js"),
    "@za38.03/agent-ui-plugins/contracts": path.resolve("../../packages/plugins/dist/contracts.js"),
    "@za38.03/agent-ui-plugins": path.resolve("../../packages/plugins/dist/index.js"),
    "@za38.03/agent-ui-renderer": path.resolve("../../packages/renderer/dist/index.js"),
  } }, server: { host: "127.0.0.1", port: 0 } });
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

for (const theme of ['violet', 'light', 'dark']) {
  test(`${theme} platform title fits its track, aligns with collapse and retains a themed background`, async ({ page }) => {
    await page.goto(url + "identity.html?theme=" + theme);
    const title = page.locator('.agent-identity-plugin');
    const track = page.locator('[data-slot-id="title"]');
    const toggle = page.getByRole('button', { name: 'Collapse', exact: true });
    await expect(title).toBeVisible();
    const titleBox = (await title.boundingBox())!;
    const trackBox = (await track.boundingBox())!;
    const logoBox = (await page.locator('.agent-identity-logo').boundingBox())!;
    const toggleBox = (await toggle.boundingBox())!;
    expect(titleBox.height).toBe(52);
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(trackBox.y + trackBox.height);
    expect(Math.abs(logoBox.y + logoBox.height / 2 - toggleBox.y - toggleBox.height / 2)).toBeLessThan(1);
    const background = await title.evaluate(element => getComputedStyle(element).backgroundColor);
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
    expect(background).not.toBe('rgb(255, 255, 255)');
    await toggle.click();
    await expect(title).not.toBeVisible();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(title).toBeVisible();
  });
}

test("long platform title leaves space for the collapse button", async ({ page }) => {
  await page.goto(url + "identity.html?name=" + encodeURIComponent('A very long assistant name that must leave the collapse control clear'));
  const name = page.locator('.agent-identity-name');
  const toggle = page.getByRole('button', { name: 'Collapse', exact: true });
  await expect(name).toBeVisible();
  const nameBox = (await name.boundingBox())!;
  const toggleBox = (await toggle.boundingBox())!;
  expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(toggleBox.x);
  expect(await name.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
});
