# Project-owned business service implementations

Generated Agent and canonical Runtime provide Base64 attachments (20 MiB per
file), browser recognition when supported and in-session feedback selection.
Preserve these defaults, Plugin enablement and layout. Do not ask users to write
adapters. Business configuration enters through Agent props: attachments, dictation,
feedback and advanced adapters. History uses the selected conversation-data-source
Plugin implementation with project-owned configuration, or a project-provided
custom conversationDataSource. Keep the address panel for development preview
connections; never put server credentials in browser code.

Connect or change business services in project-owned implementation code:
- Pass attachment/dictation/feedback options or advanced adapters directly to Agent.
  Complex implementations can stay in project services; Runtime is reusable.
- Create a history data source in project code and pass it as Agent.conversationDataSource.
  In current projects, services/conversations/http-data-source.ts delegates through
  plugins/conversation-data-source and owns conversationDataSourceConfig: address,
  per-request headers, credentials, fetch and per-operation request/response options.
  Default HTTP requests and backend field/envelope conversion belong to the
  conversation-data-source Plugin; persisted message quirks belong to
  conversation-service before Runtime's official assistant-ui converter. Configure
  project overrides first; the Plugin defaults are not a required backend protocol.
  The current HTTP API configures list/get/delete/rename/archive/unarchive
  independently with url, method, JSON body and decode. Use those options for
  custom routes, methods, payloads and backend envelopes; fetch remains a transport
  override, not a prerequisite for changing a request method or validating a
  mutation response. list.decode returns ConversationSummary[]; get.decode returns
  ConversationDetailResponse with state.values.messages. Their outputs must satisfy
  the conversation-service public schemas. Mutation decoders can validate business
  success codes and throw on failure; an empty mutation response supplies undefined.
  url callbacks receive endpoint, optional signal and the operation's input (id
  for single-conversation operations, plus title for rename). body callbacks and
  decoders may be async. Explicit URLs are used as supplied; use a url callback
  when the address must incorporate endpoint or an encoded id. Shared DTOs and
  contracts come from the Plugins /conversation-service public entry, not the
  removed Runtime conversation-service paths.
  Inspect installed declarations before choosing this configuration shape. Older
  projects may own a full HTTP implementation or an earlier configuration shape:
  preserve it unless a separate project migration is requested. Custom data sources
  may implement optional rename/archive/unarchive methods. Missing or failed
  operations reject instead of claiming success. List items use optional
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
existing transport/auth. Configure the current delete operation's url, method,
body and decode as needed while preserving list/detail behavior and the delete(id)
public contract. Distinguish one operation's configuration from shared base URL,
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
using project service code/adapter overrides, not a module-load token snapshot.
Multipart upload/transcription defaults to field file and response url/text;
field names/dotted response paths are configurable in implementation. Feedback
POSTs threadId/messageId/type/comment and accepts successful HTTP status.
Presigned/multi-stage uploads and incompatible payloads need project adapters.
Returned HTTP(S) file URLs enter content as AG-UI source url; Base64 uses source
data. Never send an upload endpoint or local blob URL as a file URL.

Inspect the installed generated entry before editing; older projects may need a
scoped application-layer change. Preserve unrelated Host props/customizations.
Default response conversion lives in the data-source Plugin, while <think> and
empty-history-message compatibility live in conversation-service. Runtime only
wraps the official history converter on this path and owns conversation execution;
do not move backend-specific parsing into Runtime or confuse persisted history
adaptation with live AG-UI event/state normalization. Project configuration edits
do not authorize Plugin source takeover. npm upgrades preserve project decoders,
application files and BASE; authorized owned-source updates use the existing
BASE/LOCAL/TARGET sync and compatibility validation.
Do not patch vendor, take over Plugin source, create a Plugin Service contract
for a private HTTP helper, or ship Creator in
production. Browser code holds only user-scoped credentials, never server keys.
Validate actual requests, response fields, cancellation and cleanup. Distinguish
Mock/unit checks from real business service verification.
