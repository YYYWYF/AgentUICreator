# scripts 整理验证（2026-10-21）

## 范围

- 删除 22 个历史验收入口和 1 个专用 registry helper；临时归档副本及归档 README 也按用户要求删除。
- 删除 `scripts/start-creator-python.sh`：全仓静态扫描没有调用，现行 `creator:python` 命令使用跨平台 `start-creator-python.mjs`。
- 所有现行开发、构建、测试、发布、手动维护入口及类型声明保留原路径；未改变 package 命令或 CI。
- 新增 scripts 使用说明，更新 Creator refresh 报告，不再保留已删除入口的可运行路径描述。

## Windows 验证

在 Windows / PowerShell / Node 23.11.1 / pnpm 8.12.0 下执行。

| 检查 | 结果 |
| --- | --- |
| 整理前后 16 份活动 package.json 的 scripts 对比 | 完全一致 |
| package 命令中的 153 处脚本路径 | 全部存在；包含 pnpm --filter 改变执行目录的情况 |
| 初次整理时的 78 个 JS/TS 脚本与声明语法检查 | 通过；包含后来删除的历史脚本，不能作为最终文件数量 |
| 原路径及旧 Bash 入口引用扫描 | 活动代码、package 命令和 CI 无残留调用 |
| 7 个根目录 `.test.mjs` 文件 | 23 项中 22 通过、1 失败，原因如下 |
| host-examples/ensure-managed-plugins.test.ts | 2 项通过 |
| pnpm check:assistant-ui-agui-compat | PASS |
| pnpm check:assistant-ui-langgraph-compat | PASS |
| pnpm check:assistant-ui-agui-lockfile | PASS |
| pnpm check:operator-contract | PASS |
| git diff --check | 通过 |

通过的脚本测试覆盖依赖准备、Windows pnpm 进程调用、准备状态与缓存、Workbench 子进程准备复用、Python runner 参数与环境、兼容发布元数据、Host Plugin 更新错误处理等。

## 限制

唯一脚本测试失败为 `package-ownership.test.mjs` 的包所有权用例：找不到 `packages/web-component/dist/types.d.ts`。该测试和对应构建脚本没有修改；此环境先前的 Web Component 构建被 Host 初始化校验阻塞，参见 [0.0.66 回退验证](react-ag-ui-0.0.66-2026-10-21.md)。不能将该用例标记为通过。

删除历史脚本后再次核对活动 package 命令定义、入口路径及保留脚本内容，均未改变；确认没有保留归档文件，也没有活动代码引用已删除入口。上述测试和命令结果来自删除前的整理验证；删除后未重复完整测试，没有重放历史脚本中的安装、源码接管、合并和会话续跑操作。

没有重新执行完整 workspace 构建、所有测试、发布、真实模型或浏览器验收。
