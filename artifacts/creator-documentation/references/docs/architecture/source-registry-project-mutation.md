# Source 资源与项目事务

Source Registry 是 Plugins 包内的 catalog/快照能力；Node 存储和项目操作属于 Creator 内部 Operator，不是独立发布包，也不进入生产浏览器。

## 入口与职责

当前实现位于 `packages/creator/operator/src/project/source-registry/project-mutation.ts`。项目操作使用 applyAgentUISourceProjectMutation、removeAgentUISourceProjectMutation 及对应受控入口；低层 storage API 只管理文件、来源和依赖，不独自承诺 Registry、组合和项目验证完成。

源码存在与 AppUIModel 组合是不同事实。安装资源不等于自动启用插件，移除资源也不能隐式删除仍被组合或其他资源引用的实现。

## 事务与恢复

Host 对受影响源码、source-lock 和派生 Registry 保存事务前状态，使用原子 journal、项目互斥、预期 hash 和验证保护提交。活动 journal 由原拥有进程管理，不能把仍在运行的进程当成崩溃进行恢复。

恢复先核对 journal 与拥有者，再恢复本次写入；后续外部编辑由内容冲突检查保护。失败或恢复未完成时准确报告保留的状态，不覆盖用户新增内容。

项目操作刷新受影响派生产物并执行对应检查；changed=false 不代替后置状态核验。移除前检查组合引用和依赖消费者，不能把“隐藏”当成允许删除来源文件。

## 安装、接管和同步

官方 npm Plugin 优先使用项目薄应用层。首次源码接管绑定实际安装版本、准确文件闭包和用户同意，保留单一注册引用；实现同步使用 BASE/LOCAL/TARGET，只合并实现子树。

Source 文件事务不等于依赖安装事务，也不扩大为 npm 安装失败恢复。完整边界见 [源码所有权](npm-default-plugin-source-ownership.md) 和 [统一更新中心](unified-update-center.md)。
