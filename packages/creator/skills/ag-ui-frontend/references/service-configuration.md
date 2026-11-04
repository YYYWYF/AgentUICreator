# Project-owned business service implementations

Generated Agent and canonical Runtime provide Base64 attachments (20 MiB per
file), browser recognition when supported and in-session feedback selection.
Preserve these defaults, Plugin enablement and layout. Do not ask users to write
adapters. Business configuration enters through Agent props: attachments, dictation,
feedback and advanced adapters. History uses conversationDataSource with a
project-owned implementation. Keep the address panel for development preview
connections; never put server credentials in browser code.

Connect or change business services in project-owned implementation code:
- Pass attachment/dictation/feedback options or advanced adapters directly to Agent.
  Complex implementations can stay in project services; Runtime is reusable.
- Create a history data source in project code and pass it as Agent.conversationDataSource.
  services/conversations/http-data-source.ts owns list/detail/delete,
  rename/archive/unarchive routes, per-request credentials and response conversion.
  Adapt the project's HTTP methods and payloads to the user's actual API; the
  template routes are defaults, not a required backend protocol. Custom data
  sources may implement optional rename/archive/unarchive methods. Missing or
  failed operations reject instead of claiming success. List items use optional
  status: "regular" | "archived" (omitted means regular); include archived items
  so users can find and unarchive them. Keep assistant-ui as the action lifecycle
  owner. The project list can hide individual actions through
  itemProps.actions and the archive section through showArchived.
- React and Web Component consume the same project implementations.

## Current Creator editing boundary

Inspect the actual sourceRoot and existing files, then edit project-owned Service
implementations with ordinary read/edit/create tools. Optional
prepare_ui_service_contract_change and prepare_ui_service_implementation_change
provide topology, declaration and reference preflights without user confirmation.
Apply their single-use planId with the corresponding apply tool. Changed file or
reference evidence requires refreshing the preflight, not a new user decision.

For history deletion, inspect services/conversations/http-data-source.ts and
existing transport/auth. Adapt deleteUrl and the DELETE request as needed while
preserving list/detail behavior and the delete(id) public contract. Distinguish
one operation's route from shared base URL, credentials, headers and response
helpers. Explain which callers and operations change; static imports cannot
prove all runtime callers. Use the contract preflight when changing public declarations to inspect affected consumers. Do not invent a public Service contract for a private helper,
move unrelated code, or ask users to make supported edits externally.
A confirmation of code changes does not authorize deleting actual business data.
After applying, run validation and verify request method, encoded ID, URL,
auth and success/failure handling using an isolated test backend. Only test real
deletion when the user has authorized the relevant test data. Report Mock/unit
verification separately from a real business backend check.

Ask only for missing endpoint/auth/request-response examples. Reuse current
login credentials and gateway helpers; read expiring credentials at request time
using project service code/adapter overrides, not a module-load token snapshot.
Multipart upload/transcription defaults to field file and response url/text;
field names/dotted response paths are configurable in implementation. Feedback
POSTs threadId/messageId/type/comment and accepts successful HTTP status.
Presigned/multi-stage uploads and incompatible payloads need project adapters.
Returned HTTP(S) file URLs enter content as AG-UI source url; Base64 uses source
data. Never send an upload endpoint or local blob URL as a file URL.

Inspect the installed generated entry before editing; older projects may need a
scoped application-layer change. Preserve unrelated Host props/customizations.
Do not patch vendor, take over Plugin source, create a Plugin Service contract
for a private HTTP helper, or ship Creator in
production. Browser code holds only user-scoped credentials, never server keys.
Validate actual requests, response fields, cancellation and cleanup. Distinguish
Mock/unit checks from real business service verification.
