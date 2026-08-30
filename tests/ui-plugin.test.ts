import type { Message } from "@ag-ui/core";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  parseUIPluginManifest,
  uiPluginManifestSchema,
  type AGUIMessage,
} from "../framework/contracts/ui-plugin";

describe("UIPluginManifest", () => {
  it("validates a manifest", () => {
    const manifest = parseUIPluginManifest({
      id: "file-preview",
      name: "File preview",
      description: "Displays the selected file",
      version: "1.0.0",
      capabilities: ["file-preview"],
      data: { messages: true, state: true },
    });

    expect(manifest.id).toBe("file-preview");
  });

  it("rejects duplicate capabilities", () => {
    const result = uiPluginManifestSchema.safeParse({
      id: "file-preview",
      name: "File preview",
      description: "Displays the selected file",
      version: "1.0.0",
      capabilities: ["file-preview", "file-preview"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["capabilities", 1]);
    }
  });

  it("uses the official AG-UI Message type", () => {
    expectTypeOf<AGUIMessage>().toEqualTypeOf<Message>();
  });
});
