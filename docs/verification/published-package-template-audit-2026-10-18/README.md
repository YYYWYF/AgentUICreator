# 发布包与官方模板能力接入核对

## 结论

源码随 Plugins npm 包交付的能力已存在，并在真实 pnpm pack 产物中验证；读取已安装包的源码无需自建接口。不能把当前状态表述为“七个包现在直接发布即可全部正常使用”：正式发布构建门禁失败，在线更新发现仍仅接入宿主配置的兼容清单 URL，没有默认 npm registry 版本发现。

## 实际打包核对

执行 scripts/audit-packed-plugin-sources.mts，实际打包全部七个包；未发布。结果在 packed-payloads.json。

- Plugins tarball 内包含 802 个源码文件、catalog.json、78 个 Registry 资源。
- catalog 63 个条目，45 个含接管快照（包含历史兼容条目，不等同于现代插件个数）。1088 条源码、应用模板、接管快照和匹配运行产物记录逐条核对 SHA-256。
- 从实际 tarball 解包后，使用正式 Registry loader 读取 dist/resources/registry，成功加载全部 78 个资源。
- 示例可读路径：dist/sources/plugins/composer/upstream、dist/sources/plugins/composer/adapters、dist/sources/takeover/composer/adapters/composer.tsx。
- Operator 包包含薄应用层、接管及同步实现，和 platform、assistant、embedded 三套 presets。
- Creator 包包含更新 UI/API、props 优先与确认接管策略，以及默认 8192 的 Python 配置。
- 全部七个包正式依赖范围不残留 workspace:。

## 正式路径核对（代码与打包资产，不冒充独立安装全流程验收）

- 官方初始化调用 initializeAgentUIProject → createAgentUIInitializationHost → writeGeneratedPluginRegistry → ensurePluginApplication；同一条生产路径生成本地薄应用层，默认引用 Plugins 的公开 npm 入口。
- Creator 正常服务 creatorHttpService 注册更新 API；domain agent 的正式 prompt 和工具策略包含 props 优先与单独 takeover_plugin_source 确认。
- Operator 的 takeover 与 owned-source 更新读取目标工程精确安装包的 catalog、摘要和源码；不依赖仓库验证脚本或 localhost 候选更新源。
- 打包后的 Registry loader 通过 Plugins 公开 catalog.json export 定位资源。源码模式才有 workspace authored-assets 分支。
- 模型服务地址和凭据属于正常工具宿主配置；不随生产 App 发布，也不应打入模板。

## 仍未具备的发布条件

1. scripts/build-public-packages.mjs 在 Runtime 的独立消费者类型检查失败。详见 build-public-packages.log：上游声明引用 setImmediate、Plugins Collapsible 声明冲突、NodeNext 扩展名、缺失公共声明。没有修改旧 fixture 或隐藏此门禁。
2. createCreatorUpdateHandler 目前只选择显式 provider 或 CREATOR_UPDATE_MANIFEST_URL；没有默认官方地址，也没有自动查询 npm registry 的 provider。源码读取与此无关。若希望不维护额外服务，应接入 npm registry 版本发现，并设计兼容/变更清单随包读取，不可把各包 latest 无条件拼为兼容版本组合。
3. 对 registry.npmjs.org 的七个包匿名元数据查询均返回 404。这仅说明当前匿名公开查询不可用（未公开或私有），不推定私有 registry 状态；本轮没有执行发布。

releases.example.json 是由正式兼容清单 parser 校验的结构示例，版本为示意值，不代表真实已发布版本，也不是 npm registry 原生响应。

## 边界

本轮没有修改运行代码或官方模板，没有修复旧 fixture；新增的是审计脚本与结果。tarball 解包检查使用原生 path 和安全归档解析，pnpm 使用仓库跨平台助手。未进行原生 Windows 验收，也没有宣称全新用户离线/免配置模型服务可用。
