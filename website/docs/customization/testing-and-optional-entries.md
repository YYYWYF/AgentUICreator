---
title: 可选实现与依赖选择
---

# 可选实现与依赖选择

本页帮助你判断是否需要额外的组件实现或依赖。先用项目已有的公开组件与应用层扩展完成需求；需要标签输入、受控动态组件等能力时，再选择对应实现。

## 按需求选择

| 需求 | 实现入口 | 接入说明 |
| --- | --- | --- |
| 将提及与指令显示为标签 | Plugins `/lexical` | [Lexical 输入](../plugins/lexical-composer-input)与[历史编辑](../plugins/lexical-edit-composer)。 |
| 展示受控动态组件 | Plugins `/generative-ui` 与对应样式 | [Generative UI 定制](./generative-ui)，先定义允许的组件与动作。 |
| 在自定义组件中识别主题 | Plugins `/theme` | [主题与色彩方案](./themes)，与当前共享主题服务保持一致。 |
| 本地演示附件交互 | Plugins `/demo-attachments` | 仅开发示例；正式应用使用[业务附件适配器](../integration/attachments-dictation-feedback)。 |

普通文本输入无需仅为语音、附件或命令按钮而更换编辑器。图表、文件、来源和检索使用对应 [Plugin](../plugins/)，仍需匹配的业务数据。

## 核对依赖与交付

检查目标工程实际安装版本的公开出口、peer 要求与现有 UI 栈，再决定是否增加依赖。把所需实现、样式和声明纳入生成项目自己的构建；不从 Creator 的依赖中借用运行能力。

可选出口不表示默认启用，也不表示支持任意 A2UI 数据。安装后用实际组件、数据和操作验收，步骤见[验证定制](./test-customizations)。测试连接入口也在该页说明。

> 截图待补：普通输入与标签输入对照、允许的动态 UI 与无效数据提示，标明所需可选依赖。
