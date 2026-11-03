# Web Search 与 Retrieval Tool UI

web-search 与 retrieval-chunks 是两个独立的官方 npm Plugin，项目拥有薄应用层。按实际安装 catalog 初始化入口，通过 AppUIModel applicationPlugins 启用；不因查看 Mock 场景而自动接管源码。

| Plugin | 后端工具名 | 展示 |
| --- | --- | --- |
| web-search | web_search | 查询与网页结果 |
| retrieval-chunks | search_docs | 查询与检索片段 |

它们只展示 canonical Runtime 已解析的 args、result 和 status，不向模型注册可执行 Frontend Tool，不执行搜索请求，不定义新的 AG-UI 事件。运行、错误、中断和无效结果沿用已有 ToolFallback。

## 业务结果

web_search 使用 query 和 results 数组，网页结果包含 title、domain 等该工具实际定义的字段。search_docs 使用 query 和 chunks 数组，片段包含 id、source、locator、score、text 等业务字段。这些是对应工具的结果合同，不是全局 AG-UI schema。

空数组是合法结果；数据形状不符合合同不能声称成功展示。专用 renderer 继续优先于通用 Tool fallback，重复具名注册在组合提交前报告冲突。

## 定制与验证

项目入口保留已安装公开组件的 DOM、结果数量、cycle 和 renderer props。产品文案使用 searchTools namespace，保留 Host 覆盖和正确的结果计数。先使用 props 和局部样式，内部实现变更才考虑明确源码接管。

验证标准工具事件、运行/完成状态、完整结果、空结果、错误/中断、无效 payload、语言、停用和重新启用，以及两个 Plugin 的独立性。Mock、静态、浏览器和真实后端结果分别记录。
