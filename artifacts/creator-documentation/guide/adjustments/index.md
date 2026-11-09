# 调整布局与插件

把要调整的区域、目标尺寸和需要保留的功能告诉 Creator。本页于 2026 年 11 月 6 日在招行 AI 工作台中重新执行，基线是左侧聊天、右侧会话列表的平台式助理。

## 本次怎么说

> 当前 AI 工作台保持左侧聊天、右侧会话列表，只把右侧列表宽度改为 240px，小屏幕继续使用现有抽屉，不改方向。暂时隐藏附件按钮，保留它的配置以后可以恢复，保留发送、复制、导出 Markdown 和重试。其他内容和另外两种助理模板都不改。请直接完成这两项调整并校验。

## Creator 实际怎样处理

Creator 将列表宽度从 280px 改为 240px，保留现有的窄屏抽屉策略，并停用附件按钮实例。附件的配置与实现仍在，之后可以重新启用。组合配置及对应生成记录更新，类型检查和修改校验通过。

![Creator 完成两项调整后的回执。](/images/guide/examples/20261106/layout-reply.jpg)

## 桌面检查结果

实际页面中，会话列表仍在右侧，测得宽度为 **240px**。输入框中不再显示附件按钮，发送入口保留，名称与欢迎内容也保持不变。

![右侧 240px 会话列表，输入框附件按钮已隐藏。](/images/guide/examples/20261106/layout-desktop.jpg)

## 窄屏检查结果

在 390px 宽度下，列表使用原有抽屉。实际检查了打开、关闭和再次打开；关闭后，右上角的打开入口仍在可视范围内。

<details>
<summary>查看窄屏关闭与打开状态</summary>

![关闭抽屉后，右上角保留可见的打开入口。](/images/guide/examples/20261106/layout-narrow-closed.jpg)

![通过右上角入口打开会话抽屉。](/images/guide/examples/20261106/layout-narrow-open.jpg)

</details>

## 回复底部的操作

复制、重试和更多操作仍属于回复底部。导出 Markdown 位于“更多操作”菜单中；如果需要独立的导出按钮，应继续说明这个要求。

隐藏附件之后，本轮再次核对了复制的剪贴板内容和实际下载的 Markdown；点击“重试”后，页面完成第二个回复分支。

![附件隐藏后，回复底部的导出菜单仍可用。](/images/guide/examples/20261106/actions-hidden-attachment.jpg)

<details>
<summary>查看重新生成完成的页面</summary>

![隐藏附件后仍可重新生成，分支显示 2 / 2。](/images/guide/examples/20261106/actions-regenerate-after-hide.jpg)

</details>

更多检查方法见[检查修改结果](/guide/examples/verify-results.md)。

需要自己编辑布局和组合时，见[开发文档](/development/layout-and-composition.md)。
