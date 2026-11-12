import { sharedStyleSources } from "./shared-style-sources.mjs";
import { deliveries } from "./plugin-source-recipes.mjs";
import { isPublicPluginDeclaration, sourceRuntimeDeclarations } from "./public-declarations.mjs";
import { cp, mkdir, readdir, rm, copyFile, readFile, writeFile, appendFile } from "node:fs/promises";
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
    const isPublicDeclaration = isPublicPluginDeclaration(relativePath, publicPresentations);
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
// The lean entry retains shared foundations but leaves Plugin utility classes to
// the Plugin entries. The original stylesheet remains the full facade contract.
const sharedSources = new Set(sharedStyleSources);
const leanStyles = styles
  .replace('source("./internal/vendor-generated/assistant-ui")', 'source(none)')
  .replace(/^@source "([^"\n]+)";\n/gmu, (line, source) => sharedSources.has(source) ? line : "")
  .replace('@import "./theme/composer-lexical.css";\n', "");
await writeFile(path.join(distRoot, "styles-base.css"), leanStyles.replace(
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
export { ComposerPrimitive, QueueItemPrimitive, AuiIf, useAuiState, useAuiEvent } from "@assistant-ui/react";
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
export { useAgentUIThemeSnapshot } from "./plugin-api/useAgentUIThemeSnapshot.js";
export { useAgentUILocaleSnapshot } from "./plugin-api/useAgentUILocaleSnapshot.js";
export { useAgentUILocale } from "./locale.js";
export { AuiIf, ActionBarPrimitive } from "@assistant-ui/react";
export { CheckIcon, CopyIcon, RefreshCwIcon, DownloadIcon, ThumbsUpIcon, ThumbsDownIcon } from "lucide-react";
export const TooltipIconButton: FC<import("./public.js").ConversationTooltipIconButtonProps>;
export const ConversationActionMoreMenuItem: typeof import("./public.js").ConversationActionMoreMenuItem;
export const QuestionOptionList: FC<import("./public.js").ConversationOptionListProps & { confirmLabel?: string }>;
export const QuestionFlow: FC<import("./public.js").ConversationQuestionFlowProps & { labels: import("./public.js").ConversationQuestionFlowLabels }>;
export function useAssistantResponseRuntime(): import("./public.js").ConversationResponseRuntime;
export function useConversationCommandDecision(toolCallId: string): import("./public.js").ConversationCommandDecisionBinding | undefined;
type DisclosureRoot = Omit<CollapsiblePrimitive.Root.Props, "onOpenChange"> & { onOpenChange?: (open: boolean) => void; variant?: "outline" | "ghost" | "muted" | null };
export const ReasoningRoot: FC<Omit<DisclosureRoot, "onAnimationStart"> & { streaming?: boolean; onAnimationStart?: () => void }>;
export const ReasoningTrigger: FC<CollapsiblePrimitive.Trigger.Props & { active?: boolean; duration?: number }>;
export const ReasoningContent: FC<CollapsiblePrimitive.Panel.Props>;
export const ReasoningText: FC<ComponentProps<"div">>;
export const Image: FC<{ type: "image"; image: string; filename?: string; status?: { type: "complete" } }>;
export const File: FC<{ type: "file"; data: string; mimeType: string; sourceType?: "url" | "id"; filename?: string; status?: { type: "complete" } }> & { Player: FC<{ data: string; mimeType: string; sourceType?: "url" | "id"; filename?: string; controlsList?: string }> };
export const ToolGroupRoot: FC<DisclosureRoot>;
export const ToolGroupTrigger: FC<CollapsiblePrimitive.Trigger.Props & { count: number; active?: boolean }>;
export const ToolGroupContent: FC<CollapsiblePrimitive.Panel.Props>;
export { ComposerPrimitive, ComposerPrimitive as ComposerActions, useAuiState, ThreadPrimitive as ConversationParts, SuggestionPrimitive as SuggestionActions } from "@assistant-ui/react";
export { ArrowUpIcon, SquareIcon, MicIcon, PlusIcon, HistoryIcon, SquarePenIcon, BotIcon, ChevronsUpDownIcon, LogOutIcon, UserRoundIcon, FileTextIcon, FileSearchIcon, PenLineIcon, TerminalIcon, SearchIcon, WrenchIcon } from "lucide-react";
export const Button: FC<Omit<import("./public.js").ConversationTooltipIconButtonProps, "tooltip" | "side">>;
export function useConversationComposerSendGuard(): () => boolean;
export const ResponseActionBarRoot: typeof import("./public.js").ConversationResponseActionBarRoot;
export const ResponseBranchPicker: typeof import("./public.js").ConversationResponseBranchPicker;
export const ToolTimeline: FC<{ steps: readonly {id?: string;verb: string;chip: string;icon: import("lucide-react").LucideIcon}[]; visibleSteps: number; streaming: boolean; open: boolean; onOpenChange: (open:boolean)=>void; restingLabel:string;activeLabel:string;stats:{file:string;added?:number;removed?:number}[];className?:string }>;
export const ThinkingIndicator: FC<Omit<ComponentProps<"div">,"children"> & {label:string;elapsed?:string}>;
export const Collapsible: FC<CollapsiblePrimitive.Root.Props>;
export const CollapsibleTrigger: FC<CollapsiblePrimitive.Trigger.Props>;
export const CollapsibleContent: FC<CollapsiblePrimitive.Panel.Props>;
export interface TimelinePart {readonly type:string;readonly toolCallId?:string;readonly toolName?:string;readonly text?:string;readonly args?:unknown;readonly result?:unknown;readonly status?:{readonly type:string;readonly reason?:string};readonly messages?:unknown;readonly approval?:unknown;readonly interrupt?:unknown;readonly mcp?:unknown;readonly isError?:boolean|undefined;}
export interface TimelineCall {readonly toolCallId:string;readonly toolName:string;readonly index:number;readonly status:string;readonly reason?:string|undefined;readonly summarized:boolean;readonly protected:boolean;readonly target:string;}
export function hasPendingToolAction(part: TimelinePart): boolean;
export function projectToolTimeline(parts: readonly TimelinePart[],namedTools?:Readonly<Record<string, readonly unknown[]|undefined>>):{anchorId:string|undefined;streaming:boolean;calls:TimelineCall[];summarized:TimelineCall[];stats:{file:string;added?:number;removed?:number}[];detailIndices:number[]};
export function timelineToolKind(name:string):"read"|"command"|"search"|"edit"|"tool";
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

// Keep the added runtime seams' declarations tied to the actual source exports.
// Their emitted declarations expose only existing npm state/command interfaces.
const supportSource = await readFile(path.join(sourceRoot, "plugin-support.ts"), "utf8");
await appendFile(path.join(distRoot, "plugin-support.d.ts"), supportSource.split("\n").filter(line => {
  const entry = line.match(/^export .* from "\.\/(.+)\.js";$/u)?.[1];
  return entry && sourceRuntimeDeclarations.has(`${entry}.d.ts`);
}).join("\n") + "\n");
