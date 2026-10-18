# 更新中心 UI 优化验证 · 2026-10-18

本轮调整 Creator 更新中心的展示层，不改变升级协议、用户确认、npm 安装恢复或托管源码同步事务。

- 更新包集中为紧凑版本列表，完整 npm 包名、逐版本历史、已是兼容版本的包和工具依赖可展开查看。
- 确认卡突出实际升级项；不变的兼容依赖仍可查看。安装细节与主操作分层，保留应用层/托管源码的说明直接可见。
- 托管源码同步独立分区，统一定制提示、合并方案、差异和操作区样式。
- npm 确认卡具有独立焦点与滚动定位；所有新增文案使用 Creator locale 并提供中英文。

## 实际验证

- Creator typecheck、build、check:i18n 通过。
- CreatorPluginUpdates.test.tsx 与 package-update-api.test.ts：11 项通过，包括单独确认、取消、源码模型合并、恢复入口与兼容依赖折叠。
- 实际 Creator + 独立 Host + 本地 HTTP npm 候选 Registry：真实读取已安装依赖、在线检查、真实 npm 产物校验并生成计划、取消计划、390px 窄屏及离线缓存状态。浏览器错误为零；package.json 与 package-lock.json 不变。详见 visual-verification.json。
- 本轮未执行升级、未调用模型；完整真实模型升级/合并验收见 ../creator-real-npm-update-2026-10-18/README.md，本轮不将其算作重新验收。
- 本轮为展示层变更，未增加平台相关生产代码。验证脚本使用原生路径 API、fileURLToPath 和现有包管理器进程助手；未在原生 Windows 环境运行。旧 fixture 未修改。

## 截图

- 01-real-creator-updates.png：真实 Creator 与 Host 的完整窗口。
- 02-update-center.png：更新中心。
- 03-confirm-upgrade.png：实际产物校验后的升级确认。
- 04-narrow.png：390px 窄屏。
- 05-offline-cache.png：离线时明确显示缓存状态。

验证脚本 scripts/verify-update-center-redesign.mts 接收已有候选 Plugins releases.json、输出目录及官方 tgz 路径列表 archives.json。不会发布 npm 包或修改用户工程；仅初始化临时验证工程，结束时关闭服务并清理工程。
