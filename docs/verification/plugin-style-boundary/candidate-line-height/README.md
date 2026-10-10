# Withdrawn line-height candidate

These artifacts describe the experimental CSS at `4b4ce73e` / `88d87c6c`.
They are **not final acceptance evidence** for the retained implementation.

The candidate fixed Root-level A/C inherited height, but the full control delta
recorded 48 official geometry changes: ToolCall and TaskGroup controls inherited
different container leading before the change. Keeping a fixed control leading
of 1.5 did not preserve those contexts. Both CSS commits were reverted by
`c299c1a9` and `d406a523`; final CSS matches `f66c4129` byte-for-byte.

The archived REPORT was a work-in-progress candidate report. The authoritative
status, final source and retained-baseline measurements are in `../REPORT.md`
and `../computed-styles.json`. `PLUGIN_STYLE_BOUNDARY` was never accepted.
