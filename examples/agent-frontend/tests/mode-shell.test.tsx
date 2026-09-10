import { readFile } from "node:fs/promises";

import { useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentUIMode } from "../framework/contracts/agent-ui-mode";
import { ModeShell } from "../runtime/mode-shell";

describe("ModeShell", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it.each([
    ["assistant", "section", "agent-ui-assistant-shell"],
    ["embedded", "section", "agent-ui-embedded-shell"],
    ["platform", "main", "agent-ui-platform-shell"],
  ] satisfies ReadonlyArray<readonly [AgentUIMode, string, string]>)(
    "routes %s through its dedicated shell",
    async (mode, element, className) => {
      let renderer: ReactTestRenderer | undefined;
      await act(async () => {
        renderer = create(
          <ModeShell mode={mode}>
            <div data-test-surface />
          </ModeShell>,
        );
      });

      const shell = renderer!.root.findByProps({
        "data-agent-ui-mode": mode,
      });
      expect(shell.type).toBe(element);
      expect(shell.props.className).toBe(className);
      expect(renderer!.root.findByProps({ "data-test-surface": true }))
        .toBeDefined();

      await act(async () => renderer!.unmount());
    },
  );

  it("keeps Embedded sizing scoped to its host container", async () => {
    const modeShellCss = await readFile(
      new URL("../runtime/mode-shell/mode-shell.css", import.meta.url),
      "utf8",
    );
    const embeddedShellRule = modeShellCss.match(
      /\.agent-ui-embedded-shell\s*\{(?<declarations>[^}]*)\}/u,
    )?.groups?.declarations;
    const embeddedPreviewRule = modeShellCss.match(
      /\.agent-ui-embedded-shell\s*>\s*\.development-preview\s*\{(?<declarations>[^}]*)\}/u,
    )?.groups?.declarations;

    expect(embeddedShellRule).toMatch(/width:\s*100%;/u);
    expect(embeddedShellRule).toMatch(/height:\s*100%;/u);
    expect(embeddedPreviewRule).toMatch(/height:\s*100%;/u);
    expect(embeddedPreviewRule).not.toMatch(/height:\s*100dvh;/u);
  });

  it("toggles the Assistant panel without remounting its UI subtree", async () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();

    function StatefulSurface() {
      const [value, setValue] = useState(0);
      useEffect(() => {
        mounted();
        return () => unmounted();
      }, []);

      return (
        <button
          data-test-stateful-surface
          onClick={() => setValue((current) => current + 1)}
          type="button"
        >
          {value}
        </button>
      );
    }

    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <ModeShell mode="assistant">
          <StatefulSurface />
        </ModeShell>,
      );
    });

    const panel = renderer!.root.findByProps({
      className: "agent-ui-assistant-panel",
    });
    const trigger = renderer!.root.findByProps({
      className: "agent-ui-assistant-trigger",
    });
    const surface = renderer!.root.findByProps({
      "data-test-stateful-surface": true,
    });

    expect(panel.props.hidden).toBe(true);
    expect(trigger.props["aria-expanded"]).toBe(false);
    await act(async () => trigger.props.onClick());
    expect(panel.props.hidden).toBe(false);
    expect(trigger.props["aria-expanded"]).toBe(true);

    await act(async () => surface.props.onClick());
    expect(surface.children).toEqual(["1"]);
    await act(async () => trigger.props.onClick());
    expect(panel.props.hidden).toBe(true);
    await act(async () => trigger.props.onClick());
    expect(panel.props.hidden).toBe(false);
    expect(surface.children).toEqual(["1"]);
    expect(mounted).toHaveBeenCalledOnce();
    expect(unmounted).not.toHaveBeenCalled();

    await act(async () => renderer!.unmount());
    expect(unmounted).toHaveBeenCalledOnce();
  });

  it("keeps Mode dependencies out of project-owned Plugin and Slot contracts", async () => {
    const sourceUrls = [
      new URL("../runtime/plugins/UIPluginRuntime.tsx", import.meta.url),
      new URL("../runtime/slots/SlotRegistry.ts", import.meta.url),
      new URL("../framework/contracts/ui-plugin.ts", import.meta.url),
    ];
    const sources = await Promise.all(
      sourceUrls.map((sourceUrl) => readFile(sourceUrl, "utf8")),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/from\s+["'][^"']*(?:agent-ui-mode|mode-shell)/u);
    }
  });
});
