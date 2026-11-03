---
title: "开始使用"
description: 为你的产品加入 AI 助理，用自然语言调整界面。从现有 React 工程出发，完成接入、首次对话和第一次定制。
sidebar: false
---

<div className="start-intro">
  <p className="start-intro__title">让你的产品拥有<br />自己的 <span>AI 助理。</span></p>
  <p className="start-intro__description">从页面角落的悬浮助手，到完整的对话工作台。选择一个模板接入现有工程，再用自然语言，把它改成你想要的样子。</p>
  <div className="start-intro__prompts">
    <span>“换成品牌色”</span>
    <span>“调整对话区布局”</span>
    <span>“修改欢迎语”</span>
  </div>
  <p className="start-intro__note">你的界面，从一句话开始。</p>
</div>

本教程以 **React + Vite** 工程为例，带你安装 **Creator**、创建 Agent UI，再把助理放进页面，完成首次对话和第一次界面定制。生成的代码就在你的工程里，你可以继续用 Creator 定制，也可以直接编辑，并随自己的应用独立构建和部署。

![招行客户服务演示工作台，右上角是 Creator 入口。](/images/start/01-business-before.png)

## 1. 安装并启动 Creator

先安装 Creator，配置启动脚本和页面入口，再启动服务。打开开发页面后，就可以进入 Creator 面板，选择要安装的 Agent UI 模板。

:::tip 环境要求
安装和使用 Creator 要求 **Node.js 24，最低版本为 `24.22.1`**。以下步骤使用 React + Vite 工程，命令以 pnpm 为例；包管理器沿用工程现有配置。
:::

### 安装工具

在终端进入自己的工程根目录（含 `package.json` 的目录），安装 Creator：

```sh
pnpm add -D @za38.03/agent-ui-creator
```

这一步只需安装 Creator。初始化时，它会检查当前工程需要哪些 Agent UI 依赖，列出要添加的包，等你确认后写入工程的 `package.json`，再由你手动安装。

### 配置启动脚本

在 `package.json` 已有的 `scripts` 中新增 `dev:creator`，保留其他脚本：

```json
{
  "scripts": {
    "dev:creator": "agent-ui-creator --port 47833"
  }
}
```

脚本中的端口需要与页面入口的 `creatorUrl` 一致，以下统一使用 `47833`。

### 在开发页面中接入 Creator

按工程现有的构建工具选择接入方式，保留已有配置：

| 工程使用的构建工具 | 配置位置 | 接入说明 |
| --- | --- | --- |
| Vite | `vite.config.ts` | [Vite 接入配置](/guide/creator-dock-vite#配置开发面板) |
| Rsbuild | `rsbuild.config.ts` | [Rsbuild 接入配置](/guide/creator-dock-rsbuild-webpack#rsbuild) |
| Webpack 5 | Webpack 开发配置，如 `webpack.config.js` | [Webpack 接入配置](/guide/creator-dock-rsbuild-webpack#webpack-5) |
| CRACO / Create React App | `craco.config.js` | [CRACO 接入配置](/guide/creator-dock-rsbuild-webpack#cracocreate-react-app) |

按对应说明配置后，回到下一步启动服务。

### 启动 Creator 和工程开发服务

需要同时运行 Creator 服务和你自己的前端工程，才能在工程页面中看到并使用 Creator 面板。

**第一步：启动 Creator 服务。** 在工程根目录运行：

```sh
pnpm dev:creator
```

**第二步：启动你自己的前端工程（必需）。** 保持 Creator 终端运行，另开终端并进入同一工程，使用工程原有的开发启动命令启动前端。如果工程已经运行，重启一次，使刚才的配置生效。

### 打开 Creator 面板

在浏览器中打开前端工程启动后提供的开发地址，点击页面右上角的 **Creator Agent**：

![页面右上角出现带星形图标的 Creator Agent 按钮。](/images/start/03-creator-entry.png)


## 2. 创建 Agent UI

现在用 Creator 选择模板，将助理界面代码生成到自己的工程中。

### 选择工程

在 Creator 顶部文件夹菜单中选择自己的前端工程。目录选择器从启动 Creator 的目录开始；也可以展开「通过路径打开」填写绝对路径。工程未初始化时，会出现「创建 Agent UI」面板。

之后在同一浏览器和 Creator 服务地址下重新打开，会尝试恢复上次选择。需要切换工程时，重新打开顶部文件夹菜单；选择「关闭当前项目」可清除工程选择，磁盘文件会保留。

### 选择模板和源码位置

在「选择产品形态」中，根据自己的使用场景选择合适的模板。

<div className="template-description">
  <p className="template-description__heading"><strong>工作台</strong><span>助理占据完整工作区域，带会话列表和对话区。</span></p>

接入时给宿主容器明确的可用高度，界面会填满容器宽高。页面已有顶部栏或导航栏时，使用剩余内容区的高度。

</div>

![工作台模板：会话列表位于左侧，对话区和推荐问题占据其余工作区域。](/images/start/04-template-platform.jpg)

<div className="template-description">
  <p className="template-description__heading"><strong>助手</strong><span>通过页面右下角的悬浮入口打开或收起助理，默认收起。</span></p>

面板默认宽 416px，并受视口宽高限制，无需在业务布局中预留宽度。接入时检查入口和面板是否遮挡业务按钮或弹窗；可用 `assistantPanelWidth` 调整宽度，位置和层级在项目 `application/shell/` 中修改。

</div>

![助手模板展开后的效果：业务页面保留原有布局，助理悬浮在右下角，可通过下方按钮收起。](/images/start/04-template-assistant.jpg)

<div className="template-description">
  <p className="template-description__heading"><strong>嵌入式</strong><span>将助理放在页面中的侧栏、卡片或分栏区域。</span></p>

界面填满宿主容器，没有默认固定宽度或最大宽度。接入时由业务页面设置容器宽高；直接放进全屏容器就会铺满。需要窄助理时，可给容器设置如 `width: min(440px, 100%)` 的宽度和明确的高度。使用百分比高度时，父容器也需要有确定的高度；flex/grid 布局通常还需设置 `min-width: 0`、`min-height: 0`，让内容正常收缩和内部滚动。

</div>

![嵌入式模板：左侧为演示文稿编辑区，助理填满业务页面右侧分配的容器。](/images/start/04-template-embedded.jpg)

在下方「Agent UI 源码位置」填写相对于工程根目录的路径。本教程使用 `src/agent-ui`，你也可以改成自己的目录。下方会显示最终的完整路径，确认这是你希望生成代码的位置。

![选中工作台后，在源码位置填写 src/agent-ui，并检查下方路径。](/images/start/04-select-platform.png)

### 确认要添加的依赖

选择模板和源码位置后，Creator 会检查当前工程的依赖。在「项目依赖」卡片中，先核对两项内容：

- **将添加到此文件**：要修改的 `package.json` 完整路径。
- **运行依赖 / 开发依赖**：本次需要添加的包及版本；兼容的已安装依赖会直接复用。

路径和版本以你当前工程显示的内容为准。

确认后点击底部 **确认添加依赖**。这一步只添加依赖声明，不会执行安装，也不会修改 Vite、PostCSS 等构建配置。

![项目依赖卡片列出 package.json 的完整路径、要添加的包和版本，底部按钮为确认添加依赖。](/images/start/04a-dependency-plan.png)

### 手动安装并重新检查

添加声明后，面板会显示 **依赖声明已添加**，并给出安装目录和安装命令。在标出的工程目录打开终端，执行页面中的命令。pnpm 工程通常为：

```sh
pnpm install
```

![依赖声明已添加后的下一步页面，显示安装目录、pnpm install 和重新检查依赖按钮。](/images/start/04b-manual-install.png)

等待终端安装完成，再回到 Creator 点击 **重新检查依赖**。检查通过后，「项目依赖」卡片会显示 **所需依赖已安装。**

![重新检查通过后，项目依赖卡片显示所需依赖已安装，底部可点击初始化 Agent UI。](/images/start/04c-dependencies-ready.png)

:::tip 已有依赖时
如果所需依赖已经安装且兼容，Creator 会直接显示「所需依赖已安装」，可以跳过添加和安装步骤。安装命令沿用工程的包管理器，npm 工程会显示 `npm install`；遇到版本冲突时，先按提示处理，再重新检查。
:::

### 初始化

点击面板底部蓝色的 **初始化 Agent UI** 按钮。

完成后，面板会显示 **Agent UI 已创建**，生成文件保存在刚才选择的源码目录中。

![初始化完成后，面板顶部显示 Agent UI 已创建，右侧有查看接入方法。](/images/start/05-initialized.png)

### 生成了哪些文件

以工作台模板、默认源码目录 `src/agent-ui/` 为例，打开工程可以看到以下文件。

![生成后的 src/agent-ui 目录：布局文件、Agent 入口、工作台外壳、插件、服务和样式。](/images/start/05a-generated-files.png)

```text
src/agent-ui/                        # 生成的 Agent 前端源码
├── index.ts                         # 对外导出 Agent，业务页面从这里导入
├── app-ui.json                      # 布局、插件实例、位置、顺序与启停
├── styles.css                       # 项目样式入口与样式覆盖
├── application/                     # 组装当前工程的 Agent 界面
│   ├── Agent.tsx                    # Agent 组件，接收连接、主题等配置
│   ├── project-config.tsx           # 绑定布局、插件目录与所选外壳
│   ├── runtime-config.generated.ts  # 固定导出初始化时选定的外壳
│   └── shell/                       # 当前形态的外壳，可在项目内定制
│       ├── PlatformShell.tsx        # 工作台外壳组件
│       └── platform-shell.css       # 工作台外壳样式
├── plugins/                         # 当前布局选用的插件入口
│   ├── index.ts                     # 导出插件能力目录
│   ├── registry.generated.ts        # 工具生成的插件注册表，无需手改
│   └── composer/                    # 输入框插件示例，其余插件结构类似
│       ├── index.tsx                # 配置组件属性、组合和自定义表现
│       ├── definition.ts            # 将项目组件注册为插件
│       ├── manifest.json            # 声明插件身份、能力和插槽等信息
│       └── application.json         # 记录项目入口对应的官方插件身份
└── services/                        # 业务服务接入与共享 Hook
    ├── composer-triggers.ts         # @ 提及和 / 命令的服务契约与注册
    ├── conversations.ts             # 会话服务契约与标识
    ├── conversations/               # 历史会话 HTTP 接入
    │   ├── endpoint.ts              # 解析配置的历史服务地址
    │   └── http-data-source.ts      # 对接会话列表、详情等 HTTP 接口
    └── hooks/                       # 组件调用会话服务的 React Hook
        ├── useConversations.ts      # 读取会话列表与当前会话状态
        └── useConversationActions.ts # 切换、删除、重命名等会话操作
```

工程根目录还会生成供开发工具使用的记录和入口：

```text
.agent-ui/                           # Agent UI 的工程记录与本地工具数据
├── project.json                     # 记录生成源码所在的目录
├── source-lock.json                 # 记录已导入资源及源码基线
└── operator/entry.mjs               # 本地开发工具入口，不参与生产页面运行
```

**改布局看 `app-ui.json`，改组件看 `plugins/<插件名>/index.tsx`，改外壳看 `application/shell/`。** 官方插件默认从 npm 引入实现，生成的是项目自己的定制入口。其他形态只生成对应的外壳，插件和服务文件按所选功能生成；后续添加功能时可能增加文件。更详细的修改建议见[工程结构与修改入口](/development/project-structure)。

## 3. 挂载助理组件

### 配置模板的 Tailwind CSS 样式

模板生成的助理界面使用 Tailwind CSS。按工程现有构建工具完成样式配置，已有兼容配置时合并使用：

| 构建工具 | 样式构建方式 | 配置步骤 |
| --- | --- | --- |
| Vite | `@tailwindcss/vite` | [Vite 样式配置](/development/react#vite-样式配置) |
| Rsbuild | `@tailwindcss/postcss` | [Rsbuild 样式配置](/development/react#rsbuild-样式配置) |
| Webpack 5 | `@tailwindcss/postcss` 与 `postcss-loader` | [Webpack 样式配置](/development/react#webpack-5-样式配置) |

完成后重启工程开发服务，继续挂载助理。样式配置用于助理界面的开发和生产构建，需要保留在工程中。

### 挂载助理组件

初始化完成后，在 Creator 顶部找到「Agent UI 已创建」，点击右侧 **查看接入方法**，选择 **React 工程**，查看当前工程的导入路径。

![接入说明中的第一步：从 src/agent-ui 导入 Agent，在现有页面中渲染组件。](/images/start/08-integration-guide.png)

从刚刚选择的源码目录导入 `Agent`。以下以 `src/agent-ui` 为例；使用其他目录时，按接入说明中的实际路径调整导入。新建 `src/Assistant.tsx`，填入：

```tsx
import { Agent } from './agent-ui';

export function Assistant() {
  return (
    <div style={{ height: '100%', minHeight: 0 }}>
      <Agent locale="zh-CN" endpoint="/agent" />
    </div>
  );
}
```

打开要显示助理的页面组件（Vite 默认工程通常是 `src/App.tsx`），在文件顶部导入 `Assistant`。页面文件与 `Assistant.tsx` 都在 `src` 下时，写法为：

```tsx
import { Assistant } from './Assistant';
```

在该页面组件的 `return (...)` 中，找到要放置助理的位置，加入：

```tsx
<div style={{ height: '100dvh' }}>
  <Assistant />
</div>
```

上例按工作台模板分配一个屏幕的高度。如果页面已有顶部栏，将高度改为顶部栏下方内容区的高度。源码目录或页面文件位置不同时，同步调整导入路径。

保存文件，打开页面检查挂载效果。

![示例工程中挂载后的工作台：左侧是会话栏，中间显示欢迎语、默认的三条推荐问题和消息输入框。](/images/start/06-platform-mounted.png)

## 4. 完成首次对话

### 接入业务 Agent

助理已经挂载到页面，现在可以配置 `endpoint`，连接自己的 Agent 服务。在 `src/Assistant.tsx` 中将 `Agent` 的 `endpoint` 替换为业务 AG-UI 接口地址，例如：

```tsx
<Agent locale="zh-CN" endpoint="/api/agent" />
```

保存后，在助理输入框中发送消息，验证服务返回的回复。鉴权、代理和历史会话的接入见[连接 Agent 服务](/development/connect-agent)。

:::tip 在 Creator 中临时测试服务
也可以在面板设置的「连接 Agent」中填写地址，供开发预览和联调使用。**这项设置不会修改应用代码中的 `endpoint`，也不会随应用发布。** 应用独立运行或正式部署时，仍使用应用代码中配置的服务地址。
:::

暂时没有后端服务时，可以先使用 Creator 提供的 **Mock 服务**，体验预设的流式回复、思考和工具执行，无需模型密钥。

### 启动并使用 Mock 服务

1. 展开 Creator，点击面板顶部齿轮，打开 **示例与回放**。

   ![Creator 顶部设置菜单中的「示例与回放」入口。](/images/start/10-creator-mock-menu.png)

2. 点击 **启动服务**，阅读各个 Mock 示例的说明，选择你想体验的示例。如果提示缺少展示资源，按提示引入或启用。
3. 在设置的 **连接 Agent** 中选择 Mock 来源并保存。
4. 回到页面助理，在 **发送消息…** 输入框中输入一条消息，再点击发送。

选择 Mock 后，即可在开发预览中体验对话和模拟历史会话。

发送的文字用于触发所选场景，Mock 会返回预设内容，不会调用模型回答新问题。继续了解[更多示例与本地回放](/mock/)。

![Mock 对话结果：展开的思考内容、已搜索文件记录和最终回复。](/images/start/07-demo-conversation.png)

## 5. 定制 Agent 界面

### 配置模型

在**前端工程根目录**下创建 `.agent-ui/creator/` 目录，并新建其中的 `.env.local`。

配置文件的位置如下：

```text
你的前端工程/
├── package.json
├── .agent-ui/
│   └── creator/
│       └── .env.local     ← 在这里新建
└── src/
    ├── Assistant.tsx
    └── agent-ui/          ← 生成的 Agent UI 源码目录
```

在 `.agent-ui/creator/.env.local` 中填入自己的模型服务配置：

```dotenv
CREATOR_MODEL_BASE_URL=https://your-model-service.example/v1
CREATOR_MODEL_API_KEY=your-api-key
CREATOR_MODEL_NAME=your-model-name
```

将示例地址、密钥和模型名替换为实际值。**在工程根目录的 `.gitignore` 中加入一行 `.agent-ui/creator/`**，保存后重启 Creator。

### 提交修改需求

展开 Creator，在底部输入框描述修改需求，例如：

> 将助理的名字改为「小招」。

![Creator 底部输入框已填入「将助理的名字改为『小招』」，右下角是发送按钮；图中尚未发送。](/images/start/09-creator-rename-request.png)

点击右下角 **发送**。Creator 会在上方显示执行过程；需要你回答问题或确认方案时，按面板提示操作。

### 检查修改结果

执行完成后，查看本次代码改动。收起 Creator，**回到页面助理中检查名字是否已更新**，再运行工程原有的检查命令。

想看 Creator 实际怎样检查工程、修改名称与欢迎语，以及修改后的页面，继续阅读[对话定制示例](/guide/examples/)。

发布时在业务工程中运行自己的构建命令，无需启动 Creator。
