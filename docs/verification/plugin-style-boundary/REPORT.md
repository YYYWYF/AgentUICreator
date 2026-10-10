# Plugin style boundary P0 implementation

Date: 2026-10-10
Baseline: `e8ad87969d7887f6418b5af35ee402f825b0a67b`

Status: **implementation delivered; browser / visual acceptance NOT RUN**.
`PLUGIN_STYLE_BOUNDARY = NOT_ACCEPTED`

The user explicitly requested implementation and push without acceptance. This
supersedes the pasted plan's before-change browser reproduction and second
visual-closure commit. No screenshots, computed-style before/after measurements,
AntD parity PASS, or updated A/B/C acceptance claims are supplied.

## Change and boundary

The baseline applied an unlayered `all: revert-layer` to the entire Agent UI
subtree, including business UI. Its layered Preflight also selected arbitrary
root descendants and reset borders, padding, typography and control backgrounds.
Both selector sets could affect third-party controls; their individual browser
contribution to the reported AntD geometry remains unmeasured in this task.

- Remove the whole-tree `all` reset. Keep Root size, position, isolation, theme
  tokens and Portal container behavior.
- Apply the smaller Preflight to individual presentation elements identified by
  existing `aui-*` classes, product `agent-ui-*` slots, and the upstream Button's
  own `data-slot=button` + `group/button` identity.
- Generic slots and utility-only markup cannot distinguish product presentation
  from business libraries. Add `data-agent-ui-owned` only where these existing
  identifiers are insufficient, in product components and generated adapters.
  Ownership never extends to arbitrary descendants or custom component children.
- Replace blanket protection against hostile Host CSS with explicit baseline
  property rollback on owned elements: box sizing, margin, padding, border,
  radius, font, color, background and list style. Direct Lucide icons preserve
  their layered display/box sizing. This preserves existing layered utilities
  and product themes rather than moving or rebuilding the theme system.
- Include ToolTimeline presentation in the existing generated adapter closure.
  Its controls opt into the baseline while Tool/business content stays outside
  that ownership. Regeneration applies ownership after localization using JSX
  parsing and updates adapter provenance deterministically.
- Preserve React and standalone Conversation selectors. No Portal routing,
  theme service, Plugin manifest, Runtime protocol, AG-UI, Creator selection or
  vendor source changes. No AntD selectors or library-specific compatibility CSS.

## Checks

See [checks/SUMMARY.md](checks/SUMMARY.md).

Selector regression tests cover ordinary business elements, generic third-party
`data-slot` values and content nested inside an owned component, in both formal
Root and standalone Conversation modes. CSS compilation uses the generated Host
stylesheet importing the built React package. Adapter regeneration, upstream
purity, official Sidebar/Composer/ToolTimeline policies and Portal containment
are checked independently of browser appearance.

The existing embedded browser fixture now explicitly identifies its owned
heading/input/list probes and includes foreign controls inside an owned
container. The added browser test checks that these retain Host rules. These
browser tests are **authored but not executed**.

## Pending acceptance

The clean AntD controls and generated business-notes Plugin comparison, A/C
Design System parity, hover/focus/disabled computed-style comparisons, Modal
visibility/stacking/focus/keyboard behavior, official component visuals, 1440/420
light/dark/violet and Web Component Shadow DOM matrix remain unexecuted. The old B
visual PASS remains withdrawn; this implementation does not reinstate it.

Static and unit checks do not establish any of those acceptance results. No
claim is made that the full repository or GitHub CI is green.
