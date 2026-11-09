# 对话定制示例

直接描述想改哪里、希望变成什么样、哪些功能需要保留，Creator 会检查工程并选择修改位置。下面使用准备好的「招行客户服务工作台」，Creator 使用当前源码构建，模型为 `deepseek-v4.1-flash`。

## 本组使用的工作台

工作台保留三个入口各自的助理形态，不在定制时互相替换：

| 工作台入口  | 助理形态               |
| ------ | ------------------ |
| AI 工作台 | 平台式助理，左侧聊天、右侧会话列表  |
| 服务工单   | 悬浮球助理，点击悬浮球展开或收起面板 |
| 业务协同   | 嵌入式助理，与工单列表并排显示    |

常见调整以「AI 工作台」的平台式助理为基线：

![招行 AI 工作台的平台式助理，左侧为聊天区域，右侧为会话列表。](/images/guide/examples/20261106/cmb-platform-right-before.jpg)

<details>
<summary>查看服务工单与业务协同入口</summary>

服务工单保留悬浮球入口：

![服务工单页面右下角的悬浮球助理入口。](/images/guide/examples/20261106/cmb-tickets-floating.jpg)

业务协同使用独立的嵌入式助理：

![业务协同页面中的工单列表与右侧嵌入式助理。](/images/guide/examples/20261106/cmb-embedded-final.jpg)

平台助理完成样式调整后，也重新打开了服务工单的悬浮面板；它仍使用独立的助理界面：

![服务工单仍保留悬浮球展开的助理面板。](/images/guide/examples/20261106/cmb-tickets-assistant-final.jpg)

</details>

## 按需求查看示例

| 想调整什么            | 示例                                                      |
| ---------------- | ------------------------------------------------------- |
| 名称、头像、欢迎语和推荐问题   | [修改名称与欢迎内容](/guide/examples/brand-copy.md)              |
| 会话栏宽度、按钮位置和功能开关  | [布局与插件组合](/guide/adjustments/index.md)                  |
| 品牌色、圆角、字号和主题     | [主题与样式](/guide/adjustments/themes.md)                   |
| 输入提示、可访问名称和中英文   | [语言与文案](/guide/adjustments/localization.md)             |
| 搜索员工和填入工单查询草稿    | [@ 提及与命令菜单](/guide/adjustments/mention-and-commands.md) |
| 助理与业务页面选中同一张工单   | [业务状态与页面联动](/guide/adjustments/state-and-events.md)     |
| 将查询结果显示为工单卡片     | [工具与结果展示](/guide/adjustments/custom-renderers.md)       |
| 按 Agent 数据显示筛选表单 | [动态界面](/guide/adjustments/generative-ui.md)             |
| 在对话区增加当前工单卡片     | [增加新的界面功能](/guide/add-function.md)                      |

## 怎样描述需求与继续调整

提供目标文案、尺寸或交互，并说明要保留的内容。只想了解现状时，明确说「先不要修改文件」；需要接业务功能时，将实际接口说明、返回样例和页面操作说明一起提供。

页面有偏差，就继续描述看到的问题。例如「卡片标题下面重复了同一句话，去掉重复内容，点击后发送的问题不变」。不必先替 Creator 找文件或指定实现代码。

## 在哪里检查结果

先看 Creator 的实际回复和修改回执，再检查页面显示、点击后发送的内容、语言切换以及会话保留情况。具体方法见[了解当前工程](/guide/examples/understand-project.md)和[检查修改结果](/guide/examples/verify-results.md)。

本组业务数据来自本地演示服务和 AG-UI 回放。它们用于检查前端交互；接入自己的服务后，还要用实际接口复核。本轮浏览器检查在 macOS 上执行，未执行真实 Windows 验收。
