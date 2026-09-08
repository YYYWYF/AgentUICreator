# Custom Event Protocol

Custom Event Protocol is the generated application's extension channel for
backend-originated, application-specific, transient events. It does not replace
AG-UI and does not introduce another transport or Agent Runtime.

```text
Backend Agent
  -> AG-UI CUSTOM
  -> AgUiTransport
  -> AgentApplicationEvent
  -> AppEventRegistry schema validation
  -> instance-scoped Plugin events
  -> UI Plugin
```

Standard Agent behavior continues to use standard AG-UI lifecycle, message,
reasoning, tool, step, subagent, interrupt, and state semantics. Runtime Core and
Plugins never depend on the AG-UI `CUSTOM` wire type.

## Define the application contract

The generated application owns one event registry in
`agent-contract/agent-events.ts`. Each key is the exact wire event name and each
value is the Zod payload contract.

```ts
import { z } from "zod";

export const appEventSchemas = {
  "artifact.created": z.strictObject({
    id: z.string(),
    type: z.string(),
    url: z.string(),
  }),
} as const satisfies Record<string, z.ZodTypeAny>;
```

Payloads are not required to be objects. A contract may use `z.string()`,
`z.number()`, `z.array(...)`, `z.union(...)`, or another appropriate schema.
Prefer `z.strictObject(...)` for object payloads so unexpected fields are caught.
Plugins receive the schema-decoded value, not the unchecked wire value.

Do not define schemas inside Plugins, register schemas dynamically, or maintain
business schemas in `AgUiTransport`.

## Declare and subscribe

A Plugin must declare every consumed event in `manifest.data.events`:

```json
{
  "id": "artifact-panel",
  "name": "Artifact Panel",
  "description": "Displays generated artifacts",
  "version": "1.0.0",
  "data": {
    "events": ["artifact.created"]
  }
}
```

Subscribe with the project-local typed helper from
`agent-contract/agent-events.ts`:

```ts
import { subscribeAppEvent } from "../../agent-contract/agent-events";

setup({ events }) {
  return subscribeAppEvent(events, "artifact.created", ({ payload, producer }) => {
    console.log(payload.id, payload.type, payload.url, producer);
  });
}
```

The helper infers the payload from `appEventSchemas`. The underlying
`usePluginEvents().subscribe` and `setup({ events })` APIs remain
instance-scoped. A usable subscription requires all three layers:

1. a schema in `agent-events.ts`;
2. the exact name in `manifest.data.events`;
3. a Plugin subscription.

There is no wildcard subscription. `*` and `artifact.*` have no special meaning.

## Event names

Event names are application-owned and routing uses exact string matching. The
Runtime never trims, lowercases, case-folds, camel-cases, dot-cases, or otherwise
normalizes a name. For example, `ArtifactCreated` and `artifactcreated` are
different events.

Valid names may use uppercase letters, underscores, hyphens, slashes, colons,
Unicode, emoji, punctuation, and internal spaces. Lowercase dot-separated names
such as `artifact.created` are recommended only when the application has not
already chosen a name.

The hard protections are:

- length from 1 through 128 characters;
- no blank-only names;
- no leading or trailing whitespace;
- no U+0000 through U+001F or U+007F control characters;
- no reserved Agent Runtime namespace.

The reserved namespace roots are `run`, `message`, `tool`, `reasoning`, `step`,
`subagent`, `interrupt`, `state`, `agent-ui`, and `ag-ui`. Reservation is
case-insensitive and applies to the root itself and its dot namespace, so
`run`, `run.finished`, and `RUN.finished` are rejected. Other business roots such
as `artifact`, `workspace`, `document`, and company-specific names remain owned by
the application.

## Wire mapping and producer

A backend can send:

```json
{
  "type": "CUSTOM",
  "name": "artifact.created",
  "value": {
    "id": "artifact-123",
    "type": "image",
    "url": "/artifacts/123"
  }
}
```

`AgUiTransport` defensively clones `value` into `payload` and maps origin to the
Runtime Core producer contract:

```ts
type AgentProducer =
  | { type: "root" }
  | { type: "subagent"; id: string };
```

An absent AG-UI `subagentRunId` becomes `root`; a present one becomes a
`subagent` with that id. The Custom Event Protocol does not add source-agent or
parent-agent metadata.

## Delivery and diagnostics

Application Events are live occurrences. They are never stored in messages,
state, history, or `AgentRuntimeSnapshot`, and a Plugin mounted later does not
receive old events. Repeated events are delivered repeatedly; business-level
deduplication requires an identifier in the payload and application logic.

Each listener receives its own clone of `payload` and `producer`. Async handlers
do not apply backpressure to other listeners, and a thrown or rejected handler
does not interrupt other listeners or later Agent events.

Rejected input is dropped without exposing its payload in diagnostics:

| Condition | Result |
| --- | --- |
| Backend name is not registered | `application-event-unknown` |
| Payload fails the registered schema | `application-event-invalid-payload` |
| Plugin subscribes without manifest declaration | `plugin-event-undeclared-subscription` |
| Plugin handler throws or rejects | `plugin-event-handler-error` |
| Manifest declares a name absent from the registry | Plugin activation fails |

Plugin deactivation automatically removes its subscriptions. Reactivation creates
a fresh subscription scope and does not replay past events.

## When not to use it

Do not use Custom Events for:

- standard run, message, reasoning, tool, step, or subagent lifecycle;
- interrupts or state synchronization;
- values a late-mounted Plugin must recover;
- continuous Activity progress;
- Agent-invoked frontend actions;
- Plugin-to-Plugin capability sharing;
- local UI state or frontend-to-backend commands.

Use standard AG-UI events for standard Agent semantics, AG-UI State for durable
shared state, Frontend Tools for Agent-invoked frontend operations, Plugin
Services for stable cross-Plugin capabilities, and Plugin-local state for local
presentation. P0 is backend-to-frontend only and provides no `events.emit()`.

## Mock development

Mock Agent scenarios can emit the same wire event without a real backend:

```ts
{
  type: "custom",
  name: "artifact.created",
  value: { id: "artifact-123", type: "image", url: "/artifacts/123" },
  delayMs: 200,
  subagentRunId: "researcher-1",
}
```

`delayMs` and `subagentRunId` are optional. Mock Agent intentionally does not
validate names, reserved namespaces, or payload schemas because it simulates the
backend wire. This allows scenarios for valid, unknown, invalid-payload, and
subagent events to exercise the real frontend validation path.

## Compatibility and versions

The Runtime does not impose an event-version convention. Compatible additions
can use optional payload fields. Breaking changes may use a new event name such
as `artifact.created.v2` or a payload version field; the application owns that
choice.
