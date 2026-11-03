---
title: "React 工程接入"
---

# React 工程接入

先在现有 React 工程中完成[初始化](/start/)。以下假设源码位置为 `src/agent-ui`，**实际导入路径以「查看接入方法」为准**。

示例保存为 `src/AssistantPage.tsx`，再在业务页面（如 `src/App.tsx`）导入并渲染 `<AssistantPage />`：

```tsx
import { Agent } from './agent-ui';
export function AssistantPage() {
  return <section style={{ height: '100dvh', minHeight: 0 }}>
    <Agent locale="zh-CN" endpoint="/api/agent" />
  </section>;
}
```

把组件放入现有业务内容区域。已有顶部栏时，**使用剩余内容区高度**；flex/grid 父容器通常还需要 `min-height: 0`，以便消息区内部滚动。保留原有业务导航，不为嵌入助理额外引入页面体系。

上例适用于工作台占据完整内容区。嵌入式的宽高由宿主容器决定，助手则通过自带的悬浮入口展开。挂载前按[各模板的说明](/start/#选择模板和源码位置)分配空间并检查遮挡。

## 工程依赖与样式

React 与 React DOM 应使用匹配版本，并满足已安装包的同级依赖要求。当前 React 版本范围为 `>=18 <20`，仓库固定开发版本不是外部工程必须采用的版本。**工程 UI 库和样式方案仍由工程自己决定**。

先安装 Creator 即可开始初始化，不需要事先逐个安装 Agent UI 的其他包。选择模板后，Creator 会显示要修改的 `package.json` 完整路径、待添加的包及版本；点击 **确认添加依赖** 后，只写入依赖声明，不执行安装或修改构建配置。

按面板显示的安装目录和命令手动安装，再点击 **重新检查依赖**。看到「所需依赖已安装」后，点击 **初始化 Agent UI** 生成源码。兼容的已安装依赖直接复用，具体界面见[创建 Agent UI](/start/#2-创建-agent-ui)。下面各构建工具需要的样式适配器仍按对应步骤自行配置。

以下是本教程官方模板的 Tailwind CSS 4 构建配置。**Creator 开发面板自带样式，这里的配置用于生成的助理界面。** 已有兼容的 Tailwind 配置时合并使用；不要覆盖工程已有 CSS、PostCSS 插件或更换既有 UI 库。已有其他 Tailwind 主版本时，先确认与模板的兼容方案，再调整工程配置。

| 构建工具 | 样式处理方式 | 配置步骤 |
| --- | --- | --- |
| Vite | `@tailwindcss/vite` | [Vite 样式配置](#vite-样式配置) |
| Rsbuild | `@tailwindcss/postcss` | [Rsbuild 样式配置](#rsbuild-样式配置) |
| Webpack 5 | `@tailwindcss/postcss` 与 `postcss-loader` | [Webpack 样式配置](#webpack-5-样式配置) |

### Vite 样式配置

安装模板的样式构建依赖，以下版本沿用本教程：

```sh
pnpm add -D tailwindcss@4.3.3 @tailwindcss/vite@4.3.3
```

在 `vite.config.ts` 顶部导入：

```ts
import tailwindcss from '@tailwindcss/vite';
```

在已有 `plugins` 数组中加入 `tailwindcss()`。使用 [Creator 的 Vite 接入示例](/guide/creator-dock-vite#配置开发面板)时，将数组初始化改为：

```ts
const plugins: PluginOption[] = [react(), tailwindcss()];
```

将样式插件放在开发条件分支之外，让开发和生产构建都能处理模板样式。保留已有插件和其他选项，然后按下方[确认样式入口与构建](#确认样式入口与构建)检查。

### Rsbuild 样式配置

使用工程已有的 PostCSS 支持，安装模板的样式构建依赖：

```sh
pnpm add -D tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 postcss@8.5.28
```

在工程根目录的 `postcss.config.mjs` 中加入 Tailwind 插件。没有 PostCSS 配置时可新建：

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

已有配置时沿用当前配置文件格式、插件顺序和其他插件，合并这一项。Rsbuild 已内置 PostCSS 支持，无需配置 Webpack loader。开发和生产均保留此配置，然后按下方[确认样式入口与构建](#确认样式入口与构建)检查。

### Webpack 5 样式配置

安装模板的样式构建依赖：

```sh
pnpm add -D tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 postcss@8.5.28
```

在工程根目录的 `postcss.config.mjs` 中加入 Tailwind 插件。没有 PostCSS 配置时可新建：

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

已有配置时沿用当前配置文件格式、插件顺序和其他插件，合并这一项。

在工程已有 CSS rule 的 `use` 中加入 `postcss-loader`，让 CSS 先经过 PostCSS，再交给 `css-loader`。以下是使用 `style-loader` 的规则示例：

```js
{
  test: /\.css$/i,
  use: ['style-loader', 'css-loader', 'postcss-loader'],
}
```

复用工程现有的 CSS rule，不另加一条重复匹配的规则。生产构建已有 CSS 提取 loader 时保留它，在对应处理链中同样加入 `postcss-loader`。缺少上述 loader 时，按当前 Webpack 版本安装兼容版本；保留已有 CSS Modules、资源处理和其他规则。

开发和生产均保留样式处理链，然后按下方[确认样式入口与构建](#确认样式入口与构建)检查。

### 确认样式入口与构建

生成模板的 `Agent` 组件已导入项目样式入口。以当前模板为例，入口为 `src/agent-ui/styles.css`，其中导入 `@za38.03/agent-ui-plugins/styles-base.css`，并声明项目源码的扫描范围。实际路径以生成文件为准，保留这些导入和 `@source` 声明。

通过生成的 `Agent` 接入时，保留模板的样式入口即可，不需要在业务全局 CSS 中再添加一次 `@import "tailwindcss"`。

配置完成后重启工程开发服务，检查助理布局、输入框、按钮和主题样式；再执行工程原有的生产构建命令，确认生产页面也包含这些样式。生产样式构建由工程自己的 Tailwind 工具完成，无需启动 Creator。

配置机制参考 [Rsbuild 的 PostCSS 接入说明](https://rsbuild.rs/guide/styling/tailwindcss)、[Tailwind 的 PostCSS 配置](https://tailwindcss.com/docs/installation/using-postcss)及 [Webpack 的 postcss-loader](https://webpack.js.org/loaders/postcss-loader/)。

## 验证

先连接[Mock](/mock/)检查无内容状态、发送、流式、工具和错误，再切真实接口。确认业务页面的全局 `main`、`button` 等选择器不会影响助理内部布局。

运行工程自己的测试、类型检查和构建。

参数接入见[Agent 参数与配置](/development/agent-options)，业务联动见[Host 控制](/development/react-host-control)。
