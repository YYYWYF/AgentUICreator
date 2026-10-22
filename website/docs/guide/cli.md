---
title: Creator CLI 参数
---

# Creator CLI 参数

安装的命令为 `agent-ui-creator`。它属于开发工具，默认启动本地工具服务，不启动目标工程的业务 dev server。

| 参数 | 短名 | 行为 |
| --- | --- | --- |
| `--project <目录>` | `-p` | 预选目标工程；路径按当前启动目录解析。图形模式省略时由界面选择。 |
| `--config-root <目录>` | `-c` | `.env.agentui.local` 所在工具目录；默认当前工作目录。 |
| `--message <需求>` | `-m` | 终端执行单次需求；未传 project 时以当前目录为目标，结束后释放 client。 |
| `--port <数字>` | 无 | 工具端口，0–65535 整数；显式端口占用时报错。 |
| `--no-open` | 无 | 不自动打开独立启动页。 |
| `--help` | `-h` | 输出帮助，不启动服务。 |

```sh
agent-ui-creator --project "C:\work\my-app" --port 47833 --no-open
agent-ui-creator --project "C:\work\my-app" --config-root "C:\work\tools" --message "说明当前界面组成，暂不修改文件"
```

## 默认值和退出

端口优先使用 `--port`，其次进程 `CREATOR_PORT`。未显式设置时常规默认 47832，可在占用时选择可用端口；以实际终端 URL 为准。0 用于请求动态端口，不适合固定 Dock 地址。

`CREATOR_OPEN_BROWSER=0` 也可阻止自动打开。Windows 脚本不要使用 Bash 内联赋值，优先 `--no-open` 或 Host 提供的环境配置。

按 Ctrl+C 正常停止并等待清理。CLI 错误设置失败退出状态，打开浏览器失败会显示可手动访问的地址；不要把开浏览器失败当成服务已退出。

## 注意事项

`--project` 只预选，不自动初始化。终端修改请求仍受权限、确认与工具合同约束；需要持续图形澄清时使用界面。不要将模型密钥写进命令行参数或 shell 历史。

> 截图待补：`--help` 与显式端口启动的终端输出，保留实际 URL 和停止说明。
