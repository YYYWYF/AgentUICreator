---
title: 在 HTML 和其他宿主中嵌入
---

# 在 HTML 和其他宿主中嵌入

独立 Web Component 将 React、Runtime 与所选 Plugin 构建到部署资源中。Host 不编译 TSX，但需要现代 Custom Elements、Shadow DOM 等浏览器能力。

## 加载独立脚本

将已安装包的公开 `agent-ui.js` 放到业务静态目录，通过 classic script 加载：

```html
<script src="/agent-ui.js"></script>
<style>agent-ui { display: block; height: 520px; }</style>
<agent-ui endpoint="/api/agent" locale="zh-CN" theme="light"></agent-ui>
```

模块工程可使用 `import '@za38.03/agent-ui-web-component/register'`。React producer 构建 ESM 时，改用 `type="module"` 或动态 import，不能混用 classic 加载方式。

## 配置与事件

```js
const element = document.querySelector('agent-ui');
element.config = { endpoint: '/api/agent', conversationDataEndpoint: '/api' };
const onReady = event => console.log(event.detail.threadId);
element.addEventListener('agent-ready', onReady);
// Host 卸载时移除监听并 element.remove()。
```

每次分配新 `config` 对象，修改 getter 返回对象不会更新界面。config 中存在的字段优先于 attributes。ready 说明组合已挂载，不保证网络健康；错误从 `agent-error` 获取。

修改 endpoint、threadId 或历史 base 会重建会话并取消当前运行。主题/语言更新保留 Runtime 与草稿。卸载元素会释放服务，重连创建新会话环境。

## 样式与定制

CSS 随脚本进入 Shadow Root，Host 控制元素高度和继承字体；默认高度为 `100dvh`。复杂组件定制在 producer 内完成，不能通过任意 JSON 注入未打包的 React 组件。

> 截图待补：固定高度 HTML 嵌入及强 Host 全局样式下的隔离效果，包含弹层位置。

完整字段见[Web Component API](./web-component-api)。
