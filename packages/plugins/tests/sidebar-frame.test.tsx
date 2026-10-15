import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUISidebarFrame, useAgentUISidebarNavigation, type AgentUISidebarItem } from "../src/internal/sidebar-frame";
import { AgentUIRoot } from "../src/internal/style-boundary/AgentUIRoot";

const hosts: HTMLDivElement[] = [];
afterEach(() => { hosts.forEach(host => host.remove()); hosts.length = 0; vi.restoreAllMocks(); });
function Navigate() { const navigate = useAgentUISidebarNavigation(); return <button onClick={navigate}>Navigate</button>; }
const items = [
  { id: "history", icon: "messages-square" as const, label: "History", content: <button>History content</button> },
  { id: "files", icon: "folder" as const, label: "Files", content: <Navigate /> },
];
async function mount(width: number, defaultActive: string | null = null) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width, height: 500, left: 0, right: width, top: 0, bottom: 500, x: 0, y: 0, toJSON() {} }));
  const host = document.createElement("div"); document.body.append(host); hosts.push(host); const root = createRoot(host);
  const render = (list = items, initial = defaultActive) => <AgentUIRoot theme="light"><AgentUISidebarFrame items={list} defaultActive={initial}><button>Main</button></AgentUISidebarFrame></AgentUIRoot>;
  await act(async () => root.render(render()));
  return { root, host, render };
}
async function click(host: HTMLElement, label: string) {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(element => element.getAttribute("aria-label") === label || element.textContent === label);
  expect(button).toBeDefined(); await act(async () => button!.click());
}
it("toggles, switches and unmounts inactive panels without changing initialization", async () => {
  const { root, host, render } = await mount(900);
  try {
    expect(host.querySelector("[data-sidebar-active]")?.getAttribute("data-sidebar-active")).toBe("");
    await click(host, "History"); expect(host.textContent).toContain("History content");
    await click(host, "Files"); expect(host.textContent).not.toContain("History content"); expect(host.textContent).toContain("Navigate");
    await click(host, "Navigate"); expect(host.textContent).toContain("Navigate");
    await act(async () => root.render(render(items, "history"))); expect(host.textContent).toContain("Navigate");
    await click(host, "Files"); expect(host.textContent).not.toContain("Navigate");
    await click(host, "History"); await act(async () => root.render(render(items.filter(item => item.id !== "history"))));
    expect(host.querySelector("[data-sidebar-active]")?.getAttribute("data-sidebar-active")).toBe("");
  } finally { await act(async () => root.unmount()); }
});
it("uses container width, keeps Sheet local, and closes on explicit navigation", async () => {
  const { root, host } = await mount(416);
  try {
    await click(host, "Files");
    expect(host.querySelector("[data-sidebar-mode]")?.getAttribute("data-sidebar-mode")).toBe("drawer");
    expect(host.querySelector('[data-slot="sheet-content"]')?.closest(".agent-ui-sidebar-portal")).not.toBeNull();
    expect(host.querySelector<HTMLElement>('[data-slot="sheet-content"]')?.style.position).toBe("absolute");
    await click(host, "Navigate"); expect(host.querySelector("[data-sidebar-active]")?.getAttribute("data-sidebar-active")).toBe("");
  } finally { await act(async () => root.unmount()); }
});
it("isolates active state between multiple Agent instances and never writes cookies", async () => {
  const { root, host } = await mount(900);
  const cookieBefore = document.cookie;
  try {
    await act(async () => root.render(<><AgentUIRoot key="first" theme="light"><AgentUISidebarFrame items={items} defaultActive="history">Main</AgentUISidebarFrame></AgentUIRoot><AgentUIRoot key="second" theme="dark"><AgentUISidebarFrame items={items} defaultActive={null}>Main</AgentUISidebarFrame></AgentUIRoot></>));
    const frames = host.querySelectorAll<HTMLElement>("[data-sidebar-active]");
    await click(frames[1]!, "Files");
    expect(frames[0]!.getAttribute("data-sidebar-active")).toBe("history"); expect(frames[1]!.getAttribute("data-sidebar-active")).toBe("files");
    expect(document.cookie).toBe(cookieBefore);
  } finally { await act(async () => root.unmount()); }
});

it("uses the controlled upstream trigger and plugin shortcuts without a second open state", async () => {
  const { root, host, render } = await mount(900);
  const shortcutItems = [{ ...items[0]!, railAction: <Navigate /> }, items[1]!];
  try {
    await act(async () => root.render(render(shortcutItems)));
    expect(host.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("collapsed");
    await click(host, "Navigate");
    expect(host.querySelector("[data-sidebar-active]")?.getAttribute("data-sidebar-active")).toBe("");
    const trigger = host.querySelector<HTMLButtonElement>('[data-slot="sidebar-trigger"]')!;
    await act(async () => trigger.click());
    expect(host.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("expanded");
    expect(host.querySelector("[data-sidebar-active]")?.getAttribute("data-sidebar-active")).toBe("history");
    expect(host.textContent).not.toContain("Navigate");
    expect(host.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')?.style.getPropertyValue("--sidebar-width")).toBe("280px");
    expect(host.querySelector(".agent-ui-sidebar-panel-track")).toBeNull();
    await act(async () => trigger.click());
    expect(host.textContent).toContain("Navigate");
  } finally { await act(async () => root.unmount()); }
});

it("uses a single column with Header and retains multiple-item navigation", async () => {
  const { root, host } = await mount(900);
  const list = [{ ...items[0]!, railAction: <Navigate /> }];
  try {
    const view = (navigation: readonly AgentUISidebarItem[] = list) => <AgentUIRoot theme="light"><AgentUISidebarFrame key="header" header={<span>Agent identity</span>} items={navigation} defaultActive="history">Main</AgentUISidebarFrame></AgentUIRoot>;
    await act(async () => root.render(view()));
    expect(host.querySelector('[data-sidebar-presentation="single"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="History"]')).toBeNull();
    expect(host.querySelector(".agent-ui-sidebar-panel-header")).toBeNull();
    expect(host.textContent).toContain("Agent identity");
    expect(host.textContent).toContain("History content");
    expect(host.textContent).not.toContain("Navigate");
    const trigger = host.querySelector<HTMLButtonElement>('[data-slot="sidebar-trigger"]')!;
    await act(async () => trigger.click());
    expect(host.textContent).toContain("Navigate");
    expect(host.textContent).not.toContain("History content");
    await act(async () => root.render(view(items)));
    expect(host.querySelector('[data-sidebar-presentation="multiple"]')).not.toBeNull();
    await click(host, "Files");
    expect(host.querySelector("[data-sidebar-active]")?.getAttribute("data-sidebar-active")).toBe("files");
  } finally { await act(async () => root.unmount()); }
});

it.each([900, 416])("renders one Footer at %s px and removes it without empty chrome", async width => {
  const { root, host } = await mount(width);
  const view = (footer?: React.ReactNode) => <AgentUIRoot theme="light"><AgentUISidebarFrame items={items} defaultActive={null} footer={footer}>Main</AgentUISidebarFrame></AgentUIRoot>;
  try {
    await act(async () => root.render(view(<button>Account</button>)));
    expect(host.querySelectorAll(".agent-ui-sidebar-footer")).toHaveLength(1);
    expect(host.querySelector(".agent-ui-sidebar-footer")?.getAttribute("data-collapsed")).toBe("true");
    await click(host, "History");
    expect(host.querySelectorAll(".agent-ui-sidebar-footer")).toHaveLength(1);
    expect(host.querySelector(".agent-ui-sidebar-footer")?.getAttribute("data-collapsed")).toBe("false");
    if (width === 416) expect(host.querySelector(".agent-ui-sidebar-footer")?.closest(".agent-ui-sidebar-portal")).not.toBeNull();
    await act(async () => root.render(view())); expect(host.querySelector(".agent-ui-sidebar-footer")).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
