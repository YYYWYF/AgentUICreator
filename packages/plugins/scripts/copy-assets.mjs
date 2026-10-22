import { deliveries } from "./plugin-source-recipes.mjs";
import { cp, mkdir, readdir, rm, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(packageRoot, "src");
const distRoot = path.join(packageRoot, "dist");

const publicPresentations = new Set(deliveries.filter(delivery => delivery.publicPresentationTypes).flatMap(delivery => delivery.presentation.map(name => `plugins/${delivery.presentationOwner}/adapters/presentation/${name.replace(/\.tsx?$/u, ".d.ts")}`)));

async function removeInternalDeclarations(root, relativeRoot = "") {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    // Declaration allowlists use logical POSIX paths on every platform.
    const relativePath = path.posix.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      await removeInternalDeclarations(entryPath, relativePath);
      continue;
    }
    const isPublicDeclaration = relativePath.startsWith("catalog/") || publicPresentations.has(relativePath) || relativePath === "index.d.ts" ||
      relativePath === "locale.d.ts" || relativePath.startsWith("locales/") || relativePath === "form-tools.d.ts" || relativePath === "public.d.ts" || relativePath === "lexical.d.ts" || relativePath === "generative-ui.d.ts" || relativePath === "demo-attachments.d.ts" || relativePath === "theme/theme-contract.d.ts";
    if (!isPublicDeclaration &&
      (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.ts.map"))) {
      await rm(entryPath);
    }
  }
}

await mkdir(distRoot, { recursive: true });
// Explicit source-file scans must follow the emitted JS in the publishable tree.
const styles = await readFile(path.join(sourceRoot, "styles.css"), "utf8");
await writeFile(path.join(distRoot, "styles.css"), styles.replace(
  /(@source "\.\/[^"\n]+)\.tsx?(";)/gu, "$1.js$2",
));
await copyFile(
  path.join(sourceRoot, "preflight.scoped.css"),
  path.join(distRoot, "preflight.scoped.css"),
);
await mkdir(
  path.join(distRoot, "internal", "vendor-generated", "assistant-ui"),
  { recursive: true },
);
await cp(
  path.join(sourceRoot, "internal", "vendor-generated", "assistant-ui", "UPSTREAM.md"),
  path.join(distRoot, "internal", "vendor-generated", "assistant-ui", "UPSTREAM.md"),
  { recursive: true },
);
await cp(
  path.join(sourceRoot, "internal", "vendor-generated", "assistant-ui", "UPSTREAM.json"),
  path.join(distRoot, "internal", "vendor-generated", "assistant-ui", "UPSTREAM.json"),
  { recursive: true },
);
await cp(
  path.join(sourceRoot, "internal", "vendor-generated", "assistant-ui", "assistant-ui-upstream.lock.json"),
  path.join(distRoot, "internal", "vendor-generated", "assistant-ui", "assistant-ui-upstream.lock.json"),
  { recursive: true },
);
await mkdir(path.join(distRoot, "internal/adapters-generated/assistant-ui"), { recursive: true });
await copyFile(path.join(sourceRoot, "internal/adapters-generated/assistant-ui/UPSTREAM.json"),
  path.join(distRoot, "internal/adapters-generated/assistant-ui/UPSTREAM.json"));
await copyFile(
  path.join(packageRoot, "THIRD_PARTY_NOTICES.md"),
  path.join(distRoot, "THIRD_PARTY_NOTICES.md"),
);
await cp(path.join(sourceRoot, "theme"), path.join(distRoot, "theme"), { recursive: true, filter: (source) => !source.endsWith(".ts") });
await removeInternalDeclarations(distRoot);

await cp(path.join(sourceRoot, "internal/vendor-generated/assistant-ui/generative-ui"), path.join(distRoot, "internal/vendor-generated/assistant-ui/generative-ui"), { recursive: true, filter: source => !source.endsWith(".tsx") });

await rm(path.join(distRoot, "experimental"), { recursive: true, force: true });

await writeFile(path.join(distRoot, "composer-support.d.ts"), `/// <reference types="node" />
import type { Context, FC, ComponentProps } from "react";
export { useAgentUILocale } from "./locale.js";
export { ComposerPrimitive, QueueItemPrimitive, AuiIf } from "@assistant-ui/react";
export { XIcon } from "lucide-react";
export type ConversationComposerInputProps = ComponentProps<typeof import("@assistant-ui/react").ComposerPrimitive.Input>;
export type ConversationComposerRootProps = ComponentProps<typeof import("@assistant-ui/react").ComposerPrimitive.Root>;
export type ConversationComposerDropzoneProps = ComponentProps<typeof import("@assistant-ui/react").ComposerPrimitive.AttachmentDropzone>;
export const ComposerHostConfigContext: Context<{ autoFocus: boolean }>;
export const ComposerInputHostContext: Context<{ variant: "primary" | "message-edit"; placeholder: string; inputAriaLabel: string; autoFocus: boolean | undefined } | null>;
export function useConversationComposerAwaitingReply(): boolean;
export function useConversationComposerSendGuard(): () => boolean;
export const ComposerAttachments: FC;
export const TooltipIconButton: FC<ComponentProps<"button"> & { tooltip: string }>;
`);

// Opt-in source support declarations reference installed public dependencies only.
await writeFile(path.join(distRoot, "plugin-support.d.ts"), `import type { ComponentProps, FC } from "react";
import type { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
export { useAgentUILocale } from "./locale.js";
export { AuiIf, ActionBarPrimitive } from "@assistant-ui/react";
export { CheckIcon, CopyIcon, RefreshCwIcon, DownloadIcon, ThumbsUpIcon, ThumbsDownIcon } from "lucide-react";
export const TooltipIconButton: FC<import("./public.js").ConversationTooltipIconButtonProps>;
export const ConversationActionMoreMenuItem: typeof import("./public.js").ConversationActionMoreMenuItem;
export function useAssistantResponseRuntime(): import("./public.js").ConversationResponseRuntime;
export function useConversationCommandDecision(toolCallId: string): import("./public.js").ConversationCommandDecisionBinding | undefined;
type DisclosureRoot = Omit<CollapsiblePrimitive.Root.Props, "onOpenChange"> & { onOpenChange?: (open: boolean) => void; variant?: "outline" | "ghost" | "muted" | null };
export const ReasoningRoot: FC<Omit<DisclosureRoot, "onAnimationStart"> & { streaming?: boolean; onAnimationStart?: () => void }>;
export const ReasoningTrigger: FC<CollapsiblePrimitive.Trigger.Props & { active?: boolean; duration?: number }>;
export const ReasoningContent: FC<CollapsiblePrimitive.Panel.Props>;
export const ReasoningText: FC<ComponentProps<"div">>;
export const ToolGroupRoot: FC<DisclosureRoot>;
export const ToolGroupTrigger: FC<CollapsiblePrimitive.Trigger.Props & { count: number; active?: boolean }>;
export const ToolGroupContent: FC<CollapsiblePrimitive.Panel.Props>;
export { ComposerPrimitive, ComposerPrimitive as ComposerActions, useAuiState, ThreadPrimitive as ConversationParts, SuggestionPrimitive as SuggestionActions } from "@assistant-ui/react";
export { ArrowUpIcon, SquareIcon, MicIcon, PlusIcon, HistoryIcon, SquarePenIcon, BotIcon, ChevronsUpDownIcon, LogOutIcon, UserRoundIcon, FileTextIcon, TerminalIcon, SearchIcon, WrenchIcon } from "lucide-react";
export const Button: FC<Omit<import("./public.js").ConversationTooltipIconButtonProps, "tooltip" | "side">>;
export function useConversationComposerSendGuard(): () => boolean;
export const ResponseActionBarRoot: typeof import("./public.js").ConversationResponseActionBarRoot;
export const ResponseBranchPicker: typeof import("./public.js").ConversationResponseBranchPicker;
export const ToolTimeline: FC<{ steps: readonly {id?: string;verb: string;chip: string;icon: import("lucide-react").LucideIcon}[]; visibleSteps: number; streaming: boolean; open: boolean; onOpenChange: (open:boolean)=>void; restingLabel:string;activeLabel:string;stats:{file:string;added?:number;removed?:number}[];className?:string }>;
export const ThinkingIndicator: FC<Omit<ComponentProps<"div">,"children"> & {label:string;elapsed?:string}>;
export const Collapsible: FC<CollapsiblePrimitive.Root.Props>;
export const CollapsibleTrigger: FC<CollapsiblePrimitive.Trigger.Props>;
export const CollapsibleContent: FC<CollapsiblePrimitive.Panel.Props>;
export interface TimelinePart {readonly type:string;readonly toolCallId?:string;readonly toolName?:string;readonly text?:string;readonly status?:{readonly type:string;readonly reason?:string};readonly messages?:unknown;readonly approval?:unknown;readonly interrupt?:unknown;readonly mcp?:unknown;readonly isError?:boolean|undefined;}
export interface TimelineCall {readonly toolCallId:string;readonly toolName:string;readonly index:number;readonly status:string;readonly reason?:string|undefined;readonly summarized:boolean;readonly protected:boolean;}
export function hasPendingToolAction(part: TimelinePart): boolean;
export function projectToolTimeline(parts: readonly TimelinePart[],namedTools?:Readonly<Record<string, readonly unknown[]|undefined>>):{anchorId:string|undefined;streaming:boolean;calls:TimelineCall[];summarized:TimelineCall[];detailIndices:number[]};
export function timelineToolKind(name:string):"read"|"command"|"search"|"tool";
export { formatPresentationMessage } from "./locale.js";

export { DEFAULT_AGENT_UI_MESSAGES, type AgentUILocaleMessages } from "./locale.js";
export { toolApprovalAcceptsText, useScrollLock, useToolCallElapsed, type ToolApprovalAnswer, type ToolApprovalOption, type ToolApprovalQuestion, type ToolCallMessagePart, type ToolCallMessagePartProps, type ToolCallMessagePartStatus, type ToolCallMessagePartComponent } from "@assistant-ui/react";
export const cn: typeof import("clsx").clsx;
export const FallbackDisclosure: typeof import("@base-ui/react/collapsible").Collapsible.Root;
export const FallbackDisclosureContent: typeof import("@base-ui/react/collapsible").Collapsible.Panel;
export const FallbackDisclosureTrigger: typeof import("@base-ui/react/collapsible").Collapsible.Trigger;
export const Textarea: FC<ComponentProps<"textarea">>;
export function useTransientMessages(): readonly import("./public.js").TransientMessage[];
export function resolveTransientMessageAnchor(message: import("./public.js").TransientMessage, messageIds: readonly string[]): string | null;
export { AlertCircleIcon, ChevronDownIcon, CircleMinusIcon, LoaderIcon, XCircleIcon } from "lucide-react";
`);
