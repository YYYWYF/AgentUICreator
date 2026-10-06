# Violet 全场景截图验证

日期：2026-10-06。46 张有效截图，全部来自真实组件；截图原始尺寸可从 [index.html](index.html) 打开。

## 覆盖

- 附件 ready/uploading/error、预览、移除后的 Composer。
- 图片生成、过滤失败、预览与 ImageZoom portal。
- 嵌套任务 working/waiting/failed/cancelled/done。
- ThreadList、真实 More 菜单、inline Rename。Delete 为立即操作，无确认框；不制造不存在的 UI。
- Button pointer/keyboard focus/disabled；Tooltip、Popover、Dialog 的 open/focus 和 disabled triggers。
- Markdown 标题/链接/引用/列表/GFM 表格/代码块及复制按钮。
- 可选前端 Form idle/error/success，Dialog，Generative UI vocabulary/selected state，AG-UI A2UI 表单和订单操作。
- 390px 真实 iframe viewport：Question、Task、Attachment error、Generative UI。DOM clientWidth/scrollWidth 均在记录里；不是缩放图片。
- Light/Dark 实际组件对照。

## 修改与边界

发现可选前端 Form/Dialog 未统一输入边框和操作色：仅添加产品拥有的稳定 data-slot 和 Violet presentation CSS。未改 vendor、状态流、事件、组件层级或 public API。Locale 文案不变。

运行圆点/部分运行进度条上游蓝色、内部任务/图片图标以及无 hook 的 checkbox/submit 标记保留 visual delta。网站 favicon 保留网站原色。可选插件没有因此加入默认 AppUIModel。

## 验证

- upstream guard 通过；theme/style 相关测试通过。
- 扩展测试共 56 项：53 通过，3 失败。失败包括 Slider 存在而旧断言期望不存在、Input defaultValue 返回 Door 而旧断言期望空字符串、A2UI ChoicePicker 的 radio/chips 实现与 select 查询不符。没有为通过测试修改行为。
- 浏览器 Host/Row/Portal 样式隔离 3 项通过；React build 通过。
- 截图是视觉验证，不代表生产上传后端、业务服务或所有运行链路验收。

## 可重现入口

仅开发 fixture：examples/creator-embedded-host/dev/violet-input/verification.html、optional-verification.html、narrow-verification.html。
运行：在 examples/creator-embedded-host 下执行 pnpm exec vite --config dev/violet-input/verification.vite.config.ts --port 5204 --strictPort。
详见 [capture-manifest.json](capture-manifest.json) 每个截图的 URL、输入状态和 AX 证据。失败 viewport 设置产生的 4 张非窄屏截图、1 张缺少 conversation scope 的试拍已从有效索引排除。

## 后续收口

本报告保留上一轮53/56的历史记录。旧断言、Form与focus修复及完整gate结果见[收口验证](closeout/REPORT.md)和[8张新截图](closeout/index.html)。
