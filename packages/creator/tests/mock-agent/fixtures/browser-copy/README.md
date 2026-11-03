# Browser clipboard fixtures

Captured through native Google Chrome 152 DevTools on macOS on 2026-10-27,
from a local test SSE request with five AG-UI events, 125 ms server intervals,
and a text delta containing Chinese, spaces, escaped tabs and escaped newlines.
Observed receive intervals differ from server intervals.

- `response.sse`: select all in Network → request → Response, copy, paste into
  a textarea and save its value without conversion.
- `eventstream.txt`: select a Data cell in EventStream, select all and copy,
  paste into the same textarea and save without conversion. Empty ID cells,
  tab-separated columns and receive times are browser output. Chromium's rendered
  table copy collapses repeated spaces in its Data cell; the raw Response does not.

These fixtures contain only synthetic local test data. Their timestamps are
wall-clock observations, independent of the machine timezone used for replay.
