# Dialog 与 Form Frontend Tool 示例

Dialog 和 Form 是显式选择的业务示例，生产默认模板不包含这些示例业务代码。Mock 只发送确定的 AG-UI 事件，不理解自然语言或代替真实业务服务。

## 执行与展示

Plugin 在现有 activation 生命周期提供 Service，应用在 agent-contract/agent-tools.ts 中明确选择可暴露的前端操作。原生 toolkit 负责调用、结果、取消与 continuation。Tool UI 只呈现参数、状态和历史结果，不在挂载时打开弹窗、填表、提交或重置。

Dialog 的关闭、焦点、输入与当前业务状态属于实际 UI；历史 receipt 描述当时执行结果，不从当前页面反推历史状态。history、Thread 切换、StrictMode 和重挂载不得重放 execute。

## React Hook Form

可选 integration/react-hook-form 提供 ReactHookFormCapability、reactHookFormToolContracts 和 createReactHookFormFrontendTools。Factory 的 expose 列表明确选择工具；安装 Integration 本身不生成执行权限。

业务表单拥有字段、controller、验证和 submit handler。字段修改调用现有 controller API；提交走原生 submit 与相同的业务验证；清理属于当前表单生命周期。依赖来自目标项目实际安装的 resource requirements，不复制第三方实现或绕过现有 Tool allowlist。

## 资源与用户输入

资源 ID、依赖和组合来自实际安装 Plugins catalog。Creator 的官方资源安装先检查具体目标和依赖，再生成所需接线；安装或选择 Mock 不自动赋予业务操作权限。

会话中的用户信息收集由 ask-user-question / human-form 类 UI 提交客户端 Tool Result；后端审批则使用对应 structured interrupt/resume。沿用实际场景协议，不能把二者混用或伪造后端重复结果。

## 验证范围

核对每次 live execute 只产生一次副作用，历史 renderer 不填表、不提交、不重置、不重新打开弹窗。检查 Provider 停用后的工具可用性、参数校验、取消、错误及实际用户确认。静态、Mock、真实业务与浏览器结果分别验证。

通用规则见 [Frontend Tool 生命周期](frontend-tool-lifecycle.md)。
