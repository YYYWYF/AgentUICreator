# Product integration for assistant-ui

The vendor tree is a deterministic installation of pinned upstream source.
It contains no AgentUICreator product hooks, labels, theme or Portal patches.

This directory composes the public upstream React/Base UI primitives with the
Agent UI Portal container, locale labels, selection override and Composer
selection registration. The upstream presentation and component anatomy are
preserved. Components that depend on an integrated overlay (attachments,
Markdown buttons, task trays and reasoning Markdown) use the same product
integration transitively.

These integration presentations are generated, not independently maintained
copies. `scripts/sync-product-adapters.mjs` derives the narrow dependency closure
from clean installed vendor source, applies explicit product integration anchors
and rewrites only dependency imports. Changed upstream anchors stop regeneration
for review. `UPSTREAM.json` records both clean-source and integration hashes.
Do not hand-edit generated components: change the owning integration generator.
The vendor sync regenerates these integrations in the same update operation.

The configured conversation list and the response Footer are product-owned
composition boundaries. Menus pass the public `portalProps.container` option.
`ConversationActionMoreMenu` accepts the Plugin's localized label and menu
content; it does not create an Agent Runtime or introduce a new Slot.

The complete upstream Thread has no granular menu-container replacement API.
It stays an unchanged reference; the production conversation entry remains
ComposableThread. No DOM relocation, global body theme, or private Portal API
is used to force the complete Thread into the scoped integration.

Upgrade gates distinguish vendor purity, generated integration drift, compiled
Tailwind coverage, local runtime aliases, overlay DOM containment and browser
visual acceptance. Passing one does not imply the others passed. Generative UI
vocabulary serialization is maintained by its existing separate source owner.

Product style ownership is per DOM element. Existing `aui-*` classes and
`agent-ui-*` slots identify presentation; generic upstream slots also occur in
business libraries, so the generator adds `data-agent-ui-owned` to product
presentation elements after localization. It preserves custom component calls
and children. The marker is not inherited by descendants and does not alter the
Plugin contract. ToolTimeline is in this generated closure so its own controls
retain the baseline while custom Tool content keeps its library styling.
