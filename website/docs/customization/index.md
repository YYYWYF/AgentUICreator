---
title: 选择合适的定制层
---

# 选择合适的定制层

本章面向需要改布局、样式、组件组合或展示行为的开发者。上传、语音、历史和前端工具等业务服务接入见[应用接入与部署](../integration/)，创建独立组件见[插件开发](../plugins/development)。

先说明希望改变的效果，再选择文件层。AppUIModel 管布局和语义组合，项目 Plugin 代码管 props、children、renderer 与行为，Runtime 负责确定性渲染。

| 需求 | 首选位置 |
| --- | --- |
| 改宽度、顺序、区域、启用状态 | AppUIModel 和语义 Slot。 |
| 换标题、样式、动作或 renderer | 项目拥有的 Plugin 应用层。 |
| 新增独立 UI 能力 | 新建项目 UI Plugin 并注册。 |
| 公开 API 无法满足的实现改动 | 先检查接口与适配器，再讨论具体 Plugin 源码接管。 |

## 按修改目标选择

- 布局与外观：调整位置、尺寸、默认主题、品牌样式和翻译。
- 组件与交互扩展：通过应用层 Props、命令来源、状态、事件和 renderer 定制表现。
- 实现维护与验证：选择可选实现、必要时接管某个 Plugin 源码，再验证定制。

## 从应用层开始

官方 Plugin 默认通过薄应用层导入 npm 实现。该层从初始化起就属于项目，调整它不需要接管实现。使用公开支持的 props 和组合，不把函数、组件或上游 primitive 参数塞进 JSON。

需要隐藏详细推理时，停用 reasoning 的语义贡献；只折叠组件仍允许用户展开，效果不同。需要扩展底部动作时，保留 response-footer 的原动作组合，再追加项目控件。

## 实现所有权

源码接管先展示逐 Plugin 计划并取得明确同意。工具从工程实际安装版本提取实现，保留应用层、ID、Slot 和配置，只切换实现 import。后续 npm 升级不能覆盖这些文件或推进源码基线。

不要编辑共享 Runtime、framework 或 vendor 来绕过扩展接口。UI 栈由生成项目自己选择，Creator 不规定 Ant Design、MUI、Tailwind 的 major。

> 截图待补：同一需求分别对应布局、应用层与接管实现的文件位置关系，标注所有权。

布局字段见 [AppUIModel 参数](./app-ui-model)，Plugin 声明见[定义与生命周期](../plugins/plugin-contract)，可选实现与测试入口见[能力参考](./testing-and-optional-entries)。

继续：[布局](./layout-and-composition)、[应用层](./application-layer)、[自定义 Plugin](../plugins/create-plugin)、[接管](./source-takeover)。
