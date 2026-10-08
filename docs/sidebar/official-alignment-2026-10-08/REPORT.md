# Sidebar official-style alignment — 2026-10-08

Delivery scope: implement and push on `dev`. The user's explicit “不要验收” overrides the attached plan's browser, screenshot, visual and standalone Host acceptance requirements. No browser acceptance was run and no product screenshots were produced.

## Implementation

- `packages/react/src/internal/sidebar-frame.tsx` uses the existing upstream-derived product `SidebarProvider`, `Sidebar collapsible="icon"`, `SidebarHeader`, `SidebarTrigger`, `SidebarContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarInset`, Tooltip and contained Sheet. `activeItemId` is the only interaction state; the trigger opens the first configured enabled item or closes the active item.
- The official gap and container share the provider width variables: 48px collapsed and 280px total expanded, including the 48px rail. Removed the independent panel-width track. Frame-scoped CSS in the utilities layer overrides full-page fixed positioning, viewport height and breakpoint visibility; other Sidebar consumers are unaffected. Narrow containers keep the official desktop rail and the existing locally portaled Sheet for content.
- Optional `UIPluginDefinition.RailAction` is mirrored in generated and Project Control contracts. The Host uses the existing Slot outlet, contribution/admission checks, instance context, service context and error boundary. Rail rendering does not introduce another plugin setup, backend API or conversation runtime. It declares the same existing layout Slot so its contribution is available before expanding the panel; no SlotRegistry contract changes were made.
- History provides an icon-only `ConversationThreadListNew` with localized tooltip/accessibility name. It hides while the history panel is open. The original panel button remains; narrow navigation closes the Sheet. Disabled/removed instances produce no Sidebar entry or action; inactive service admission produces no rail action.
- History presentation adds a localized empty state, a compact new-thread button and list-local scrolling. Error sections remain outside that scrolling list. Theme variables and the existing locale namespace remain the presentation owners.
- Source Registry history version is `0.0.4`. The new public frame property requires React package `0.1.3`; package version and foundation/core plus foundation/core-runtime dependency minima are updated. Regenerate foundation contracts/runtime and history together. npm publication was not requested or performed.

No AppUIModel Sidebar protocol, defaultActive protocol, manifest icon/labels, Creator operations, conversation service, AG-UI ownership, vendor source or adapter recipe was changed. Existing adapter protection for cookies, shortcuts and contained Sheet is reused without adding adapter differences.

## Static and unit checks

Logs are in `logs/`.

| Check | Result |
| --- | --- |
| Sidebar frame, history policy and real assistant-ui thread integration | 19 passed |
| Sidebar contracts and Creator AppUIModel operations | 75 passed |
| assistant-ui upgrade contract | 33 passed |
| React, Project Control and Source Registry typechecks | Passed |
| Sidebar Playwright source typecheck | Passed; browser execution excluded |
| React build and public/optional-Lexical boundaries | Passed |
| i18n parity | Passed |
| assistant-ui upstream purity/provenance | Passed |
| git diff whitespace check | Passed |

The real thread unit integration uses the actual ConversationRuntimeProvider, service thread binding, mock HTTP history data source, PluginServiceProvider and plugin RailAction. It selects existing history, clicks the collapsed shortcut, observes both upstream main-thread and binding changes, verifies the Sidebar stays collapsed, opens the narrow history Sheet, verifies the duplicate rail shortcut hides, then clicks the panel new-thread control and observes the Sheet close. This is a jsdom/unit regression, not browser or visual acceptance.

Updated existing Playwright geometry assertions to the 48px/280px total widths and 232px content panel, and added the official top trigger interaction. These assertions have not been executed in a browser.

## Existing failure and remaining verification

`project-control-contract.test.ts` rejects the supposedly valid `mutate_app_ui_model.result.json` fixture. A separate clean HEAD archive at `e75f5ff1` reproduces the same rejection, independently of this Sidebar change (`logs/baseline-contract.log`). That unrelated wire-fixture failure was not repaired.

Browser Sidebar E2E, visual/theme comparison, floating Assistant, Web Component/multiple-instance browser checks, `verify:ui`, and real packed independent Host consumption were excluded by the user's instruction. Static and unit success does not establish those acceptance results. No all-green full repository claim is made.

Unrelated working-tree changes are excluded from this commit.
