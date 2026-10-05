# Mention Backend Context Reference

Frontend Mention Source ≠ Backend Mention Resolver. The frontend searches and displays candidates and sends a stable ID in ordinary user text. The backend rechecks existence and authorization using that ID, projects allowed business fields, and appends native AG-UI Context. The label is untrusted presentation text and never drives business lookup.

```text
ConversationMentionSource.search("张")
  → { type: "user", id: "employee_84721", label: "张三" }
  → :user[张三]{name=employee_84721}
  → AG-UI HttpAgent / RunAgentInput.messages
  → parseAgentUIDirectives
  → server-owned resolver map
  → authorization + business lookup + safe projection
  → RunAgentInput.context
  → Agent / model adapter
```

## Shared text contract

`@agent-ui/runtime-core` exports `AgentUIDirectiveReference`, `AgentUIDirectiveSegment`, `parseAgentUIDirectives` and `trySerializeAgentUIDirective`. This pure codec has no React, assistant-ui or AG-UI dependencies. React adapts directive segments to assistant-ui mention segments internally; Mention insertion, Slash directives and historical DirectiveText use the same contract.

The wire format remains `:type[label]{name=id}`; when ID equals label, `{name=…}` is omitted. Unclosed or empty bracket directives remain ordinary text. Parsing retains the pinned upstream grammar, including its optional name attribute behavior: `:user[x]{name=}` parses the valid `:user[x]` prefix and leaves `{name=}` as text. Serialization rejects unsafe references rather than escaping or changing the wire format. Unknown types can be parsed; presentation and backend resolution independently select supported types.

The conformance guard compares fixed serialized and parsed cases with the installed assistant-ui default formatter, inspected in the local upstream repository at revision `3542d602272a62eddeb8989befc910841c267022`. A dependency upgrade that changes the grammar fails the guard; maintainers must explicitly choose whether to update the product contract or retain it.

## Backend reference API

`@agent-ui/mock-agent` exports `resolveDirectiveContexts(input, resolvers, { signal })` and resolver types. A resolver receives `{ type, label, id }` and an AbortSignal, and returns `Promise<Context | null>`.

Every run scans all user messages, including text parts in multimodal content. Other roles, binary data and URLs are ignored. References are deduplicated by the tuple `(type, id)` across the complete transcript; labels do not affect deduplication. Only explicitly registered types are resolved. The result is a new RunAgentInput with original context followed by server context; the original request, message contents and attachments are not modified.

A resolver returns `null` for missing or unauthorized references without disclosing which condition occurred. Backend failures throw and cancellation propagates; neither is disguised as not-found. Production applications supply server-owned identity and authorization data, requery their business service and explicitly choose fields allowed into the model. Do not use client-provided Context as proof of authorized business data.

## Mock roster and scenario

`composer-mention` retains its frontend-reference role. The separate backend reference `composer-mention-context` requests the existing Mention UI and explicit composer-trigger-demo resources. The roster exists only in the development backend:

| Stable ID | Name | Department | Title |
| --- | --- | --- | --- |
| employee_84721 | 张三 | 产品部 | 产品经理 |
| employee_84722 | 张晓 | 研发部 | 前端工程师 |
| employee_84723 | 李四 | 设计部 | 产品设计师 |

`createDemoUserResolver(authorizedIds)` uses a server-owned allowlist, checks stable IDs and projects only name, department and title. Its default demo session can access these three records. Missing and denied IDs both return null. This fixture is not a real authorization system or an HR integration.

MockScenario's optional server-only `prepareRun` hook prepares input and/or steps before execution. It is excluded from the scenario list DTO and frontend. Scenarios without the hook retain their existing behavior. Hook failures emit a generic RUN_ERROR without private backend details; aborted preparation stops output.

The reference hook injects resolved Context and builds deterministic response steps from freshly server-resolved entries. It ignores client-supplied lookalike employee Context when generating this response. `:user[CEO]{name=employee_84721}` therefore answers `张三是产品部的产品经理。` using fixture data, not the label. Missing/denied references answer `没有找到当前可用的人员上下文。`.

A follow-up message without a directive still resolves prior user references from the submitted transcript on every run. No frontend context cache is needed. A real model adapter must consume messages plus the server-prepared Context when building its model call.

Frontend and backend share only type, stable ID and directive grammar; they do not share full business objects. No Mention business logic enters runtime-conversation, no private AG-UI event or schema is added, and no roster is installed into default production templates. Quote is unchanged. This reference does not introduce a backend plugin registry.

## Automated coverage

Codec tests cover mixed text, multiple/unknown directive types, omitted redundant IDs, malformed text and unsafe serialization. The assistant-ui conformance guard detects grammar drift. Resolver tests cover stable lookup despite forged labels, deduplication, type registration, missing/denied references, failures, cancellation, context preservation, immutability and multimodal text/binary separation. Real HttpAgent tests exercise request parsing, Context injection, deterministic answers, unknown IDs, forged client Context, follow-up reconstruction and unchanged ordinary scenarios.

Behavioral/browser acceptance is intentionally not run for this implementation, as requested.

Implementation checks: runtime-core full suite and typecheck, React directive conformance and Composer trigger regression, Mock Backend focused resolver/HTTP/runner/catalog regression, and builds for runtime-core, React and Mock Agent passed. React package-wide typecheck remains blocked by the existing missing jsdom declaration in `tests/violet-brand.test.tsx` (TS7016); the React source/declaration build passes. Migrated/full workspace checks and behavioral acceptance were not run.
