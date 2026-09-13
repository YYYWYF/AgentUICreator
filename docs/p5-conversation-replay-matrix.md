# P5-B Conversation / History Rich Replay Matrix

P5-B hydrates persisted Conversation REST data into the existing assistant-ui
Thread. It does not rerun a Mock Scenario, emit AG-UI lifecycle events, or
start an Agent run when a history item is selected.

| Conversation | Text | Reasoning | Tool | Plan | Status | Subagents | Sources | Attachments | Error |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 回放：Agent Elements | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | | | |
| 回放：Reasoning + Tool | ✅ | ✅ | ✅ | | | | | | |
| 回放：Sources + Attachments | ✅ | | | | | | ✅ | ✅ | |
| 回放：Tool Error | ✅ | ✅ | ✅ | | | | | | ✅ |
| 回放：长会话 | ✅ | ✅ | ✅ | | | | | | |

The three original conversations remain text-only compatibility fixtures:

- 分析 Agent UI 架构
- 调试 Tool Loading
- 设计 Mock Agent

## Contract boundaries

`messages` remains the backward-compatible text transcript. The optional
application-owned `replay` extension carries terminal Reasoning, Tool Call,
Agent Elements, Source, Attachment, and assistant status data. The Conversation
Service and REST handler do not import assistant-ui; only the adapter projects
the DTO into `ThreadMessage` values.

History Replay != AG-UI Event Replay.

Live AG-UI Sources remain `DEFERRED`. Persisted Conversation Replay Sources are
`SUPPORTED` by this pack. Mock-only `mock_agent_*` tools remain registered only
when the Agent endpoint is the development Mock Agent endpoint.
