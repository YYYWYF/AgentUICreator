# 布局与插件组合

调整会话列表、输入区和按钮的位置、尺寸或启停时，先按需求找到修改入口：

| 你要调整什么           | 看哪一节                    | 主要修改位置                     |
| ---------------- | ----------------------- | -------------------------- |
| 看懂容器作用与 JSON 嵌套  | [读懂容器与完整示例](#布局节点入门)    | `src/agent-ui/app-ui.json` |
| 插件顺序、父子组合、启用或隐藏  | [调整插件位置与启停](#调整插件位置与启停) | `src/agent-ui/app-ui.json` |
| 列表宽度、聊天区大小、窄屏抽屉  | [调整尺寸与窄屏布局](#调整尺寸与窄屏布局) | 同一个 `app-ui.json`          |
| 工具栏插槽、工作台右侧多内容面板 | [增加插槽或动态面板](#增加插槽或动态面板) | 布局配置及对应项目插件                |
| 输入框提示、按钮外观、组件行为  | [找到修改位置](#配置与代码入口)      | `plugins/<插件名称>/index.tsx` |

以下以 `src/agent-ui/` 为生成目录，已有工程使用其他目录时替换这个前缀。日常调整也可以直接告诉 Creator，见[布局调整示例](/guide/adjustments/index.md)。

## 先找到修改位置 \{#配置与代码入口}

<span id="布局与组合配置"></span>

**布局与组合配置**

默认位置是：

```text
src/agent-ui/app-ui.json
```

如果初始化时选择了其他源码目录，就在那个目录下找 `app-ui.json`。这份配置在代码中也称为 AppUIModel。

| 字段                   | 保存什么                |
| -------------------- | ------------------- |
| `root`               | 页面布局，以及各区域中的插件。     |
| `applicationPlugins` | 应用级插件，例如主题、语言和会话服务。 |

<span id="外观与交互代码"></span>

**外观与交互代码**

在同一源码目录的 `plugins/<插件名称>/` 中查找对应插件。通常 `definition.ts` 是定义入口，说明使用哪个组件、有哪些服务等；`index.tsx` 是项目的组件定制入口。官方插件的声明和实现默认来自 npm 包，项目入口可以传入组件属性或调整组合。

例如，要改输入框提示或按钮样式，先从 `plugins/composer/` 的项目代码入手。注册文件负责让项目找到插件；不要手工编辑带有 generated 标记的注册文件。

**JSON 管位置与组合，组件代码管具体表现。** 修改项目入口通常就能完成定制，无需先复制官方源码。确实需要自行维护实现时，再按[源码接管](/development/source-takeover.md)处理。

**会话状态与服务依赖**

会话插件共享同一个 Agent 会话环境，读取消息、运行状态，并执行发送、停止等操作。`app-ui.json` 保存布局与插件组合，聊天内容来自当前会话，业务接口在项目服务文件中配置。

有些插件需要其他插件提供服务，例如主题切换需要主题服务，会话列表需要会话服务。停用应用级服务前，先检查是否还有插件依赖它。

业务数据、通知和页面按钮的接入，分别见[状态与事件](/guide/adjustments/state-and-events.md)和[业务页面联动](/development/react-host-control.md)。

## 读懂容器与完整示例 \{#布局节点入门}

`root` 是布局树的起点。容器组织页面区域，`slot` 在区域中放入插件；实际的列表、卡片和按钮由插件组件绘制。

| 节点 `type` | 作用与适用场景                                      | 内容写在哪里                                           |
| --------- | -------------------------------------------- | ------------------------------------------------ |
| `row`     | 将多个区域从左到右排列，例如左侧列表、右侧详情。`sizes` 控制各区域的宽度。    | `children`：布局节点数组。                               |
| `column`  | 将多个区域从上到下排列，例如上方详情、下方操作区。`sizes` 控制各区域的高度。   | `children`：布局节点数组。                               |
| `panel`   | 包住一个区域，为它设置宽高、最小宽度等尺寸约束。                     | `child`：一个布局节点。                                  |
| `slot`    | 在当前布局位置承载一个或多个插件，例如工单列表插件。                   | `plugins`：插件实例数组。                                |
| `stack`   | 从多个区域中选择当前显示的一个，例如切换概览和详情。默认只挂载当前分支，可配置保持挂载。 | `children`：布局节点数组，`activeIndex` 指定初始显示项。         |
| `sidebar` | 将可选择的侧栏内容与主体区域组合，适合带侧栏导航的布局。                 | `items`：侧栏项，`content`：主体布局；可选 `header`、`footer`。 |

左右分栏选 `row`，上下分区选 `column`，给单个区域加尺寸约束用 `panel`，在区域里放功能用 `slot`。它们可以嵌套：一个 `row` 的右侧可以继续放 `column`，一个 `panel` 也可以包住完整布局树。`stack` 用于选择一个区域显示，不表示把所有区域叠在一起；它与 `sidebar` 的详细配置见[布局参考](#高级布局字段与示例)。

**一个完整的最小 JSON 示例**

下面是一份完整的 `app-ui.json`，布局效果是左侧工单列表，右侧上方详情、下方操作区：

```text
root：row（左右排列）
├─ panel → slot → ticket-list
└─ column（上下排列）
   ├─ slot → ticket-details
   └─ slot → ticket-actions
```

这里的 `ticket-list`、`ticket-details`、`ticket-actions` 是三个项目自定义插件，假设已按[创建自定义插件](/development/create-plugin.md)编写好组件、manifest 和 definition，且不依赖额外服务。本例因此将 `applicationPlugins` 留空；JSON 中的插件 ID 不会自动创建插件。

```json
{
  "applicationPlugins": [],
  "root": {
    "type": "row",
    "gap": 12,
    "sizes": ["240px", "minmax(0, 1fr)"],
    "children": [
      {
        "type": "panel",
        "minWidth": 200,
        "child": {
          "type": "slot",
          "plugins": [
            { "pluginId": "ticket-list", "id": "ticket-list-main" }
          ]
        }
      },
      {
        "type": "column",
        "gap": 12,
        "sizes": ["minmax(0, 1fr)", "auto"],
        "children": [
          {
            "type": "slot",
            "plugins": [
              { "pluginId": "ticket-details", "id": "ticket-details-main" }
            ]
          },
          {
            "type": "slot",
            "plugins": [
              { "pluginId": "ticket-actions", "id": "ticket-actions-main" }
            ]
          }
        ]
      }
    ]
  }
}
```

从外向内读这份 JSON：

1. `root` 是一个 `row`，它的两个 `children` 就是左右两块区域。`sizes` 按顺序把左侧宽度设为 240px，右侧使用剩余空间；`gap: 12` 表示两块之间留 12px。
2. 左侧是 `panel`，其中只有一个 `child`。它给列表区域设置最小宽度 200px；真正的列表插件放在里面的 `slot.plugins` 中。
3. 右侧是 `column`，两个 `children` 上下排列。操作区使用内容所需高度（`auto`），详情区使用剩余高度；使用剩余高度需要宿主容器有可用高度。
4. 每个 `slot` 的 `plugins` 里写插件实例。`pluginId` 必须与对应 `manifest.json` 的 `id` 一致；实例 `id` 用于区分这一次使用。省略 `enabled` 时默认启用。

**布局 `slot` 与插件的 `slots` 要分清。** `type: "slot"` 是布局树中的节点，里面用 `plugins` 放插件。插件对象上的 `slots` 则配置这个插件内部已有的位置，例如 `composer.slots.leadingActions` 放附件按钮。`children` 和 `child` 接收布局节点，`plugins` 和插件内部的 `slots.<名称>` 接收插件实例；按这个层级嵌套，不能直接把 `{ "pluginId": "ticket-actions" }` 当作 `row.children` 的一项。

这是一份独立的最小示例。调整现有聊天工程时，只合入需要的布局结构，保留已有的 `applicationPlugins`、插件实例 ID 和完整子插槽。新增插件及实例后，按[插件注册与验证](/development/create-plugin.md#4-插件注册与验证)同步注册表，再查看页面。

## 调整插件位置与启停 \{#调整插件位置与启停}

<span id="常见配置示例"></span>

修改前先备份文件，或用 Git 保存当前版本。以下都是局部示例，不能用来覆盖整个文件；修改现有对象时保留其他字段和插槽。

**放置插件与组合子插件。**

<span id="插件放置与组合"></span>

下面的布局插槽里放了会话列表：

```json
{
  "type": "slot",
  "plugins": [
    { "pluginId": "conversation-thread-list" }
  ]
}
```

它可以作为横向或纵向布局的一个子区域。插件需要已经在项目中注册；只填一个新名字不会自动安装或创建插件。新增功能见[创建自定义插件](/development/create-plugin.md)。

**输入区的子插件配置**

找到 `composer` 对象，在它的 `slots` 中配置对应位置：

```json
{
  "pluginId": "composer",
  "slots": {
    "leadingActions": [
      { "pluginId": "add-attachment-action" },
      { "pluginId": "dictation-action" }
    ],
    "submitAction": [
      { "pluginId": "submit-action" }
    ]
  }
}
```

这个片段在输入区前部放附件和语音按钮，在发送位置放发送按钮。交换 `leadingActions` 中两个完整对象的顺序，就能调整按钮先后。语音能否使用还取决于[浏览器支持或项目的语音服务](/plugins/dictation-action.md)。

<figure className="plugin-preview">

![输入区左下角的附件入口与右下角的语音和发送入口](/images/plugins/composer.png)

<figcaption>用输入区辨认子插槽的位置：图中附件“+”在左侧，语音和发送入口在右侧；它们的位置由现有 Composer 组合决定。</figcaption>
</figure>

**启用、停用与区分实例。**

<span id="启停与实例"></span>

在原有插件对象中加上 `"enabled": false`：

```json
{
  "pluginId": "add-attachment-action",
  "enabled": false
}
```

改回 `true` 即可恢复，省略 `enabled` 时默认启用。停用保留配置与代码；删除配置对象是移除这一次使用，不等于卸载 npm 包或删除源码。

**实例配置与共享实现**

`pluginId` 选择实现，`id` 标识这一次使用的实例。同一个插件可以在允许的位置使用多次，显式 `id` 必须各不相同，已有 `id` 应保留。

修改一个实例的 JSON，可以只调整这一次使用的位置或启停；修改它们共用的组件代码，可能影响所有使用该组件的实例。例如，只隐藏一个附件入口改它的 `enabled`，统一修改附件按钮外观则改组件代码。

## 调整尺寸与窄屏布局 \{#调整尺寸与窄屏布局}

<span id="布局与尺寸"></span>

<figure className="plugin-preview">

![桌面宽度下聊天区与右侧会话列表并排](/images/guide/examples/20261106/layout-desktop.jpg)

<figcaption>布局定制示例：宽屏中，会话列表固定在聊天区右侧。</figcaption>
</figure>

<figure className="plugin-preview">

![窄屏下打开的会话列表抽屉和右上角关闭按钮](/images/guide/examples/20261106/layout-narrow-open.jpg)

<figcaption>同一示例的窄屏状态：列表改为覆盖式抽屉，右上角可关闭。断点和抽屉行为需按项目布局一起配置。</figcaption>
</figure>

各容器的作用见前面的[容器对照与完整示例](#布局节点入门)。移动完整的布局节点可以改变位置。把上下排列改为左右排列，可以调整对应容器的 `column` / `row`，同时检查尺寸设置。

**页面区域尺寸**

假设一个 `row` 的两个子区域依次是会话列表和对话区，可以设置：

```json
{
  "sizes": ["280px", "minmax(0, 1fr)"]
}
```

列表宽 280px，对话区使用剩余空间。`sizes` 与 `children` 按顺序一一对应，`column` 中则控制高度；`gap` 调整区域间距。

约束单个区域时，可以用外层 `panel` 的 `width`、`height` 等字段。它们使用元素尺寸，不能填 `1fr`。

**插件内部排版**

输入框旁的按钮区、回复底部的操作区，由父插件组件控制排版。调整宽度、间距、换行时，使用项目组件代码中的公开属性、组件组合或样式。在 JSON 的 `slots` 里加 `width` 不会改变插槽大小。

整个悬浮助理外框的宽度通过 `<Agent assistantPanelWidth={480} />` 调整；悬浮球、外框样式与交互由用户工程的 `application/shell/` 组件和 CSS 拥有，可直接修改。AppUIModel 继续控制壳内布局。嵌入业务页面时，外部空间由业务页面容器决定。

<span id="窄屏交互适配"></span>

列表在窄屏是否收起、如何打开和关闭，需要单独的响应式安排。已有 `row.responsive` 的布局可以调整相应抽屉配置；`sidebar` 用于切换侧栏内容，`stack` 用于切换子区域，它们本身不等于自动适配窄屏。

可以直接告诉 Creator：

```text
桌面保持列表在左、对话在右，列表宽 280px。
窄屏时收起列表，通过按钮打开，并保留清楚的关闭入口。
输入区按钮空间不足时允许换行，不遮住发送按钮。
```

需要完整 JSON 和字段约束时，查阅末尾的[布局参考](#高级布局字段与示例)。

## 可选：增加插槽或动态面板 \{#增加插槽或动态面板}

只有需要增加新的放置位置或动态内容区域时，才继续配置。

### 工作台右侧动态面板 \{#工作台右侧动态面板}

需要在对话右侧打开多个内容、顶部标签切换并保留状态时，使用官方 [多内容侧栏](/plugins/workbench-panel.md)。AppUIModel 将原有完整对话实例放入容器的 `main`，通过内容子插槽放入自己的插件；标签与可打开的内容 ID 在项目侧栏入口中配置，具体接入与外部调用见该教程。

展开、收起与关闭标签由侧栏服务控制，容器随状态调整分栏宽度，无需运行时修改 `row.sizes` 或重新生成 `app-ui.json`。本页下方的 `sidebar` 是侧栏导航布局节点；工作台右侧多标签面板由 `workbench-panel` 插件实现，两者使用各自的配置与状态。

### 增加页面插槽或自定义插件内部插槽 \{#插槽扩展}

**插槽扩展的适用范围**

一个位置需要独立增减、更换或排序功能时，适合开放插槽，例如工具栏操作、卡片底部操作、欢迎区内容。

只改颜色、文案、间距或固定图标时，使用组件属性和样式更直接。优先复用已有位置，按“输入操作”“回复操作”这样的功能开放插槽。

<span id="新增页面或内部插槽"></span>

**新增页面或内部插槽**

例如在对话区上方增加工具栏，可以在现有 `column` 的 `children` 中新增布局插槽，放入已注册的工具栏插件，再调整对应的 `sizes`。这类修改主要在 `app-ui.json` 中完成。

**自定义插件的内部插槽**

例如工单卡片要开放底部操作区，需要三步：

1. 在插件定义的 `manifest.slots.children` 中声明插槽，例如 `actions`，说明允许什么功能、能放一个还是多个、是否可空。
2. 在组件目标位置调用 `renderSlot("actions")`，并控制这块区域的排版。
3. 在 `app-ui.json` 中，通过这个插件的 `slots.actions` 放入已注册的子插件。

只在 JSON 中写一个新名字，不会自动创建插槽。扩展已有官方插件时，先使用项目代码中的公开属性和组件组合；需要修改官方实现再单独处理源码接管。

```text
在工单卡片底部开放一个可选操作区，支持多个工单操作插件。
先放“查看详情”和“复制工单号”，以后可独立启停、调整顺序。
没有操作时隐藏，窄屏允许换行。
```

## 检查效果与维护定制 \{#定制更新与检查}

<span id="工程检查与页面验证"></span>

JSON 格式正确，还需要插件存在、插槽匹配、数量和依赖满足要求。运行项目提供的相关检查与构建，再查看前端页面，确认位置、尺寸、顺序和功能实际改变。

渲染插件需要触发对应消息或工具调用才能检查；服务类插件要检查依赖它的功能。涉及布局时也检查窄屏、滚动和按钮可达性。

### 后续升级时怎样保留定制 \{#定制与更新}

项目定制入口与官方实现分开维护。调整公开属性、组件组合和样式，是普通项目代码修改；只有需要维护官方实现源码时才接管，并先确认具体插件和范围。

后续 **npm 依赖升级**与**已接管源码同步**是两个步骤。升级依赖应保留项目的配置和定制入口，接管后的本地实现也不会自动变成新版。需要采用官方改动时，按[更新日志](/updates/index.md)另行处理。

**相关定制指南**

主题、语言、登录和业务数据各有自己的接入方式：

- 颜色、字号和圆角：见[品牌与样式](/guide/adjustments/themes.md)。
- 提示、按钮和中英文：见[修改文案](/guide/adjustments/localization.md)。
- 传入已有登录用户和请求凭据：见[外部登录接入](/development/auth-service.md#外部登录凭据与用户信息)。
- 工具结果和消息卡片：见[调整结果展示](/guide/adjustments/custom-renderers.md)。

## 参考：插件、插槽与布局字段 \{#高级布局字段与示例}

按需要查阅下面的概念、插槽清单或具体布局示例。

### 插件能做什么，以及怎样启用 \{#插件概述}

<span id="插件功能分类"></span>

**插件功能分类**

插件可以是一整块会话区，也可以是一个附件按钮，还可以负责显示某类消息，或提供其他插件需要的服务。

| 按用途看    | 例子                 |
| ------- | ------------------ |
| 会话与输入   | 会话列表、输入框、附件、语音。    |
| 回复与结果展示 | 思考过程、工具调用、图表、文件卡片。 |
| 操作按钮    | 发送、复制、重试、评价、导出。    |
| 应用服务    | 主题、语言、会话数据与会话管理。   |

完整清单见[插件总览](/plugins/index.md)。这些是功能分类，JSON 中无需填写“插件类型”。

<span id="插件使用方式"></span>

**插件使用方式**

按使用方式，主要有三个入口：

- **放在页面区域里**：例如左边放会话列表，右边放会话区。
- **放在另一个插件里**：例如输入区里面放附件按钮，回复操作区里面放复制按钮。
- **作为应用级插件启用**：例如主题服务、语言服务，以及部分消息展示插件。它们写在 `applicationPlugins` 中，不直接占据一个布局位置。

功能和放置方式要分开看。例如，图表属于结果展示功能，但图表消息插件通过应用级注册，在收到对应内容时显示，并不需要给每张图表安排一个页面区域。

**插件启用与显示条件**

一个插件会经过“项目里可用 → 配置了使用位置或应用级入口 → 已启用 → 满足显示条件”这几步。

例如，语音按钮需要放进输入区并启用；图表插件还需要收到它支持的数据。**启用插件不会自动生成业务数据，也不会让 Agent 获得新的后端工具。**

### 插件怎样组合，以及常用插槽名称 \{#插槽与子插件}

<span id="插槽定义与分类"></span>

**插槽定义与分类**

插槽（Slot）可以是页面的一块区域，也可以是插件内部开放的位置。布局安排位置，插件提供其中的功能。

| 插槽     | 例子          | 配置入口                           |
| ------ | ----------- | ------------------------------ |
| 页面布局插槽 | 侧栏中的会话列表区。  | `type: "slot"` 节点里的 `plugins`。 |
| 插件内部插槽 | 输入区的附件按钮位置。 | 父插件的 `slots`。                  |

插槽不一定有边框或固定大小。有些随内容出现，例如回复底部的操作区。

<span id="父子插件组合"></span>

**父子插件组合**

比如，会话区里放输入区，输入区里再放附件和发送按钮。输入区是会话区的子插件，附件按钮又是输入区的子插件。

父、子描述组合关系。子插件仍是独立插件，可以单独启停或更换；停用父插件后，里面的子插件也会一起隐藏。

**操作插槽与渲染插槽**

输入区的操作插槽会在输入区中显示按钮。思考、工具调用等**渲染插槽**则在遇到对应会话内容时，使用所选插件展示当前内容。

例如，`toolFallback` 负责没有专用展示方式的工具调用。它需要当前工具调用的数据，不能作为普通按钮随意放到页面顶部。

**插槽约束**

插槽会限制允许的功能、数量，以及是否必须有内容。例如，输入区操作位置可以放多个按钮，发送位置最多放一个发送插件。

这些规则帮助避免把复制回复的按钮放到没有回复数据的位置，或在一个发送位置放两个发送按钮。选位置时先看插件用途，再看父插件支持什么。

**空插槽的默认行为**

取决于父插件：有的隐藏这块区域，有的使用默认内容。例如默认输入区在没有配置自定义 `input` 子插件时，仍会显示普通文本输入框。

因此，空插槽不一定留白；需要完全隐藏某个区域时，应检查父插件的具体行为。

<span id="常用插件插槽"></span>

**常用插件插槽**

页面区域可以通过布局插槽安排。插件内部常用的位置如下：

| 父插件                             | 插槽名称                                            | 用途                      |
| ------------------------------- | ----------------------------------------------- | ----------------------- |
| 会话区 `conversation-surface`      | `emptyWelcome` / `emptySuggestions`             | 空会话的欢迎内容 / 推荐问题。        |
| 会话区 `conversation-surface`      | `composer`                                      | 输入区。                    |
| 会话区 `conversation-surface`      | `reasoningGroup` / `toolGroup` / `toolFallback` | 思考、工具分组和单次工具调用的展示。      |
| 会话区 `conversation-surface`      | `assistantResponseFooter`                       | 完整回复底部的操作区。             |
| 输入区 `composer`                  | `beforeInput`                                   | 输入框上方的内容，例如引用预览。        |
| 输入区 `composer`                  | `leadingActions` / `trailingActions`            | 附件、语音等操作按钮。             |
| 输入区 `composer`                  | `submitAction` / `input` / `triggers`           | 发送按钮 / 输入组件 / 输入框上方的内容。 |
| 回复操作区 `response-footer`         | `actions`                                       | 复制、重试、评价和导出。            |
| 会话列表 `conversation-thread-list` | `headerActions`                                 | 新建会话等列表操作。              |

这不是完整清单，以项目中父插件的定义为准。JSON 里的 `slots` 只列出当前配置的位置，未写出的位置也可能可用。开发者可以从对应插件定义的 `manifest.slots.children` 查看完整声明，包括用途、数量和允许的插件能力。

以下字段写在 **AppUIModel 的 authoring JSON** 中：

- 布局节点不填写运行时派生的 `id`／`slotId`；`stack` 使用 `activeIndex`。
- 插件实例已有的 `id` 保持原值。

不要把 Renderer 的运行时结构复制回 `app-ui.json`。

### Row、Column 与 Panel \{#rowcolumn-与-panel}

| 节点／字段                              | 用法                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `row.children` / `column.children` | 子布局数组，按顺序横向／纵向排列。                                                                                       |
| `sizes`                            | 可选，与 children 等长；数字表示 `fr` 权重，字符串为 Grid 轨道，例如 `"280px"`、`"minmax(0, 1fr)"`。不传时各轨道等分。                    |
| `gap`                              | 可选，非负数，单位 px；不传时没有额外间距。                                                                                 |
| `panel.child`                      | 一个子布局；不是 `children` 数组。                                                                                 |
| `panel.width` / `height`           | 可选，非负数按 px，字符串使用元素尺寸，如 `"100%"`、`"24rem"`、`"min(480px, 100%)"`；不能填 `"1fr"`、`"minmax(...)"` 等 Grid 轨道语法。 |
| `panel.minWidth` / `maxWidth`      | 可选，非负数，单位 px；同时设置时最小值不能大于最大值。                                                                           |
| `panel.resizable`                  | 可选，默认不启用；`true` 使用浏览器的横向尺寸调整和滚动，不提供纵向拖动，也不把拖动后的宽度保存回 JSON。                                              |

父级轨道与 Panel 尺寸会共同影响最终宽度；Panel 拖动不能代替父级 `sizes` 配置。百分比高度还要求业务容器有可用高度。内层组件的边距与按钮换行仍在项目组件代码里调整。

### 宽屏并排、窄屏抽屉 \{#宽屏并排窄屏抽屉}

假设现有 Row 的两个 children 依次为会话列表和聊天区。下面是 `root` 的结构示例；应用到现有工程时保留两项内部完整的 Plugin 配置与子插槽，不用简化示例覆盖它们：

```json
{
  "type": "row",
  "gap": 12,
  "sizes": ["280px", "minmax(0, 1fr)"],
  "responsive": {
    "type": "drawer",
    "primaryIndex": 1,
    "drawerIndex": 0,
    "minPrimaryWidth": 360
  },
  "children": [
    { "type": "slot", "plugins": [{ "pluginId": "conversation-thread-list" }] },
    { "type": "slot", "plugins": [{ "pluginId": "conversation-surface" }] }
  ]
}
```

`primaryIndex` 与 `drawerIndex` 从 0 开始，分别指向主区域和抽屉区域，不能相同。宽度不足时，列表进入左侧抽屉；宽屏下也有收起／恢复列表的入口。列表在右侧时，调整实际 children 顺序、sizes 和索引，抽屉会跟随到右侧，不用 CSS 反转布局。

`minPrimaryWidth` 是主区域希望保留的最小宽度，不是整个窗口的断点。触发条件按 **Row 实际容器宽度、其他区域测量宽度和 gap** 计算；本例通常在约 `280 + 12 + 360` px 附近切换，悬浮或嵌入式容器也按自身宽度判断。

抽屉布局使用 `responsive.type: "drawer"`，两个索引分别指向已存在的子区域。

生成工程自带抽屉打开、关闭及 Esc 交互，按钮使用当前界面语言。直接集成 `LayoutRenderer` 时，抽屉文案通过 `drawerLabels` 提供，sidebar 展示通过 `renderSidebar` 配置。

### Stack：选择一个内容区域 \{#stack选择一个内容区域}

`stack.activeIndex` 指向 children 中从 0 开始的位置。省略时显示第一项；显式索引必须小于 children 长度。下面显示第二项：

```json
{
  "type": "stack",
  "activeIndex": 1,
  "children": [
    { "type": "slot", "plugins": [{ "pluginId": "project-summary" }] },
    { "type": "slot", "plugins": [{ "pluginId": "project-details" }] }
  ]
}
```

`project-summary`、`project-details` 是示例中的项目自定义插件，需要先创建并注册。Stack 不生成切换按钮，默认只挂载当前分支。多个独立助手仍使用[多助手的受控显示](/development/multiple-agents.md#多助手与受控显示)。

#### 通过 Service 切换内容并保持挂载 \{#stack-navigation}

从创建独立视图插件、扩展菜单到配置完整联动，见[功能菜单：菜单与右侧内容联动](/plugins/navigation-menu.md#content-switching)。

需要左侧菜单控制右侧功能时，为 Stack 设置自身的 `id`，用 `viewIds` 数组按 children 的顺序声明视图 ID，并设置 `keepMounted: true`：

```json
{
  "type": "stack",
  "id": "main",
  "viewIds": ["chat", "files"],
  "keepMounted": true,
  "children": [
    { "type": "slot", "plugins": [{ "pluginId": "conversation-surface" }] },
    { "type": "slot", "plugins": [{ "pluginId": "my-files" }] }
  ]
}
```

这里展示布局关系；现有聊天分支的 Composer、消息及操作子插槽应完整保留。`my-files` 是需独立注册的功能插件。每个分支也可以是 Row、Column、Panel 等完整布局树。视图 ID 是语义身份，不是插件 ID，也不是 URL。

Runtime 在每个 Agent 作用域内提供 `agent-ui.stack-navigation`，无需额外的提供方插件。调用方在 definition 中声明 `inject: ['agent-ui.stack-navigation']`，组件通过现有 Service Hook 取得接口：

```tsx
import { usePluginService } from '@za38.03/agent-ui-plugins';
import { STACK_NAVIGATION_SERVICE, type StackNavigationService } from '@za38.03/agent-ui-runtime/contracts';

export function OpenView({ label }: { label: string }) {
  const navigation = usePluginService<StackNavigationService>(STACK_NAVIGATION_SERVICE);
  return <button type="button" onClick={() => navigation?.selectView('main', 'files')}>{label}</button>;
}
```

`label` 使用项目统一文案。`getSnapshot()` 返回 `{ stacks: { [stackId]: { activeViewId, viewIds } } }`，`subscribe()` 订阅状态变化。未知 Stack 或视图 ID 报错；同一 Agent 中显式设置的 Stack ID 必须唯一，配置 `viewIds` 时必须提供 Stack `id`。

菜单使用[功能菜单插件](/plugins/navigation-menu.md)。菜单、结果卡片、普通按钮等插件都可通过同一 Service 选择分支。运行时选择不写回 AppUIModel；模型只保存布局、语义身份和初始 `activeIndex`。分支重排保留选择，已选分支移除后回退到模型默认分支或第一项；结构编辑新增分支时同步设置对应的 `viewIds` 数组。

`keepMounted: true` 隐藏未选分支并隔离键盘焦点，保留 React 子树。聊天分支切走后会话、草稿和后台运行继续由 canonical Conversation Runtime 持有；移除分支或卸载整个 Agent 才结束相应生命周期。省略此属性时，未选分支会卸载。Renderer 只读取受控激活状态，服务及状态归 Runtime，不依赖菜单插件。

### Sidebar：侧栏导航与主体 \{#sidebar侧栏导航与主体}

Sidebar 提供一组可选择的侧栏内容，`content` 是始终独立排列的主体。下面同样只展示布局结构，现有插件内部组合应保留：

```json
{
  "type": "sidebar",
  "defaultActive": "conversations",
  "header": {
    "type": "slot",
    "plugins": [{ "pluginId": "agent-identity" }]
  },
  "items": [
    {
      "id": "conversations",
      "child": {
        "type": "slot",
        "plugins": [{ "pluginId": "conversation-thread-list" }]
      }
    }
  ],
  "content": {
    "type": "slot",
    "plugins": [{ "pluginId": "conversation-surface" }]
  }
}
```

| 字段                  | 约束与行为                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| `items`             | 数组；每项有唯一、非空的导航 `id`，与 Plugin 实例 ID 分开。每项 `child` 必须是恰好放一个 Plugin 的布局 Slot。 |
| `defaultActive`     | 必填；写某个 item 的 id，或 `null` 表示初始收起。它设置初始选择，不是业务页面的受控选择属性。                    |
| `header` / `footer` | 可选布局 Slot，各最多一个 Plugin；适合品牌区、账号区等。                                         |
| `content`           | 必填，可以是任意受支持布局；聊天区应放在这里，而不是放进需要切换的侧栏 item。                                  |

侧栏 item 的插件须声明 `manifest.sidebar`：

- `icon`：导航图标。
- `labels?`：可选双语标签，按钮与导航文案仍归项目语言层。

未声明或被停用的项不会成为可选导航。沿用当前插件已有声明；自定义侧栏插件按 `UIPluginManifest['sidebar']` 的公开类型配置。

可选的 `RailAction` 用于快捷操作，不会增加导航页面。

默认 Sidebar 展示适配会按其容器宽度自动选择内联侧栏或抽屉，不通过 `row.responsive` 配置，也不会自动持久化当前选项。切换侧栏内容不等于新建 Thread；不要把需持续挂载的助手或服务放在会被切换移除的侧栏内容里。

### 自定义外壳的入口 \{#自定义外壳的入口}

改变整个助手的悬浮入口、固定位置、外框和收起动画时，编辑 `application/shell/`；改变外壳内的列表、聊天区和插件位置时，编辑本页的 AppUIModel。Shell 通过 `createAgentUIProject({ Shell })` 静态绑定，具体的组件、CSS、容器观察和保持后台运行示例见[自定义 Shell](/development/shell-customization.md)。
