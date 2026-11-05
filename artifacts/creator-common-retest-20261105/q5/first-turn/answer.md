我先读取 `agent-identity` 的公开 props 与项目应用入口，确认头像当前是怎么配置的。我已确认改动位置：`agent-identity` 是项目自有应用入口（`plugins/agent-identity/index.tsx`），它把 props 透传给实现，目前**没有设置任何 `logo`**，所以头像用的是内置默认值。公开 props 里正好有 `logo`（字符串，通常填图片地址）和 `logoProps`（给 `<img>` 的属性）。也就是说，改头像只需要在这一个文件里传参，不用接管 npm 实现。

项目里目前**没有任何图片资源文件**（整个 `/src/agent-ui` 下没有 png/svg/webp 等，也没有 public/assets 目录），所以缺的是图片本身——这个我无法凭空知道。
