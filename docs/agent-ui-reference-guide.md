# Agent UI Reference Guide

本文定义 UI Plugin 开发过程中应参考哪些 Agent UI 项目，以及各参考项目的职责边界。

目标不是复制某个框架，而是从不同项目中吸收成熟设计经验，形成项目自己的 Agent UI 体系。

---

## 1. 总体架构

本项目的稳定边界是：

```text
Agent Backend
      ↓
    AG-UI
      ↓
Frontend Agent State
      ↓
   UI Plugin
      ↓
 Ant Design
```

其中：

* **AG-UI** 定义 Agent 与前端之间的运行时语义。
* **Frontend State** 负责把事件转换成稳定的 UI 状态。
* **UI Plugin** 根据状态决定展示什么。
* **Ant Design** 负责最终组件实现。

Ant Design 是实现底座，不定义 Agent Runtime 或 Agent UI 数据模型。

开发时使用当前项目安装的 AntD API，不针对 AntD 5、AntD 6 或未来某个特定大版本进行设计。

---

# 2. Reference Stack

核心参考仅保留四个：

```text
                  Agent UI Design

CopilotKit
Agent UX
    ↓
assistant-ui
UI Primitive
    ↓
Ant Design X
AntD Interaction
    ↓
Ant Design
Implementation


                  Runtime Integration

AG-UI Events
    ↓
TDesign AIGC
Event → State Reference
    ↓
Frontend State
    ↓
UI Plugin
```

不要在开发一个组件时默认同时研究所有参考项目。

先判断当前问题属于哪一层，再选择对应参考。

---

# 3. CopilotKit

## 定位

**Agent UX / Agent Interaction Reference**

主要解决：

> Agent 的一种能力应该如何与用户和应用界面发生交互？

## 重点参考

包括但不限于：

* Human-in-the-loop
* Approval / Interrupt
* Shared State
* Agent Steering
* Frontend Tools
* Backend Tool Rendering
* Generative UI
* Agent 与应用状态协作
* 长任务执行反馈
* 用户介入 Agent Run

## 什么时候参考

当设计的是 **Agent 行为**，优先参考 CopilotKit。

例如：

```text
Agent 请求用户确认

Agent 希望用户补充信息

Agent 调用前端能力

Agent 修改应用状态

用户中途修改 Agent 的执行方向

Agent 生成动态交互 UI
```

这里关注的是：

```text
User
 ↕
Agent
 ↕
Application State
```

三者之间的交互关系。

## 不要照搬

不要因为参考 CopilotKit 而默认采用：

* CopilotKit Runtime
* CopilotKit React Architecture
* CopilotKit State Model
* CopilotKit SDK

本项目 Runtime 边界仍然由 AG-UI 定义。

---

# 4. assistant-ui

## 定位

**Agent UI Primitive / Component Anatomy Reference**

主要解决：

> 一个 Agent UI 应该拆成哪些组件，以及组件之间是什么关系？

## 重点参考

重点研究：

* Thread
* Message
* Composer
* Tool UI
* Tool Group
* Reasoning
* Attachment
* Sources
* Streaming Message
* Generative UI
* Artifact / Interactable UI

重点不是视觉，而是组件结构。

例如：

```text
Conversation
 ├─ UserMessage
 ├─ AssistantMessage
 │   ├─ Text
 │   ├─ Reasoning
 │   ├─ ToolCall
 │   └─ ToolResult
 │
 └─ Composer
```

## 什么时候参考

当问题是：

> “这个 UI Plugin 应该怎么拆？”

例如开发：

```text
AgentMessage
ToolCall
ToolResult
Reasoning
Composer
Conversation
Artifact
```

优先查看 assistant-ui。

## 不要照搬

不要让 Plugin 依赖：

* assistant-ui Runtime
* assistant-ui Message Model
* assistant-ui Thread State

组件结构可以参考，数据来源仍然来自项目自己的 Frontend State。

---

# 5. Ant Design X

## 定位

**Ant Design 风格 Agent UI Reference**

主要解决：

> 已经确定 Agent UI 的语义和结构之后，如何自然地用 Ant Design 风格表现出来？

## 重点参考

重点关注类似：

* Sender
* Thought Chain
* Sources
* Attachments
* Actions
* File / Folder
* Agent Input
* Agent execution feedback

例如执行过程可以参考：

```text
Agent Run
 ├─ Thinking
 ├─ Action
 ├─ Tool Call
 ├─ Tool Result
 └─ Complete
```

输入区域可以参考：

```text
Composer
 ├─ Text Input
 ├─ Attachments
 ├─ Context
 ├─ Capabilities
 ├─ Actions
 └─ Send / Stop
```

## 什么时候参考

当已经知道：

```text
这个组件是什么
+
它应该有哪些状态
```

下一步需要解决：

> “在 Ant Design 产品里应该怎么表现？”

此时优先参考 Ant Design X。

## 实现原则

参考的是：

* Component Anatomy
* Interaction Pattern
* Information Hierarchy
* State Presentation
* Density
* Expand / Collapse
* Action Placement

最终完全可以使用普通 AntD 组件实现，例如：

```text
Button
Card
Collapse
Flex
Space
Input
Upload
Tag
Badge
Typography
Progress
Drawer
Popover
```

不要求使用 `@ant-design/x`。

也不要因为参考 Ant Design X 而把项目绑定到它的 SDK 或 Runtime。

---

# 6. TDesign AIGC

## 定位

**AG-UI Event → Frontend State → Render Reference**

它主要不是视觉参考，而是 Runtime Integration 参考。

解决的问题是：

> AG-UI 的事件到达前端后，应该如何转换成可以稳定渲染的 UI 状态？

## 重点参考

包括：

* AG-UI Event handling
* Streaming
* Activity Snapshot
* Activity Delta
* Tool Call rendering
* Incremental update
* Error handling
* Event → State → Render
* Tool execution lifecycle

主要研究这一层：

```text
AG-UI Event
     ↓
Event Adapter
     ↓
Frontend State
     ↓
UI Component
```

## 什么时候参考

例如处理：

```text
流式 Message 如何更新

ToolCall 参数如何增量出现

ToolResult 到达后如何更新已有组件

Activity Delta 如何合并

Snapshot 如何恢复状态

Tool Call Error 如何映射

Run 状态如何驱动 UI
```

此时优先参考 TDesign AIGC。

## 不要照搬

不要因为参考其 AG-UI 实现而：

* 使用 TDesign 作为 UI 基础库
* 引入 TDesign Design Token
* 复制其视觉设计体系
* 让 TDesign State Model 成为项目公共协议

需要理解的是它的 **实现思路**。

---

# 7. 如何选择参考项目

开发前先判断当前问题。

### Agent 行为问题

例如：

```text
需要确认吗？
允许用户中断吗？
Agent 怎么修改应用状态？
Tool 是前端执行还是后端执行？
```

参考：

```text
CopilotKit
```

---

### UI 组件结构问题

例如：

```text
ToolCall Card 内部怎么拆？
Reasoning 是否属于 Message？
Composer 有哪些 Primitive？
```

参考：

```text
assistant-ui
```

---

### UI 表现问题

例如：

```text
ToolCall 怎么折叠？
执行状态怎么显示？
Sources 放哪里？
Composer 怎么布局？
```

参考：

```text
Ant Design X
```

---

### AG-UI 接入问题

例如：

```text
Delta 怎么处理？
ToolCall Event 怎么转换？
Streaming State 怎么维护？
```

参考：

```text
TDesign AIGC
```

---

# 8. 一个完整例子：Tool Call Plugin

假设需要实现：

```text
ToolCall
```

不要去同时复制四套库。

应该分层处理。

### ① Agent 语义

参考 CopilotKit：

```text
Tool 是否需要用户确认？
Tool 是否允许中断？
Tool 执行期间用户能做什么？
```

### ② Component Anatomy

参考 assistant-ui：

```text
ToolCall
 ├─ Header
 ├─ Tool Name
 ├─ Arguments
 ├─ Status
 ├─ Result
 └─ Actions
```

### ③ AntD UI 表现

参考 Ant Design X：

```text
Pending
Running
Completed
Error

Expand / Collapse
Status
Action placement
Result presentation
```

然后使用当前项目的 AntD 实现。

### ④ AG-UI State Mapping

参考 TDesign AIGC：

```text
TOOL_CALL_START
       ↓
create ToolCall state

TOOL_CALL_ARGS
       ↓
append arguments

TOOL_CALL_END
       ↓
arguments complete

TOOL_RESULT
       ↓
attach result
```

最后：

```text
AG-UI
  ↓
ToolCallState
  ↓
ToolCallPlugin
  ↓
AntD
```

---

# 9. 不需要主动参考的项目

以下项目不作为默认工程参考：

```text
Vercel AI Elements
Semi Design AI
其他 Chat UI Library
```

不是因为它们不好，而是核心能力已经被当前 Reference Stack 覆盖。

如果遇到特殊视觉或 Workspace 设计问题，可以临时研究，但不要增加为项目默认依赖或默认参考源。

---

# 10. 最终原则

Reference Project 的职责是提供答案：

```text
别人是怎么解决这个 Agent UI 问题的？
```

而不是：

```text
我们应该使用哪个框架？
```

本项目始终优先：

```text
1. Product Requirement
2. AG-UI Semantics
3. Plugin Contract
4. Project Frontend State
5. Reference Projects
6. Current AntD API
```

当参考项目与项目自身架构冲突时，以本项目设计为准。

最终目标是：

```text
借鉴成熟 Agent UI Pattern
        ↓
形成自己的 Agent UI Model
        ↓
使用 AntD 实现
```

而不是构建 CopilotKit UI、assistant-ui UI、Ant Design X UI 或 TDesign UI 的复制品。
