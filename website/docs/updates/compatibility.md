---
title: 兼容性与支持矩阵
---

# 兼容性与支持矩阵

下表来自当前包元数据和平台清单，是安装/接口约束，不等于所有组合已做真实环境验收。

| 项目 | 当前约束与说明 |
| --- | --- |
| Creator Node | `^20.19.0 || >=22.12.0`。 |
| 原生 React | 相关公开 peers 为 `>=18 <20`，React/React DOM 版本匹配。 |
| Creator Vite API | Creator 声明的 Vite peer 为 `>=8`；使用其他 Dock 适配按其入口验证。 |
| Creator Windows | win32-x64；不从 x64 包推断 Windows ARM 原生支持。 |
| Creator macOS | darwin-x64、darwin-arm64。 |
| Creator Linux | linux-x64、linux-arm64，当前 GNU/glibc target；不声称 musl 通用。 |
| Web Component | 现代 Custom Elements、Shadow DOM、ESM 等浏览器能力；legacy 指 Host 框架，不含 IE。 |
| 升级执行器 | 独立 npm/pnpm 有锁工程；共享 workspace、yarn/bun 等见限制。 |

## 相关包

Core、Renderer、Runtime、Plugins、Web Component、Creator 与 Operator 分别拥有独立版本。用户按正常流程安装 Creator，由它选择工具内部依赖，无需第二次安装。

真实推荐组合以审核兼容清单及实际 npm 产物为准。目前正式发行历史为空，不生成虚假的「自 vX 起支持」或跨包支持标签。

## 验收证据

入门教程既有业务工程记录来自 macOS。本文写作和文档构建在 Windows 进行，不等于全部产品、每个后端和每个平台安装均已验收。path.win32 fixture 只能证明特定路径逻辑。

版本支持判断需同时考虑包 peers、Host 工具、UI 栈、浏览器、架构和实际测试。部署前按自己的目标组合运行独立检查。

> 截图待补：真实安装身份与目标环境信息；每项验收附平台与日期，不用一张成功页面代表全矩阵。
