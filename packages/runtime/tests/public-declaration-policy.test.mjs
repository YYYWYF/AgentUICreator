import { describe, expect, it } from "vitest";
import { findPublicDeclarationViolations as policy } from "../scripts/public-declaration-policy.mjs";

describe("public declaration upstream type allowlist", () => {
  it.each([
    'import type { AttachmentAdapter } from "@assistant-ui/react";',
    "import type {\n  AttachmentAdapter,\n} from '@assistant-ui/react';",
    'import type { AttachmentAdapter } from "@assistant-ui/core";',
    "import\ntype\n{\n AttachmentAdapter\n}\nfrom\n'@assistant-ui/react';",
    'import type { DictationAdapter } from "@assistant-ui/react";',
    'import type { AttachmentAdapter, DictationAdapter } from "@assistant-ui/core";',
  ])("allows official adapter types independent of formatting", source => {
    expect(policy(source)).toEqual([]);
  });

  it.each([
    'import type { AssistantRuntime } from "@assistant-ui/react";',
    'import type { AssistantRuntime } from "@assistant-ui/core";',
    'import type { AttachmentAdapter, ThreadMessage } from "@assistant-ui/core";',
    'import type { DictationAdapter, ThreadMessage } from "@assistant-ui/core";',
    'import type { AttachmentAdapter, ThreadMessage } from "@assistant-ui/react";',
    'import type {\n AttachmentAdapter,\n ThreadMessage\n} from "@assistant-ui/react";',
    'import { AttachmentAdapter } from "@assistant-ui/react";',
    'import { DictationAdapter } from "@assistant-ui/react";',
    'import type * as Upstream from "@assistant-ui/react";',
    'import type { AttachmentAdapter as Renamed } from "@assistant-ui/react";',
    'import type { AttachmentAdapter } from "@assistant-ui/react-ag-ui";',
    'import type { AttachmentAdapter } from "@assistant-ui/react/internal";',
    'export type { AttachmentAdapter } from "@assistant-ui/react";',
    'export type Adapter = import("@assistant-ui/react").AttachmentAdapter;',
    'import { useAui, ComposerPrimitive } from "@assistant-ui/react";',
  ])("rejects every other upstream declaration seam", source => {
    expect(policy(source)).toContain("@assistant-ui/");
  });

  it("does not exempt other upstream imports when an allowed import is present", () => {
    expect(policy('import type { AttachmentAdapter } from "@assistant-ui/react";\nimport type { ThreadMessage } from "@assistant-ui/react";'))
      .toContain("@assistant-ui/");
  });
  it.each(["useAui", "ThreadPrimitive", "MessagePrimitive", "ComposerPrimitive", "AssistantRuntime", "AuiConfig"])("keeps %s forbidden even outside imports", name => {
    expect(policy(`import type { AttachmentAdapter } from "@assistant-ui/react";\nexport declare const ${name}: unknown;`)).toContain(name);
  });
});
