import type { ComponentProps } from "react";
import { expectTypeOf, it } from "vitest";
import type {
  AgentStatusMessageProps,
  AgentPlanMessageProps,
  GeneratedFileMessageProps,
  JobProgressMessageProps,
  WebSearchPluginProps,
  RetrievalChunksPluginProps,
  WebSearchProps,
  ConversationComposerInputProps,
  ConversationCanonicalComposerProps,
  ConversationCanonicalReasoningGroupProps,
  ConversationCanonicalToolGroupProps,
  ConversationToolTimeline,
} from "../dist/index.js";
import type { ReasoningRoot } from "../dist/plugin-support.js";
import type { WebSearchPlugin as NpmWeb } from "../dist/web-search/index.js";
import type { WebSearchPlugin as SourceWeb } from "../dist/sources/takeover/web-search/index";
import type { ConversationComposerPlugin as NpmComposer } from "../dist/composer/index.js";
import type { ConversationComposerPlugin as SourceComposer } from "../dist/sources/takeover/composer/index";

type DeclaredKeys<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

it("keeps runtime data overrides and rendering machinery out of the public Plugin API", () => {
  expectTypeOf<Extract<DeclaredKeys<AgentStatusMessageProps>, "label" | "elapsed" | "state">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<DeclaredKeys<AgentPlanMessageProps>, "title" | "steps" | "activeIndex">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<DeclaredKeys<GeneratedFileMessageProps>, "filename" | "mimeType" | "data" | "sourceType">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<DeclaredKeys<JobProgressMessageProps>, "title" | "stages" | "stageIndex" | "stageProgress" | "eta" | "onCancel" | "outcome" | "elapsedMs">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<DeclaredKeys<WebSearchPluginProps>, "query" | "results" | "searching" | "cycle">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<DeclaredKeys<RetrievalChunksPluginProps>, "query" | "chunks" | "searching">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof WebSearchProps, "cycle">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof ConversationCanonicalReasoningGroupProps, "streaming" | "onAnimationStart">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof NonNullable<ConversationCanonicalReasoningGroupProps["buttonProps"]>, "active" | "duration">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof NonNullable<ConversationCanonicalToolGroupProps["buttonProps"]>, "active" | "count">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof ComponentProps<typeof ReasoningRoot>, "onAnimationStart">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof ComponentProps<typeof ConversationToolTimeline>, "children">>().toEqualTypeOf<never>();
});

it("exposes one Composer entry for row count, length and submission mode in npm and portable implementations", () => {
  expectTypeOf<Extract<keyof ConversationComposerInputProps, "cacheMeasurements" | "submitOnEnter" | `unstable_${string}`>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof NonNullable<ConversationCanonicalComposerProps["inputProps"]>, "rows" | "maxLength" | "submitMode" | "autoFocus" | "children" | "value" | "defaultValue">>().toEqualTypeOf<never>();
  expectTypeOf<Pick<ConversationCanonicalComposerProps, "rows" | "maxLength" | "submitMode">>().toEqualTypeOf<Pick<ConversationComposerInputProps, "rows" | "maxLength" | "submitMode">>();
  expectTypeOf<ComponentProps<typeof SourceComposer>>().toEqualTypeOf<ComponentProps<typeof NpmComposer>>();
  expectTypeOf<ComponentProps<typeof SourceWeb>>().toEqualTypeOf<ComponentProps<typeof NpmWeb>>();
});
