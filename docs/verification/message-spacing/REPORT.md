# Conversation message spacing

Date: 2026-10-13

## Change

Message composition owns the existing 16px inter-part gap. Empty scoped Plugin
instances and chain-of-thought groups containing only empty children leave flow.
Whitespace-only text/reasoning parts do not mount presentation containers. This
does not modify persisted content, runtime grouping or AG-UI data.

Reasoning root outer margins are normalized only when directly composed in a
message stack, including the scoped Plugin wrapper. Independent Reasoning roots
retain the upstream 16px bottom margin. Disclosure padding and Markdown paragraph
spacing are unchanged. Vendor source and generic Plugin Runtime are unchanged.

## Actual recording follow-up

The user supplied `http://127.0.0.1:5176/`. The selected recording was
`子Agent翻译回放`. It reproduced a case missed by the original single-message
matrix: reasoning/task/reasoning and final text arrive as two top-level assistant
messages in the same user turn. Violet theme used a 28px message gap and also
overrode the Markdown first paragraph's margin to 8px. The measured distance
from the final reasoning border to the final paragraph box was 36px.

The composition now uses the existing turn projection to identify continuation
messages, giving those a 16px margin while preserving the 24px default / 28px
violet gaps across user-turn boundaries. Product Markdown first/last block edges
are reset without removing internal paragraph spacing.

The real Host recording was replayed and its DOM measured: final reasoning to
paragraph is now 16px both collapsed and expanded, and remains 16px with the
nested TaskCard expanded. `replay-fixed.jpg` shows this actual Host session.
Build and typecheck passed; the scoped integration, cancelled-empty and turn
projection suites passed 35 tests. Browser regression coverage now additionally
includes split replies and new-turn boundaries in all three themes at 420/1440px.
The six split-reply cases passed in a focused rerun after correcting their user
message fixture (assistant-only status/metadata must not be attached to users).
All twelve original combination/streaming cases also passed after the production
changes; the earlier combined invocation's five failures were these fixture errors
and are superseded by the focused six-case rerun.

## Initial validation

- `@agent-ui/react build`: passed, including public/lexical declaration checks.
- `@agent-ui/react typecheck`: passed.
- Scoped renderer integration, scoped renderer bridge and cancelled-empty
  presentation suites: 27 tests passed.
- Chromium browser matrix: 12 tests passed (96 completed combinations and six
  streaming runs). Themes: light/dark/violet; widths: 420/1440px. Combinations:
  text, empty parts, reasoning, reasoning/tools/text, hidden reasoning renderer,
  tool timeline, cancelled and error; scoped overrides enabled/disabled.
- Every measured visible sibling boundary in the message and thought stacks was
  16px, including after expanding/collapsing disclosures and stream completion.
- Independent upstream Reasoning root bottom margin remained 16px.
- A focused 420px rerun passed after strengthening assertions that an entirely
  empty reasoning group leaves flow and empty reasoning parts mount no card.
- Browser fixture uses the real assistant-ui local runtime and public conversation
  components, with scoped Plugin instance markup matching the Runtime renderer.
  The unit integration suite exercises the actual Plugin Runtime.

The PNGs show the mixed completed case; JSON files record its measured gaps.
Browser regression source: `apps/creator-workbench/tests/message-spacing.spec.ts`.

## Custom Chart follow-up

The actual `data-message-chart` Demo was run at `http://127.0.0.1:5176/`.
The chart figure's 12px top/bottom margins combined with message stack / turn
continuation spacing to produce 28px above and below the figure. The message
composition stylesheet now resets only a directly composed Chart root's block
margins, preserving its standalone margins and internal caption/row spacing.

Measured on the actual Host after the change: 16px above and 16px below. See
`chart-replay-fixed.jpg`. Six Chromium regression cases passed across
light/dark/violet themes at 420/1440px, using the real Chart renderer via
DataMessageUIRegistration. Each case also verifies the standalone Chart still
has 12px block margins. Build and typecheck passed. No Windows physical run.

## Platform and scope

Validation ran on macOS Chromium. No physical Windows run was available. Changes
are CSS and React presentation conditions, with no filesystem/process changes.
The browser fixture uses native Node path APIs and the existing pnpm process
helper was used to invoke validation. The supplied recording was replayed on the
actual Host during the follow-up. Arbitrary third-party Plugin internal spacing
is not globally reset by this change.
