# 接入引导用户旅程验证（2026-10-18）

## 结论

React 在所需依赖已安装的独立临时工程里可完成初始化、构建与宿主会话联动。Vue 默认 Web Component 的自动应用和手动接入可构建并实际收发消息，但当前 Vue 新用户从初始化到定制界面嵌入的完整旅程未通过。

## 执行与结果

| 路径 | 实际验证 | 结果 |
| --- | --- | --- |
| 干净 Vue 工程首次启动 | 最新 Operator/Creator 正式构建，CLI 启动，正式 Creator UI 选择嵌入式并初始化 | 阻塞：统一 React 初始化要求 React、Lexical 和 Agent UI 生产依赖；没有进入接入引导 |
| React 初始化 | 临时 React/Vite 工程复用已有独立 npm 消费者的依赖，正式 UI 初始化 | 通过 |
| React 生成界面与 Provider | 新生成入口，业务组件与 Agent 在同一 Provider 内，严格类型检查和生产构建 | 通过 |
| React 浏览器宿主联动 | 业务按钮发消息，状态显示 running；卸载 Agent 后仍能发送；重新挂载显示两次回复 | 通过：两次请求 threadId 相同，消息数量从 1 增至 3 |
| Vue 真实模型只读指南 | 现有 live guide 测试，实际模型、目标选择、Operator 配方、零消费者写入 | 1 项通过；此旧 fixture 预写项目配置，不覆盖初始化 |
| Vue 当前引导原文 | 从 zh-CN 字典读取 bridgePrompt，实际模型调用 plan/inspect，再生成 canonical recipe | 已询问展示区域、官方资源准备与执行方式，未继续批准；见 exact-prompt-result.json。fixture 缺少实际 React 生产工程，不计为当前定制界面接入完成 |
| Vue 自动桥接 | Operator 正式协议生成并应用配方，保持原 package.json/src/main.ts，类型检查与构建，浏览器收发消息 | 通过，使用官方默认编译资源 |
| Vue 手动桥接 | 只准备资源，再按同一个 canonical recipe 写入 Vue 文件，只读验证，类型检查与构建，浏览器收发消息 | 通过，使用官方默认编译资源；手动文件操作由测试执行，不计为真人可用性测试 |

## 发现的缺口

1. Vue 与 React 目前共用 React 源码初始化入口。Vue 用户只安装启动 Creator 后，会停在依赖错误页，尚不能抵达 Vue 接入说明。不能通过向 Vue 工程补装整套 React 生产依赖来掩盖此边界问题。
2. 当前兼容接入可复制官方默认 Web Component，但尚缺少当前定制 React 生产工程及其构建产物与 Vue 消费工程的完整绑定。默认资源可运行，不证明用户选择/定制的模板已交付。
3. 旧 live apply/manual 测试假定首次中断仅询问目标页面。本次模型已提前生成配方、询问执行方式，测试在 answer() 目标匹配断言处失败，未到 apply。此失败不能被描述为自动接入执行失败，也不能算模型自动接入通过。本轮未修改旧脚本以消除断言。

## 检查范围

- 最新 Operator 与 Creator 构建通过。
- Runtime host-provider、Renderer host-provider-integration、Operator integration-recipe 定向测试命令整体通过；Operator 配方为 11 项。
- React、Vue 自动、Vue 手动临时工程的类型检查与生产构建分别通过；日志见同目录。
- AG-UI 回复来自本地 HTTP SSE 测试端点，未验证真实 Agent 后端。Creator 指南调用的是实际模型服务，未替换模型或伪造工具结果。
- 临时工程复用了本机已安装依赖（node_modules 链接）；未重新进行公共 npm 安装、全套独立 tarball 安装或真人可用性验收。Vue Vite 验证使用各自缓存目录，避免共享依赖缓存竞争。
- 没有 Windows 实机验收；以上 macOS 结果不代表 Windows 验收。
- 未修复上述初始化/生产工程绑定缺口；本轮产品代码无额外架构修改。

## 浏览器截图

- [Vue 首次初始化阻塞](vue-initialization-blocked.jpg)
- [React Provider 联动通过](react-provider-passed.jpg)
- [Vue 默认界面自动接入通过](vue-auto-passed.jpg)
- [Vue 默认界面手动接入通过](vue-manual-passed.jpg)
