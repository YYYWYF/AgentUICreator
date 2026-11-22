# Project-owned business service implementations

Generated Agent and canonical Runtime provide Base64 attachments (20 MiB per
file), browser recognition when supported and in-session feedback selection.
Preserve these defaults, Plugin enablement and layout. Do not ask users to write
adapters. Business configuration enters through Agent props: attachments, dictation,
feedback and advanced adapters. History uses project-owned data-source methods, or an explicitly supplied
conversationDataSource. Keep the address panel for development preview
connections; never put server credentials in browser code.

Connect or change business services in project-owned implementation code:
- Pass attachment/dictation/feedback options or advanced adapters directly to Agent.
  Complex implementations can stay in project services; Runtime is reusable.
- Create a history data source in project code and pass it as Agent.conversationDataSource.
  Generated services/conversations/data-source.ts directly implements list/get/delete/
  rename/archive/unarchive. Edit the relevant method's URL, HTTP method, request body,
  authentication and response conversion, or use the project's Axios/SDK.
  Import existing business functions and call them directly in the relevant methods.
  Return their result directly when it
  already matches the service contract; otherwise convert the raw backend response
  there. Await writes and propagate failures; pass read cancellation to the actual
  request. Reuse shared auth/clients in project modules. There is no npm HTTP factory
  or url/method/body/decode configuration layer. list returns
  ConversationSummary[]; get returns ConversationDetail with history:
  { format: 'langchain', messages }. Writes resolve without a value or throw.
  Import canonical types from Plugins /conversation-service. Generated project
  code uses TypeScript types and focused checks for unknown responses, without
  Zod schemas, schema.parse calls or a direct Zod dependency. Do not introduce
  automatic backend-envelope detection. Map backend-specific formats explicitly
  inside the project methods.
  Preserve the agreed backend response: returnCode/errorMsg/body, list items in
  body.conversations with thread_id/title/last_message_time, and details in
  body.max_message_checkpoint.channel_values.messages. The generated project methods explicitly map
  this response to the service contract. Do not replace the backend format with
  the internal { id, title, history } object or ask the backend to migrate.
  Each Agent binds an independent endpoint and request transport. Preserve preview
  address/proxy selection, rotating user credentials and read cancellation signals.
  Project methods are application code, not implementation source takeover or synchronization.
  Optional rename/archive/unarchive methods correspond to list actions. Missing or
  failed operations reject. List status is optional regular/archived; return archived
  records if users need to restore them. itemProps.actions hides individual actions;
  showArchived controls the archive section. Keep assistant-ui as lifecycle owner.
- React and Web Component consume the same project implementations.

## Current Creator editing boundary

Inspect the actual sourceRoot and existing files, then edit project-owned Service
implementations with ordinary read/edit/create tools. Optional
prepare_ui_service_contract_change and prepare_ui_service_implementation_change
provide topology, declaration and reference preflights without user confirmation.
Apply their single-use planId with the corresponding apply tool. Changed file or
reference evidence requires refreshing the preflight, not a new user decision.

For history deletion, inspect services/conversations/data-source.ts and existing
transport/auth. Edit the delete method directly, preserving list/detail behavior
and the delete(id) public contract. Distinguish one operation's configuration from shared base URL,
credentials, headers and response helpers. Explain which callers and operations
change; static imports cannot prove all runtime callers. Use the contract preflight
when changing public declarations to inspect affected consumers. Do not invent a
public Service contract for a private helper,
move unrelated code, or ask users to make supported edits externally.
A confirmation of code changes does not authorize deleting actual business data.
After applying, run validation and verify request method, encoded ID, URL,
auth and success/failure handling using an isolated test backend. Only test real
deletion when the user has authorized the relevant test data. Report Mock/unit
verification separately from a real business backend check.

Ask only for missing endpoint/auth/request-response examples. Reuse current
login credentials and gateway helpers; read expiring credentials at request time
using project service code, not a module-load token snapshot.
Multipart upload/transcription defaults to field file and response url/text;
field names/dotted response paths are configurable in implementation. Feedback
POSTs threadId/messageId/type/comment and accepts successful HTTP status.
Presigned/multi-stage uploads and incompatible payloads need project adapters.
Returned HTTP(S) file URLs enter content as AG-UI source url; Base64 uses source
data. Never send an upload endpoint or local blob URL as a file URL.

Inspect the installed generated entry before editing; older projects may need a
scoped application-layer change. Preserve unrelated Host props/customizations.
Business response conversion lives in project data-source methods, while <think> and
empty-history-message compatibility live in conversation-service. Runtime only
wraps the official history converter on this path and owns conversation execution;
do not move backend-specific parsing into Runtime or confuse persisted history
adaptation with live AG-UI event/state normalization. Project configuration edits
do not authorize Plugin source takeover. npm upgrades preserve project decoders,
application files and current implementations; authorized owned-source updates
read the actual implementation and installed target without a historical BASE.
Do not patch vendor, take over Plugin source, create a Plugin Service contract
for a private HTTP helper, or ship Creator in
production. Browser code holds only user-scoped credentials, never server keys.
Validate actual requests, response fields, cancellation and cleanup. Distinguish
Mock/unit checks from real business service verification.
