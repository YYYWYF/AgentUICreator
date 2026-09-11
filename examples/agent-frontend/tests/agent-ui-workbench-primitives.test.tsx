// @vitest-environment jsdom

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, createRef, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "../agent-ui/primitives/avatar";
import { Badge } from "../agent-ui/primitives/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../agent-ui/primitives/collapsible";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../agent-ui/primitives/dropdown-menu";
import { ScrollArea, ScrollBar } from "../agent-ui/primitives/scroll-area";
import { Skeleton } from "../agent-ui/primitives/skeleton";
import { Switch } from "../agent-ui/primitives/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../agent-ui/primitives/tabs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryRoot = path.resolve(projectRoot, "../../packages/source-registry/registry");
const mountedRoots: Root[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

async function render(children: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(<AgentUIRoot>{children}</AgentUIRoot>);
  });
  return container;
}

async function collectFiles(directory: string, extensionPattern: RegExp): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath, extensionPattern);
    return entry.isFile() && extensionPattern.test(entry.name) ? [entryPath] : [];
  }));
  return files.flat().sort();
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("Agent UI workbench primitives", () => {
  it("preserves Tabs selection, keyboard navigation, disabled state, and panels", async () => {
    const container = await render(
      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="disabled" disabled>Disabled</TabsTrigger>
        </TabsList>
        <TabsContent value="chat">Chat panel</TabsContent>
        <TabsContent value="files">Files panel</TabsContent>
        <TabsContent value="disabled">Disabled panel</TabsContent>
      </Tabs>,
    );
    const triggers = [...container.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]')];
    expect(triggers[0]?.hasAttribute("data-active")).toBe(true);
    expect(container.textContent).toContain("Chat panel");
    expect(container.textContent).not.toContain("Files panel");

    await act(async () => triggers[1]?.click());
    expect(triggers[1]?.hasAttribute("data-active")).toBe(true);
    expect(container.textContent).toContain("Files panel");

    await act(async () => {
      triggers[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(document.activeElement).toBe(triggers[0]);
    await act(async () => {
      triggers[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(document.activeElement).toBe(triggers[1]);

    await act(async () => triggers[2]?.click());
    expect(triggers[2]?.hasAttribute("data-disabled")).toBe(true);
    expect(triggers[1]?.hasAttribute("data-active")).toBe(true);
  });

  it("preserves controlled Tabs state", async () => {
    function ControlledTabs() {
      const [value, setValue] = useState("chat");
      return (
        <Tabs value={value} onValueChange={setValue}>
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
          </TabsList>
          <TabsContent value="chat">Chat panel</TabsContent>
          <TabsContent value="tools">Tools panel</TabsContent>
        </Tabs>
      );
    }
    const container = await render(<ControlledTabs />);
    const tools = [...container.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]')][1];
    await act(async () => tools?.click());
    expect(tools?.hasAttribute("data-active")).toBe(true);
    expect(container.textContent).toContain("Tools panel");
  });

  it("keeps Dropdown Menu keyboard selection and dismissal inside the Agent UI portal", async () => {
    const onSelect = vi.fn();
    const container = await render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={onSelect}>Rename</DropdownMenuItem>
          <DropdownMenuItem onClick={onSelect}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem onClick={onSelect} disabled>Unavailable</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = container.querySelector('[data-slot="dropdown-menu-trigger"]') as HTMLElement;
    trigger.focus();
    await act(async () => trigger.click());
    const portalHost = container.querySelector("[data-agent-ui-portal-host]") as HTMLElement;
    const popup = portalHost.querySelector('[data-slot="dropdown-menu-content"]') as HTMLElement;
    expect(popup).toBeInstanceOf(HTMLElement);
    expect(popup.closest("[data-agent-ui-portal-host]")).toBe(portalHost);

    const menuItems = [...popup.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]')];
    menuItems[0]?.focus();
    await act(async () => {
      menuItems[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(portalHost.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => trigger.click());
    const reopened = portalHost.querySelector('[data-slot="dropdown-menu-content"]') as HTMLElement;
    const disabledItem = reopened.querySelector('[data-disabled]') as HTMLElement;
    await act(async () => disabledItem.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    await act(async () => {
      reopened.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(portalHost.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves Dropdown Menu checkbox, radio, and submenu behavior", async () => {
    const onCheckedChange = vi.fn();
    const onValueChange = vi.fn();
    const container = await render(
      <DropdownMenu>
        <DropdownMenuTrigger>Preferences</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem onCheckedChange={onCheckedChange}>
            Show tools
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup defaultValue="compact" onValueChange={onValueChange}>
            <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Archive</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = container.querySelector('[data-slot="dropdown-menu-trigger"]') as HTMLElement;
    await act(async () => trigger.click());
    const portalHost = container.querySelector("[data-agent-ui-portal-host]") as HTMLElement;
    const checkbox = portalHost.querySelector('[data-slot="dropdown-menu-checkbox-item"]') as HTMLElement;
    await act(async () => checkbox.click());
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
    expect(checkbox.hasAttribute("data-checked")).toBe(true);

    const radio = [...portalHost.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-radio-item"]')][1];
    await act(async () => radio?.click());
    expect(onValueChange).toHaveBeenCalledWith("comfortable", expect.anything());
    expect(radio?.hasAttribute("data-checked")).toBe(true);

    const subTrigger = portalHost.querySelector('[data-slot="dropdown-menu-sub-trigger"]') as HTMLElement;
    subTrigger.focus();
    await act(async () => {
      subTrigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    const subContent = portalHost.querySelector('[data-slot="dropdown-menu-sub-content"]');
    expect(subContent).toBeInstanceOf(HTMLElement);
    expect(subContent?.closest("[data-agent-ui-portal-host]")).toBe(portalHost);
  });

  it("supports uncontrolled, controlled, and disabled Collapsible state", async () => {
    function ControlledCollapsible() {
      const [open, setOpen] = useState(false);
      return (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger>Controlled</CollapsibleTrigger>
          <CollapsibleContent>Controlled content</CollapsibleContent>
        </Collapsible>
      );
    }
    const container = await render(
      <>
        <Collapsible>
          <CollapsibleTrigger>Details</CollapsibleTrigger>
          <CollapsibleContent>Detail content</CollapsibleContent>
        </Collapsible>
        <ControlledCollapsible />
        <Collapsible disabled>
          <CollapsibleTrigger>Disabled</CollapsibleTrigger>
          <CollapsibleContent>Unavailable</CollapsibleContent>
        </Collapsible>
      </>,
    );
    const triggers = [...container.querySelectorAll<HTMLButtonElement>('[data-slot="collapsible-trigger"]')];
    expect(triggers[0]?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => triggers[0]?.click());
    expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Detail content");

    await act(async () => triggers[1]?.click());
    expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Controlled content");

    await act(async () => triggers[2]?.click());
    expect(triggers[2]?.getAttribute("aria-disabled")).toBe("true");
    expect(triggers[2]?.getAttribute("aria-expanded")).toBe("false");
  });

  it("composes Scroll Area structure without taking ownership of layout size", async () => {
    const container = await render(
      <ScrollArea data-testid="area">
        <span>Native child</span>
        <ScrollBar keepMounted />
        <ScrollBar orientation="horizontal" keepMounted />
      </ScrollArea>,
    );
    const area = container.querySelector('[data-slot="scroll-area"]') as HTMLElement;
    expect(area.getAttribute("data-testid")).toBe("area");
    expect(area.style.height).toBe("");
    expect(area.querySelector('[data-slot="scroll-area-viewport"]')).toBeInstanceOf(HTMLElement);
    expect(area.querySelector('[data-slot="scroll-area-content"]')?.textContent).toContain("Native child");
    expect(area.querySelectorAll('[data-slot="scroll-area-scrollbar"]')).toHaveLength(2);
    expect(area.querySelector('[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]'))
      .toBeInstanceOf(HTMLElement);
    expect(area.querySelectorAll('[data-slot="scroll-area-thumb"]')).toHaveLength(2);
    expect(area.querySelector('[data-slot="scroll-area-corner"]')).toBeNull();
  });

  it("preserves Switch interaction, controlled state, keyboard semantics, and form values", async () => {
    function ControlledSwitch() {
      const [checked, setChecked] = useState(false);
      return <Switch checked={checked} onCheckedChange={setChecked} aria-label="Controlled" />;
    }
    const container = await render(
      <form>
        <Switch name="tools" value="enabled" aria-label="Tools" />
        <Switch disabled aria-label="Disabled" />
        <ControlledSwitch />
      </form>,
    );
    const switches = [...container.querySelectorAll<HTMLElement>('[data-slot="switch"]')];
    expect(switches[0]?.hasAttribute("data-unchecked")).toBe(true);
    await act(async () => switches[0]?.click());
    expect(switches[0]?.hasAttribute("data-checked")).toBe(true);
    expect(new FormData(container.querySelector("form") as HTMLFormElement).get("tools"))
      .toBe("enabled");

    switches[2]?.focus();
    await act(async () => {
      switches[2]?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      switches[2]?.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    });
    expect(switches[2]?.hasAttribute("data-checked")).toBe(true);
    await act(async () => switches[1]?.click());
    expect(switches[1]?.hasAttribute("data-disabled")).toBe(true);
    expect(switches[1]?.hasAttribute("data-unchecked")).toBe(true);
  });

  it("forwards Avatar, Badge, and Skeleton structure and native props", async () => {
    const avatarRef = createRef<HTMLSpanElement>();
    const badgeRef = createRef<HTMLSpanElement>();
    const container = await render(
      <>
        <Avatar ref={avatarRef} size="lg" title="Agent">
          <AvatarImage src="/agent.png" alt="Agent" keepMounted />
          <AvatarFallback>AG</AvatarFallback>
          <AvatarBadge />
        </Avatar>
        <Badge ref={badgeRef} variant="success" title="Ready state">Ready</Badge>
        <Skeleton data-testid="loading" />
      </>,
    );
    expect(avatarRef.current?.dataset).toMatchObject({ slot: "avatar", size: "lg" });
    expect(container.querySelector('[data-slot="avatar-image"]')?.getAttribute("alt")).toBe("Agent");
    expect(container.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe("AG");
    expect(container.querySelector('[data-slot="avatar-badge"]')).toBeInstanceOf(HTMLElement);
    expect(badgeRef.current?.dataset).toMatchObject({ slot: "badge", variant: "success" });
    expect(badgeRef.current?.getAttribute("title")).toBe("Ready state");
    expect(container.querySelector('[data-slot="skeleton"]')?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Agent UI P1B source gates", () => {
  it("keeps production primitive imports limited to React, Base UI, and local modules", async () => {
    const sourcePaths = await collectFiles(path.join(registryRoot, "items"), /\.tsx?$/u);
    for (const sourcePath of sourcePaths) {
      const source = await readFile(sourcePath, "utf8");
      const specifiers = [
        ...source.matchAll(/\bfrom\s+["']([^"']+)["']/gu),
        ...source.matchAll(/\bimport\s+["']([^"']+)["']/gu),
        ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu),
      ].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(specifier, sourcePath).toMatch(/^(?:react|@base-ui\/react(?:\/.*)?|\.{1,2}\/)/u);
      }
    }
  });

  it("keeps the Gallery entry and its source graph free of Ant Design imports", async () => {
    const main = await readFile(path.join(projectRoot, "src/main.tsx"), "utf8");
    expect(main).not.toMatch(/^import\s+.*["']\.\/App["']/mu);
    expect(main).not.toMatch(/^import\s+["']antd\/dist\/reset\.css["']/mu);
    expect(main).toContain('await import("antd/dist/reset.css")');

    const gallerySources = [
      path.join(projectRoot, "src/dev/AgentUIPrimitiveGallery.tsx"),
      ...await collectFiles(path.join(projectRoot, "agent-ui"), /\.tsx?$/u),
    ];
    for (const sourcePath of gallerySources) {
      const source = await readFile(sourcePath, "utf8");
      expect(source, sourcePath).not.toMatch(
        /["'](?:antd|antd\/dist\/reset\.css|@ant-design\/x|@ant-design\/icons)["']/u,
      );
    }
  });

  it("keeps Skeleton motion optional and primitive colors tokenized", async () => {
    const skeletonCss = await readFile(
      path.join(registryRoot, "items/primitive-skeleton/files/primitives/skeleton.module.css"),
      "utf8",
    );
    expect(skeletonCss).toContain("prefers-reduced-motion: reduce");
    expect(skeletonCss).toContain("animation: none");

    const cssPaths = await collectFiles(path.join(registryRoot, "items"), /\.css$/u);
    const tokenPath = path.join(registryRoot, "items/foundation-core/files/styles/tokens.css");
    for (const cssPath of cssPaths.filter((entry) => entry !== tokenPath)) {
      expect(await readFile(cssPath, "utf8"), cssPath).not.toMatch(
        /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)\s*\(/iu,
      );
    }
  });
});
