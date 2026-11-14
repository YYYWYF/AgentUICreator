---
title: "HTML 与其他框架嵌入"
---

# HTML 与其他框架嵌入

独立 Web Component 将 React、Runtime 与所选 Plugin 构建到部署资源中。业务页面无需编译 TSX，但需要现代 Custom Elements、Shadow DOM 等浏览器能力。

接入自己生成的定制产物时，展示形态沿用 React 工程初始化时选择的模板。工作台和嵌入式需要宿主提供宽高，助手自带悬浮入口；尺寸和放置方式见[各模板的说明](/start/#选择模板和源码位置)。

## 安装与公开入口

`agent-ui.js` 随 `@za38.03/agent-ui-web-component` 包发布。先在接入工程安装该包，包管理器沿用工程现有配置：

```sh
pnpm add @za38.03/agent-ui-web-component
```

| 使用场景 | 公开引用路径 | 包内文件 |
| --- | --- | --- |
| Vite、Webpack 等模块工程，导入后自动注册 `<agent-ui>` | `@za38.03/agent-ui-web-component/register` | `dist/agent-ui.es.js`（ESM） |
| 提取独立脚本，交给静态服务器部署 | `@za38.03/agent-ui-web-component/agent-ui.js` | `dist/agent-ui.js`（classic script） |
| 读取组件类型 | `@za38.03/agent-ui-web-component` | 自动解析声明文件，类型导入示例见 [Web Component API](/development/web-component-api)。 |

模块工程在客户端入口导入一次即可，构建工具会将资源纳入业务产物：

```ts
import '@za38.03/agent-ui-web-component/register';
```

`dist/` 是包内文件位置；业务代码使用上表公开入口。浏览器的 `<script src>` 需要可访问的 HTTP 资源地址，**不能直接填写 npm 包名**。

## 加载独立脚本

纯 HTML 或采用静态资源接入的工程，**先把已安装包的脚本复制到业务静态目录**。在工程根目录新建 `scripts/copy-agent-ui.mjs`：

```js
import { mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
await mkdir('public', { recursive: true });
await copyFile(
  require.resolve('@za38.03/agent-ui-web-component/agent-ui.js'),
  'public/agent-ui.js',
);
```

在工程根目录运行，或将它接入现有构建流程：

```sh
node scripts/copy-agent-ui.mjs
```

示例使用 Vite 等工程常见的 `public/` 静态目录；其他宿主将目标改为自己的静态目录。将文件随业务页面部署后，通过 classic script 加载：

```html
<script src="/agent-ui.js"></script>
<style>agent-ui { display: block; height: 520px; }</style>
<agent-ui endpoint="/api/agent" locale="zh-CN" theme="light"></agent-ui>
```

`/agent-ui.js` 对应复制后部署在站点根目录的文件。子目录部署按实际 URL 修改 `src`；React 和样式已包含在脚本中。

## 更新官方资源与定制资源

使用官方默认界面时，按[更新中心](/updates/)选择兼容版本并升级依赖。模块接入重新构建和部署业务工程；静态接入还需重新执行复制脚本，并按业务的资源版本或缓存策略发布新文件。**只升级 npm 包不会替换已部署的静态文件**。

定制布局或组件后，按[React 工程产物接入](/development/vue#定制-react-产物接入)构建并部署自己的 ESM 资源，使用 `type="module"` 或动态 import 加载。

## 配置与事件

```js
// 已加载上面的脚本；在宿主页面的空容器中挂载一份组件。
const element = document.createElement('agent-ui');
const onReady = event => console.log(event.detail.threadId);
element.addEventListener('agent-ready', onReady);
element.config = { endpoint: '/api/agent' };
document.querySelector('#assistant-container').append(element);
// Host 卸载时移除监听并 element.remove()。
```

页面先准备 `<div id="assistant-container" style="height: 520px"></div>`，使用这段代码时替换前面的静态 `<agent-ui>` 标签，避免挂载两份。先绑定监听再插入元素，才能可靠收到首次就绪事件；对已显示的元素再绑定，不会补发过去的事件。TypeScript 类型见 [Web Component API](./web-component-api#配置与事件类型)。

配置优先级、更新及卸载行为见[Web Component API](/development/web-component-api#attributes-与优先级)。

## 样式与定制

CSS 随脚本进入 Shadow Root，业务页面控制组件高度和继承的字体；默认高度为 `100dvh`。
