# Dialog 示例与业务表单 Frontend Tool 接入

Dialog 是显式选择的业务示例，生产默认模板不包含其业务代码。业务页面上的表单直接通过通用 Frontend Tool 接入，不再交付表单专用 Integration、工具工厂或填表 Demo。Mock 只发送确定的 AG-UI 事件，不理解自然语言或代替真实业务服务。

## 执行与展示

Plugin 在现有 activation 生命周期提供 Service，应用在 agent-contract/agent-tools.ts 中明确选择可暴露的前端操作。原生 toolkit 负责调用、结果、取消与 continuation。Tool UI 只呈现参数、状态和历史结果，不在挂载时打开弹窗、填表、提交或重置。

Dialog 的关闭、焦点、输入与当前业务状态属于实际 UI；历史 receipt 描述当时执行结果，不从当前页面反推历史状态。history、Thread 切换、StrictMode 和重挂载不得重放 execute。

## 业务页面已有表单

Host 从 Runtime 公开入口调用 `createAgentUIFrontendTools()`，再将稳定的来源传给 `<Agent frontendTools={tools} />`。工具定义声明业务参数，在 `execute` 中校验 unknown 输入并调用已有表单的方法。此路径不要求额外的 Plugin、Service 注册或 AppUIModel 修改，与项目原有前端工具合并后进入同一条 canonical 执行、结果回传与 continuation 链路。

业务工程拥有字段类型、表单库、验证和 submit handler。AntD、React Hook Form 等均复用项目实际安装版本的公开接口。填值和提交分别授权，填入字段的结果不能标成已保存；如开放提交，应等待校验与业务保存实际完成后返回结果。程序化赋值涉及业务联动时，显式复用已有业务方法，不假设它与人工输入触发完全相同的回调。

跨 Plugin 共享的能力仍可使用声明式 Service 生命周期，但普通 Host 表单不为调用工具而新增 Service。多表单使用明确的业务工具名及对应实例，避免注册同名工具或将调用路由到错误的表单。取消不自动撤销已经完成的字段修改或业务保存。

AntD Form 的完整代码与检查步骤见[前端工具接入](../../website/docs/development/frontend-tools.md#antd-form-直接接入)。该示例仅填表，保留用户点击保存的原有校验和业务流程。

## 资源与用户输入

资源 ID、依赖和组合来自实际安装 Plugins catalog。Creator 的官方资源安装先检查具体目标和依赖，再生成所需接线；安装或选择 Mock 不自动赋予业务操作权限。

会话中的用户信息收集由 ask-user-question / human-form 类 UI 提交客户端 Tool Result；后端审批则使用对应 structured interrupt/resume。沿用实际场景协议，不能把二者混用或伪造后端重复结果。

## 验证范围

核对每次 live execute 只产生一次副作用，历史 renderer 不填表、不提交、不重置、不重新打开弹窗。检查 Provider 停用后的工具可用性、参数校验、取消、错误及实际用户确认。静态、Mock、真实业务与浏览器结果分别验证。

通用规则见 [Frontend Tool 生命周期](frontend-tool-lifecycle.md)。
