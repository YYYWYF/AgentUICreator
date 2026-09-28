# Dictation Adapter 接入

默认 `assistant`、`embedded`、`platform` preset 已将 `assistant-ui-dictation-action` 放在 Composer 的 `trailingActions`。生成项目不配置语音转录时，assistant-ui 的 `thread.capabilities.dictation` 为 `false`，麦克风按钮不会显示。

语音转录由 Host 应用实现 assistant-ui 的 `DictationAdapter`，通过生成项目的公开入口传入：

```tsx
import { Agent, type AgentProps } from "./agent-ui";
import { createMyDictationAdapter } from "./dictation/my-provider";

const dictationAdapter: NonNullable<AgentProps["dictationAdapter"]> =
  createMyDictationAdapter({ endpoint: "/api/transcribe" });

export function App() {
  return <Agent dictationAdapter={dictationAdapter} />;
}
```

`createMyDictationAdapter` 是应用自行提供的实现，不包含在默认模板中。它应返回官方 `DictationAdapter`：`listen()` 创建一个 Session，负责录音、停止或取消，以及发送临时和最终转录结果。Runtime 会将 Adapter 交给 assistant-ui；Composer 文本与能力状态由 assistant-ui 管理。无需修改 AppUIModel、Dictation Action Plugin 或 AG-UI 协议。

生产环境请通过应用后端代理长期有效的第三方 STT 凭据。浏览器可将音频上传到 `/api/transcribe`，或使用由应用后端控制的流式连接与短期令牌；不要把长期 API Key 打包到前端。
