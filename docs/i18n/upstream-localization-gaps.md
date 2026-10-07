# Pinned upstream localization gaps

Revision: `3542d602272a62eddeb8989befc910841c267022` in the local assistant-ui
checkout. Clean installed vendor has no product localization edits.

| Surface | Default upstream copy | Missing seam / disposition |
| --- | --- | --- |
| Reasoning trigger | `Reasoning`, duration suffix | Trigger owns its internal label; no label replacement prop. Keep its disclosure and animation implementation intact. |
| Tool group trigger | count plus `tool call(s)` | Count/active props control state; the internal count phrase has no label prop. Retain upstream presentation. |
| Tool fallback | run status, error headings, approval receipts and confirmation copy | High-level fallback has no complete localized label contract. Agent-provided prompts/options remain data. Keep approval and continuation behavior upstream-owned. |
| Audio/video player | play/pause, seek, default video title | Internal player controls do not expose all labels. Preserve playback behavior. |
| Encoded or media file presentation | unnamed-file fallback, download labels | The high-level File renderer does not expose nested labels. URL file cards use public Name/Download composition overrides; encoded payload size/parsing and media presentation remain upstream-owned. |
| Upstream-only exported primitives | labels in controls used directly by custom Hosts | Hosts can use public composition/props where supported; untouched vendor exports keep upstream defaults. Audit each adopted control instead of patching all vendor examples. |

Attachment, image, quote, dialog, sidebar and existing product integration labels
are handled in guarded generated adapters, with provenance regenerated from the
clean vendor. Search widgets use their existing label props. These changes do not
add product copy to upstream source.

Recheck this inventory when the pinned revision changes. An upstream label prop
or composition seam should replace a gap; absence of one should remain recorded.
