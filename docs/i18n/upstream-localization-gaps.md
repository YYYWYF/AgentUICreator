# Pinned upstream localization gaps

Revision: `3542d602272a62eddeb8989befc910841c267022` in the local assistant-ui
checkout. Clean installed vendor has no product localization edits.

| Surface | Default upstream copy | Missing seam / disposition |
| --- | --- | --- |
| Reasoning trigger | `Reasoning`, duration suffix | Handled by a guarded product adapter generated from clean vendor; disclosure and animation remain upstream-owned. |
| Tool group trigger | count plus `tool call(s)` | Handled by a guarded product adapter; count/active state and disclosure behavior are unchanged. |
| Tool fallback | run status, error headings, approval receipts and confirmation copy | Handled by guarded product recipes. Agent-provided prompts, options, errors and protocol result constants remain data. Approval callbacks and continuation behavior are unchanged. |
| Audio/video player | play/pause, seek, default video title | Handled by guarded product recipes for audio play/pause, seek, progress, playback failure and video accessible title. Native video controls retain browser-owned localization. Playback behavior is unchanged. |
| Encoded or media file presentation | unnamed-file fallback, download labels | Handled by guarded File and media adapters, plus public URL composition. File names and payloads remain data; parsing, byte counts, URL safety and download behavior are unchanged. |
| Upstream-only exported primitives | labels in controls used directly by custom Hosts | Hosts can use public composition/props where supported; untouched vendor exports keep upstream defaults. Audit each adopted control instead of patching all vendor examples. |

Attachment, image, quote, dialog, sidebar and existing product integration labels
are handled in guarded generated adapters, with provenance regenerated from the
clean vendor. Search widgets use their existing label props. These changes do not
add product copy to upstream source.

Recheck this inventory when the pinned revision changes. An upstream label prop
or composition seam should replace a gap; absence of one should remain recorded.

Task summaries, task state accessibility and trigger item group names are also
handled in guarded product adapters. Public thread-list wrappers supply localized
defaults and preserve explicit caller overrides. Every recipe checks anchor
counts; changed upstream presentation requires review, never a vendor patch.

The follow-up audit also covers attachment tile accessible names (including
uploading and failure), TaskCard state accessibility, and both generated and
product-owned TaskGroup summaries. The canonical TaskGroup composition imports
localized TaskCard and ToolFallback adapters; direct vendor presentation imports
must not bypass these seams. Backend error details and attachment names remain
data and are not translated.
