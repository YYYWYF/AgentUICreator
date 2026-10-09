# Optional authentication plugins

`plugin/auth-gate` owns `auth.gate` and `auth.session`. `plugin/auth-account`
requires the gate source and consumes the session; it owns no authentication
state. Neither plugin is included in any default preset. Installing source is
separate from adding instances to AppUIModel.

## Creator installation recipe

1. Inspect the project, existing authentication, services, selected UI stack,
   application plugins, Sidebar Header/items/content and occupied Footer.
2. Propose the Host adapter seam, the unique `auth-gate` service owner and optional
   `auth-account` Footer. Get one confirmation covering that scope. Honor explicit
   authorization already given by the user. Use the existing Host service-contract
   authorization when creating or changing a public service contract.
3. Use `apply_agent_ui_source_item` for `plugin/auth-account` (full mode) or
   `plugin/auth-gate` (login only). The source dependency closure prepares the owner
   but does not install an application instance. Existing files are protected by
   the Source Registry's conflict handling; never overwrite existing auth code.
4. Configure `services/auth/adapter.ts` against the Host's real auth client. The
   shipped template fails closed. The first version uses typed account/password
   input; replace that seam and LoginScreen for an explicitly chosen SSO flow,
   without adding a generic form engine or another authentication runtime.
5. In one existing AppUIModel mutation transaction, add the `auth-gate-main`
   instance to `applicationPlugins` with `pluginId: "auth-gate"`. Add the optional
   `auth-account-main` instance to `sidebar.footer`, an ordinary Slot. Reuse the
   existing Sidebar object and preserve its Header/items/content, all plugin
   instances, and enabled flags. If Footer is occupied, propose moving/replacing
   its current content first. For projects without Sidebar, propose wrapping the
   existing root as Sidebar content, or use login-only mode.
6. Source and model steps are not an atomic transaction together. On failure,
   report which step committed, preserve the last valid model, and use existing
   Host recovery/rollback facilities. Check service dependencies, generated
   registry, model compilation and build. Browser acceptance is a separate step.

For an existing Sidebar, the additional structure is:

```json
{
  "applicationPlugins": [
    { "id": "auth-gate-main", "pluginId": "auth-gate", "enabled": true }
  ],
  "footer": {
    "type": "slot",
    "plugins": [
      { "id": "auth-account-main", "pluginId": "auth-account", "enabled": true }
    ]
  }
}
```

This is a fragment: append the application instance to the existing list and put
Footer on the existing Sidebar, not at the model top level. Do not replace the
user's model with this fragment. Footer can be emptied, moved or disabled through
ordinary plugin operations without removing the application gate.

## Host adapter contract

Implement `restore`, `signIn`, `signOut`, and preferably `subscribe` in
`services/auth/adapter.ts`. Return only `{ id, displayName, email?, avatarUrl? }`.
The service projects these fields and discards extra properties. Passwords are
submitted directly to the Host adapter and cleared from the form after submit.
Tokens and cookies remain in the Host client; they never enter AppUIModel,
service snapshots or diagnostics. Session failures expose fixed codes/localized
messages rather than backend exception details.

`restore()` returns null for an anonymous/expired session; throw only for an
unrecoverable initialization error. `subscribe(listener)` must notify null on
expiry or a protected API's 401, and the current public profile on updates.
The Host's API client must reject or cancel protected requests after invalidation.
The backend must authorize every protected request independently of this UI.

Application Gate is outside both native React and compatibility conversation
providers. Until ready, conversation providers, history binding and generated
conversation integrations are absent. Revocation synchronously aborts the current
run and unmounts the conversation subtree; the next ready epoch gets a fresh
provider and thread binding. `initialThreadId` is used only for the first epoch,
so a new user cannot accidentally reopen the previous user's initial thread.
Workspace plugin services are deactivated by the existing Application lifecycle.
The Foundation gate/session owner stays mounted throughout these changes.

## Explicit demo

The production adapter never imports/enables the demo. To run a disposable demo,
explicitly replace the Host adapter factory with:

```ts
import { createDemoAuthAdapter } from "./mock-adapter";
export function createHostAuthAdapter() {
  return createDemoAuthAdapter({ demo: true });
}
```

Use any nonempty account and password `demo`. Wrong passwords stay blocked with
localized feedback. Each factory call has its own in-memory profile/listeners.
For refresh restoration, explicitly provide `storage: sessionStorage` and a
unique `storageKey` for that Host instance. Storage contains demo display data
only; it is not an authentication/token protocol and must not protect production
APIs. `failRestore: true` demonstrates startup error. `updateUser(profile)`
demonstrates profile changes and `updateUser(null)` simulates expiry.

Full demo: install both source items and both model instances. Login-only demo:
install the gate/application instance and leave Footer absent or empty. Disabling
account UI must never disable/remove the gate. Replace the demo adapter before
shipping a real authenticated application.

## Upgrade boundary

SidebarFrame renders a generic Footer Slot using the existing SidebarFooter.
Footer contains at most one visual content plugin and needs no Sidebar navigation
metadata. Narrow Sheet portals stay local to the Host, and application gate sizes
use the Host container rather than viewport dimensions. No assistant-ui vendor,
AG-UI protocol or conversation semantic micro-slot was changed. New minimum
package versions are React facade `0.1.6` and Layout runtime `0.1.3`.
