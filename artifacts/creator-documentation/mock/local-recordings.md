# 本地数据回放

从浏览器复制一次 Agent 请求的流式响应，保存到当前工程的 `.agent-ui/mocks/`，即可通过 Mock 服务反复回放。

## 1. 在 F12 中找到 Agent 请求

下面以 Chrome 为例：

1. 打开正在调用 Agent 的前端页面，按 **F12** 打开开发者工具。macOS 可按 **⌘⌥I**。
2. 切到 **Network（网络）**，可选 **Fetch/XHR** 缩小范围。
3. 在页面助理中发送消息，等待本次回复结束，再点击列表中新出现的 Agent 请求。

在 **Headers（标头）** 中核对请求地址；SSE 响应的 `Content-Type` 为 `text/event-stream`。截图中的请求名是 `agent`，实际名称取决于工程接口。

![在 Network 中选择 Agent 请求，并在 Headers 中查看请求地址和 text/event-stream 响应类型](/images/guide/mock-replay/01-network.png)

## 2. 复制 EventStream 或 Response

两种方式任选其一。下面的 **Ctrl+A / Ctrl+C** 在 macOS 对应 **⌘A / ⌘C**。

**EventStream：保留事件间隔**

切到 **EventStream**，点击 **Data** 列中的任意一条事件，再按 **Ctrl+A** 全选、**Ctrl+C** 复制。复制整组记录，连同 **Time** 列一起保存，回放时会保留事件之间的间隔。

![EventStream 中的 AG-UI 事件和 Time 接收时间列](/images/guide/mock-replay/02-eventstream.png)

**Response：复制原始 SSE**

切到 **Response（响应）**，点击响应正文，再按 **Ctrl+A** 全选、**Ctrl+C** 复制。保留原来的 `data:` 和空行；这份内容没有接收时间，回放默认每条事件间隔 **100 毫秒**。

![在 Response 中全选原始 SSE 响应，保留 data 前缀和事件间的空行](/images/guide/mock-replay/03-response.png)

## 3. 粘贴并保存到工程目录

用编辑器新建一个 UTF-8 文本文件，粘贴复制内容，保存到**工程根目录下的 `.agent-ui/mocks/`**。目录不存在时创建，文件名可自定，例如：

```text
你的工程/
├── package.json
└── .agent-ui/
    └── mocks/
        ├── eventstream.txt
        └── response.sse
```

支持 `.txt`、`.sse`、`.json` 和 `.jsonl`，格式按内容自动识别。直接保存复制结果即可，无需清理表头、空列、额外空格或制表符，也无需添加 `atMs`、包装 `event`。消息正文中的空格和换行按复制内容保留。

## 4. 在 Creator 中选择并回放

回到工程页面，点击 Creator 顶部的圆形箭头刷新，再从右上角齿轮打开 **示例与回放**。保存的文件会出现在 **本地 Mock** 中，按文件名选择；文件较多时可用 **搜索 Mock** 查找。

![本地 Mock 列表显示保存目录提示，以及 eventstream 和 response 两份文件，eventstream 已选中](/images/guide/mock-replay/04-local-files.png)

按[启动与连接](/mock/getting-started.md)启动服务并连接页面助理，发送一条消息触发回放。修改文件后，刷新并重新发送消息即可检查结果。

播放时长倍率对以上格式均生效，只调整事件间隔，不改变事件内容和顺序。

仅复制事件 JSON、没有时间信息时，也使用每条 `100` 毫秒的默认间隔。复制的数据须为 AG-UI 事件，并包含要验证的完整交互；截断的 JSON 或无效事件会显示读取错误。

## 精确指定播放时间

需要自行控制每条事件的时间时，仍可使用 JSONL：每行一个 `{ atMs, event }`，`atMs` 为相对开始的毫秒数，须非负且不递减。

```jsonl
{"atMs":0,"event":{"type":"RUN_STARTED","threadId":"demo-thread","runId":"demo-run"}}
{"atMs":50,"event":{"type":"TEXT_MESSAGE_START","messageId":"demo-message","role":"assistant"}}
{"atMs":100,"event":{"type":"TEXT_MESSAGE_CONTENT","messageId":"demo-message","delta":"Hello from a local recording."}}
{"atMs":150,"event":{"type":"TEXT_MESSAGE_END","messageId":"demo-message"}}
{"atMs":200,"event":{"type":"RUN_FINISHED","threadId":"demo-thread","runId":"demo-run"}}
```

## 文件限制

只读取 `.agent-ui/mocks/` 目录直属的文件。单个文件最多 `8 MiB`、`20,000` 个事件，相对时长不超过 `24` 小时。时间倒退、文件内容不完整或无效事件会报错，修正后刷新即可。
