import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composableThreadPath = path.join(packageRoot, "src/internal/composable-thread.tsx");
const publicFacadePath = path.join(packageRoot, "src/public.tsx");
const upstreamRoot = path.join(packageRoot, "src/internal/vendor/assistant-ui");
const upstreamThreadPath = path.join(
  upstreamRoot,
  "components/assistant-ui/elements/thread.aui.tsx",
);
const upstreamAttachmentPath = path.join(
  upstreamRoot,
  "components/assistant-ui/elements/attachment.aui.tsx",
);

function section(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, startMarker).toBeGreaterThanOrEqual(0);
  expect(end, endMarker).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("assistant-ui canonical presentation contract", () => {
  it("keeps facade and internal Dictation tooltip/aria pairs distinct", async () => {
    const [facade, composable, upstream] = await Promise.all([
      readFile(publicFacadePath, "utf8"),
      readFile(composableThreadPath, "utf8"),
      readFile(upstreamThreadPath, "utf8"),
    ]);

    const dictateFacade = section(
      facade,
      "export function ConversationComposerDictate",
      "export interface ConversationComposerStopDictationProps",
    );
    expect(dictateFacade).toContain('tooltip={tooltip ?? label ?? "Voice input"}');
    expect(dictateFacade).toContain(
      'ariaLabel={ariaLabel ?? label ?? "Start voice input"}',
    );

    const stopFacade = section(
      facade,
      "export function ConversationComposerStopDictation",
      "export function ConversationComposerSend",
    );
    expect(stopFacade).toContain('tooltip={tooltip ?? label ?? "Stop dictation"}');
    expect(stopFacade).toContain(
      'ariaLabel={ariaLabel ?? label ?? "Stop voice input"}',
    );

    const dictateAction = section(
      composable,
      "export const ComposerDictateAction",
      "interface ComposerStopDictationActionProps",
    );
    expect(dictateAction).toContain("tooltip={tooltip}");
    expect(dictateAction).toContain("aria-label={ariaLabel}");
    expect(dictateAction).not.toContain("tooltip={label}");
    expect(dictateAction).not.toContain("aria-label={label}");

    const stopAction = section(
      composable,
      "export const ComposerStopDictationAction",
      "export const ComposerSendAction",
    );
    expect(stopAction).toContain("tooltip={tooltip}");
    expect(stopAction).toContain("aria-label={ariaLabel}");
    expect(stopAction).not.toContain("tooltip={label}");
    expect(stopAction).not.toContain("aria-label={label}");

    expect(upstream).toContain('tooltip="Voice input"');
    expect(upstream).toContain('aria-label="Start voice input"');
    expect(upstream).toContain('tooltip="Stop dictation"');
    expect(upstream).toContain('aria-label="Stop voice input"');
  });

  it("keeps canonical composer and action semantics aligned", async () => {
    const [facade, composable, upstream, attachment] = await Promise.all([
      readFile(publicFacadePath, "utf8"),
      readFile(composableThreadPath, "utf8"),
      readFile(upstreamThreadPath, "utf8"),
      readFile(upstreamAttachmentPath, "utf8"),
    ]);

    expect(facade).toContain('placeholder = "Send a message..."');
    expect(facade).toContain('inputAriaLabel = "Message input"');
    expect(facade).toContain('label = "Send message"');
    expect(facade).toContain('label = "Stop generating"');
    expect(facade).toContain('nextLabel = "Next"');
    expect(facade).toContain('previousLabel = "Previous"');

    const cancelAction = section(
      composable,
      "export const ComposerCancelAction",
      "const MessageError",
    );
    expect(cancelAction).toContain("aria-label={label}");
    expect(cancelAction).not.toContain("title={label}");

    const copyAction = section(
      facade,
      "export function ConversationCanonicalCopyAction",
      "export function ConversationCanonicalReloadAction",
    );
    expect(copyAction).toContain('data-slot="assistant-ui-copy-action-copied"');
    expect(copyAction).not.toContain('aria-label="Copied"');

    const reloadAction = section(
      facade,
      "export function ConversationCanonicalReloadAction",
      "export function ConversationCanonicalExportMarkdownAction",
    );
    expect(reloadAction).toContain('tooltip="Refresh"');
    expect(reloadAction).not.toContain('type="button"');

    expect(composable).toContain(
      'ComposerAddAttachment as UpstreamComposerAddAttachment',
    );
    expect(composable).toContain(
      'return <UpstreamComposerAddAttachment />;',
    );
    expect(attachment).toContain('tooltip="Add Attachment"');
    expect(attachment).toContain('aria-label="Add Attachment"');

    expect(upstream).toContain('placeholder="Send a message..."');
    expect(upstream).toContain('aria-label="Message input"');
    expect(upstream).toContain('tooltip="Send message"');
    expect(upstream).toContain('aria-label="Send message"');
    expect(upstream).toContain('aria-label="Stop generating"');
  });
});
